import { clone } from "../keyed-editor/protocol.mjs";
import { createSessionTreeHost } from "../session-tree/host.mjs";

const SESSION_TREE_METHODS = [
  "create", "createChild", "tree", "list", "snapshot", "dispatch", "effects", "complete",
  "audit", "dispose", "disposeTree",
];
const COMPOSITION_METHODS = ["setChildInputs", "publish", "changes"];
const MUTATING_METHODS = new Set([
  "create", "createChild", "dispatch", "complete", "dispose", "disposeTree", "setChildInputs", "publish",
]);
const managerOwners = new WeakMap();

function fail(message, cause) {
  return new Error(`composition host: ${message}`, cause === undefined ? undefined : { cause });
}

function assertManager(manager) {
  if (!manager || typeof manager !== "object" || Array.isArray(manager)) {
    throw fail("manager bridge is required");
  }
  for (const method of [...SESSION_TREE_METHODS, ...COMPOSITION_METHODS]) {
    if (typeof manager[method] !== "function") throw fail(`manager bridge must expose ${method}()`);
  }
  if (managerOwners.has(manager)) throw fail("manager already has an active composition host");
}

function assertNoErrorFrame(method, result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const keys = Object.keys(result);
  if (keys.length === 1 && keys[0] === "error" && typeof result.error === "string") {
    throw fail(`gobiComposition.${method} returned error frame: ${result.error}`);
  }
  return result;
}

function checkedChanges(value) {
  if (!Array.isArray(value)) throw fail("manager.changes() must return an array");
  let prior = 0;
  return value.map((id, index) => {
    if (!Number.isSafeInteger(id) || id <= prior) {
      throw fail(`manager.changes() entry ${index} must be a positive, sorted, unique safe session ID`);
    }
    prior = id;
    return id;
  });
}

/**
 * Coordinate Go-owned typed composition with the existing session-tree host.
 * This layer only schedules dirty snapshot refreshes; application state and
 * publication policy remain inside the manager.
 */
export function createCompositionHost({ manager, descriptors, transportFactory } = {}) {
  assertManager(manager);
  const lease = {};
  managerOwners.set(manager, lease);

  let treeHost;
  try {
    let propagationScheduled = false;
    let propagationRunning = false;
    let propagateAgain = false;
    let mutationVersion = 0;
    const propagationErrors = [];
    const propagationWaiters = [];

    function assertOwner() {
      if (managerOwners.get(manager) !== lease) throw fail("manager ownership has been retired");
    }

    function callManager(method, args) {
      assertOwner();
      let result;
      // Preserve caller objects through the manager boundary. In particular,
      // input records must reach the strict bridge intact so it can reject
      // symbols, accessors, and inherited fields without invoking getters.
      try { result = Reflect.apply(manager[method], manager, args); }
      catch (error) { throw fail(`gobiComposition.${method}() failed`, error); }
      return clone(assertNoErrorFrame(method, result));
    }

    function settlePropagationWaiters() {
      if (propagationScheduled || propagationRunning || propagationWaiters.length === 0) return;
      const waiters = propagationWaiters.splice(0);
      const errors = propagationErrors.splice(0);
      if (errors.length) {
        const aggregate = new AggregateError(errors, "composition host dirty refresh failed");
        for (const waiter of waiters) waiter.reject(aggregate);
      } else {
        for (const waiter of waiters) waiter.resolve();
      }
    }

    function recordPropagationError(error) {
      propagationErrors.push(error instanceof Error ? error : fail(String(error)));
    }

    function drainChanges() {
      const changed = checkedChanges(callManager("changes", []));
      if (changed.length === 0) return false;

      const live = new Set(treeHost.tree().map((entry) => entry.SessionID));
      for (const id of changed) {
        // Go removes dead dirty IDs. Keep this fence as well so an already
        // queued refresh cannot reach a disposed or subsequently recreated node.
        if (!live.has(id)) continue;
        try { treeHost.refresh(id); }
        catch (error) { recordPropagationError(error); }
      }
      return true;
    }

    function runPropagation() {
      propagationScheduled = false;
      if (propagationRunning) {
        propagateAgain = true;
        return;
      }
      propagationRunning = true;
      try {
        let passes = 0;
        do {
          propagateAgain = false;
          try {
            while (drainChanges()) {
              passes += 1;
              if (passes > 1000) throw fail("dirty refresh did not reach quiescence");
            }
          } catch (error) {
            recordPropagationError(error);
            break;
          }
        } while (propagateAgain);
      } finally {
        propagationRunning = false;
      }
      if (propagateAgain) schedulePropagation();
      settlePropagationWaiters();
    }

    function schedulePropagation() {
      mutationVersion += 1;
      if (propagationRunning) {
        propagateAgain = true;
        return;
      }
      if (propagationScheduled) return;
      propagationScheduled = true;
      queueMicrotask(runPropagation);
    }

    const wrappedManager = {};
    for (const method of SESSION_TREE_METHODS) {
      wrappedManager[method] = (...args) => {
        const result = callManager(method, args);
        if (MUTATING_METHODS.has(method)) schedulePropagation();
        return result;
      };
    }

    treeHost = createSessionTreeHost({ manager: wrappedManager, descriptors, transportFactory });

    function waitForPropagation() {
      return new Promise((resolve, reject) => {
        propagationWaiters.push({ resolve, reject });
        settlePropagationWaiters();
      });
    }

    async function settled() {
      const errors = [];
      for (let pass = 0; pass < 1000; pass += 1) {
        const startingVersion = mutationVersion;
        try { await treeHost.settled(); }
        catch (error) { errors.push(error); }
        try { await waitForPropagation(); }
        catch (error) { errors.push(error); }
        try { await treeHost.settled(); }
        catch (error) { errors.push(error); }

        if (!propagationScheduled && !propagationRunning && mutationVersion === startingVersion) {
          if (errors.length === 1) throw errors[0];
          if (errors.length > 1) throw new AggregateError(errors, "composition host settled work failed");
          return;
        }
      }
      throw fail("settled() did not reach quiescence");
    }

    function setChildInputs(parentID, childID, inputs) {
      const result = callManager("setChildInputs", [parentID, childID, inputs]);
      schedulePropagation();
      return result;
    }

    function publish(childID, rowID, inputRevision) {
      const result = callManager("publish", [childID, rowID, inputRevision]);
      schedulePropagation();
      return result;
    }

    return {
      ...treeHost,
      settled,
      setChildInputs,
      publish,
    };
  } catch (error) {
    if (managerOwners.get(manager) === lease) managerOwners.delete(manager);
    throw error;
  }
}
