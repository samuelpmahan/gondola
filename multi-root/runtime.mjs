import { clone } from "../keyed-editor/protocol.mjs";

function fail(message, cause) {
  return new Error(`multi-root runtime: ${message}`, cause === undefined ? undefined : { cause });
}

const MANAGER_METHODS = ["create", "snapshot", "dispatch", "effects", "complete", "audit", "dispose", "list"];
const managerAdapters = new WeakSet();

export function assertMultiRootManager(manager) {
  if (!manager || typeof manager !== "object" || Array.isArray(manager)) {
    throw fail("manager bridge is required");
  }
  for (const method of MANAGER_METHODS) {
    if (typeof manager[method] !== "function") throw fail(`manager bridge must expose ${method}()`);
  }
  return manager;
}

/** Adapt the strict Go bridge's returned error frames to JavaScript throws. */
export function createMultiRootManagerAdapter(manager) {
  assertMultiRootManager(manager);
  if (managerAdapters.has(manager)) return manager;
  const adapter = {};
  for (const method of MANAGER_METHODS) {
    const call = manager[method];
    adapter[method] = (...args) => {
      const result = Reflect.apply(call, manager, args);
      if (result !== null && typeof result === "object" && !Array.isArray(result)) {
        const keys = Object.keys(result);
        if (keys.length === 1 && keys[0] === "error" && typeof result.error === "string") {
          throw fail(`gobiMultiRoot.${method} returned error frame: ${result.error}`);
        }
      }
      return result;
    };
  }
  managerAdapters.add(adapter);
  return adapter;
}

function assertSessionID(sessionID) {
  if (!Number.isSafeInteger(sessionID) || sessionID <= 0) {
    throw fail("session ID must be a positive safe integer");
  }
  return sessionID;
}

/**
 * Adapt the multi-session Go bridge to the singleton runtime expected by one
 * keyed host. This adapter only scopes calls; it has no application logic.
 */
export function createSessionRuntime(manager, sessionID, isCurrent = () => true) {
  manager = createMultiRootManagerAdapter(manager);
  assertSessionID(sessionID);
  if (typeof isCurrent !== "function") throw fail("isCurrent must be a function");

  function assertCurrent() {
    if (!isCurrent()) throw fail(`session ${sessionID} is no longer the current root generation`);
  }

  return {
    init() {
      assertCurrent();
      return clone(manager.snapshot(sessionID));
    },
    dispatch(step) {
      assertCurrent();
      return clone(manager.dispatch(sessionID, step));
    },
    complete(reply) {
      assertCurrent();
      return clone(manager.complete(sessionID, reply));
    },
    effects() {
      assertCurrent();
      return clone(manager.effects(sessionID));
    },
    audit() {
      assertCurrent();
      return clone(manager.audit(sessionID));
    },
  };
}
