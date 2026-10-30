import { clone, normalizePath, validateSnapshot } from "./protocol.mjs";

// A Go Session is a singleton bridge. Lease its exact runtime object while a
// host is active so a second host cannot reset the same Go state underneath it.
const runtimeOwners = new WeakMap();

function fail(message, cause) {
  return new Error(`keyed host: ${message}`, cause === undefined ? undefined : { cause });
}

function backendEntries(renderers) {
  if (renderers instanceof Map) return [...renderers.entries()];
  if (!renderers || typeof renderers !== "object" || Array.isArray(renderers)) {
    throw fail("renderers must be a name-to-mount-function object or Map");
  }
  return Object.entries(renderers);
}

function clearRoot(root) {
  try { root.replaceChildren(); } catch { /* retain the lifecycle failure */ }
}

function assertEffects(commands) {
  if (!Array.isArray(commands)) throw fail("runtime.effects() must return an array");
  return commands.map((command, index) => {
    if (!command || typeof command !== "object" || Array.isArray(command) ||
        !Number.isSafeInteger(command.ID) || command.ID <= 0) {
      throw fail(`effect ${index} must contain a positive safe ID`);
    }
    if (command.Kind === "start" && typeof command.Value === "string") {
      return { Kind: "start", ID: command.ID, Value: command.Value };
    }
    if (command.Kind === "cancel") return { Kind: "cancel", ID: command.ID };
    throw fail(`effect ${index} has unsupported Kind or Value`);
  });
}

function assertReply(reply) {
  if (!reply || typeof reply !== "object" || Array.isArray(reply) ||
      !Number.isSafeInteger(reply.ID) || reply.ID <= 0 ||
      typeof reply.Value !== "string" || typeof reply.Error !== "string") {
    throw fail("transport reply must contain a positive safe ID and string Value and Error");
  }
  return { ID: reply.ID, Value: reply.Value, Error: reply.Error };
}

function assertRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") throw fail("runtime is required");
  for (const method of ["init", "dispatch", "complete", "effects", "audit"]) {
    if (typeof runtime[method] !== "function") throw fail(`runtime must expose ${method}()`);
  }
}

function assertTransport(transport) {
  if (!transport || typeof transport.start !== "function" || typeof transport.cancel !== "function") {
    throw fail("transport must expose start(command, deliver) and cancel(id)");
  }
}

/**
 * Own one Go snapshot across keyed DOM/React renderers and the existing async
 * effect transport. Renderer events update themselves synchronously; queued
 * HTTP completions update the selected renderer in place.
 */
export function createKeyedHost(root, runtime, renderers, transport, initialBackend = "dom") {
  if (!root || typeof root.replaceChildren !== "function") throw fail("root must support replaceChildren()");
  assertRuntime(runtime);
  assertTransport(transport);

  const mounts = new Map();
  for (const [name, mount] of backendEntries(renderers)) {
    if (typeof name !== "string" || name.length === 0) throw fail("renderer names must be non-empty strings");
    if (typeof mount !== "function") throw fail(`renderer ${JSON.stringify(name)} must be a mount function`);
    if (mounts.has(name)) throw fail(`duplicate renderer name ${JSON.stringify(name)}`);
    mounts.set(name, mount);
  }
  if (!mounts.has(initialBackend)) throw fail(`unknown renderer ${JSON.stringify(initialBackend)}`);

  if (runtimeOwners.has(runtime)) {
    throw fail("runtime already has a live keyed host; unmount it before creating another");
  }
  const lease = {};
  runtimeOwners.set(runtime, lease);
  function releaseRuntimeLease() {
    if (runtimeOwners.get(runtime) === lease) runtimeOwners.delete(runtime);
  }

  let cachedSnapshot;
  try {
    cachedSnapshot = clone(validateSnapshot(runtime.init()));
  } catch (error) {
    releaseRuntimeLease();
    throw fail("runtime.init() returned an invalid snapshot", error);
  }

  let lifecycle = "active";
  let selectedName = null;
  let selectedRenderer = null;
  let owner = null;
  let generation = 0;
  let failureCause = null;
  const queuedJobs = [];
  const queuedErrors = [];
  const settledWaiters = [];
  let pumpScheduled = false;
  let pumping = false;
  // Keep records after cancel or reply so duplicate and late deliveries remain
  // observable to Go until this host is disposed.
  const requests = new Map();

  function assertUsable() {
    if (lifecycle === "disposed") throw fail("host has been disposed");
    if (lifecycle === "failed") throw fail("host is unusable after a renderer lifecycle failure", failureCause);
  }

  function settleWaiters() {
    if (pumpScheduled || pumping || queuedJobs.length !== 0) return;
    const waiters = settledWaiters.splice(0);
    if (!waiters.length) return;
    const errors = queuedErrors.splice(0);
    if (errors.length) {
      const aggregate = new AggregateError(errors, "keyed host queued work failed");
      for (const waiter of waiters) waiter.reject(aggregate);
    } else {
      for (const waiter of waiters) waiter.resolve();
    }
  }

  function runPump() {
    pumpScheduled = false;
    if (pumping) return;
    pumping = true;
    try {
      while (queuedJobs.length > 0) {
        const task = queuedJobs.shift();
        try { task(); }
        catch (error) { queuedErrors.push(error instanceof Error ? error : fail(String(error))); }
      }
    } finally {
      pumping = false;
    }
    if (queuedJobs.length > 0) schedulePump();
    else settleWaiters();
  }

  function schedulePump() {
    if (pumpScheduled || pumping) return;
    pumpScheduled = true;
    queueMicrotask(runPump);
  }

  function enqueue(task) {
    queuedJobs.push(task);
    schedulePump();
  }

  function snapshot() {
    assertUsable();
    return clone(cachedSnapshot);
  }

  function audit() {
    assertUsable();
    const result = runtime.audit();
    if (!Array.isArray(result)) throw fail("runtime.audit() must return an array");
    return clone(result);
  }

  // A renderer catches native-event failures to keep them out of the browser's
  // event loop. Notify the host before that callback returns so a drain job
  // queued by dispatch() cannot start effects after the paint failed.
  function reportRendererFailure(token, error) {
    if (lifecycle !== "active" || owner !== token || !token.ready) return false;
    const failure = fail(`renderer ${JSON.stringify(token.name)} failed while handling an event`, error);
    lifecycle = "failed";
    failureCause = failure;
    owner = null;
    queuedErrors.push(failure);
    enqueue(() => {
      const renderer = selectedRenderer;
      selectedRenderer = null;
      try {
        if (renderer) renderer.unmount();
      } catch (cleanupError) {
        queuedErrors.push(fail(`renderer ${JSON.stringify(token.name)} cleanup after event failure failed`, cleanupError));
      } finally {
        clearRoot(root);
      }
    });
    return true;
  }

  function facadeFor(token) {
    function assertOwner() {
      assertUsable();
      if (owner !== token) throw fail("stale renderer cannot access the Go runtime");
    }
    return {
      init() {
        assertOwner();
        return clone(cachedSnapshot);
      },
      dispatch(step) {
        assertOwner();
        if (!token.ready) throw fail("renderer cannot dispatch before mount completes");
        let next;
        try {
          next = clone(validateSnapshot(runtime.dispatch(step)));
        } catch (error) {
          throw fail("runtime.dispatch() returned an invalid snapshot", error);
        }
        cachedSnapshot = next;
        enqueue(drainEffects);
        return clone(next);
      },
      rendererFailed(error) {
        return reportRendererFailure(token, error);
      },
    };
  }

  function validateRenderer(name, api) {
    if (!api || typeof api !== "object") throw fail(`renderer ${JSON.stringify(name)} must return an API object`);
    for (const method of ["update", "snapshot", "domSnapshot", "click", "focusState", "restoreFocus", "unmount"]) {
      if (typeof api[method] !== "function") {
        throw fail(`renderer ${JSON.stringify(name)} API must provide ${method}()`);
      }
    }
    return api;
  }

  function mount(name) {
    const token = { generation: ++generation, name, ready: false };
    owner = token;
    let api = null;
    try {
      api = mounts.get(name)(root, facadeFor(token));
      validateRenderer(name, api);
      token.ready = true;
      return api;
    } catch (error) {
      if (owner === token) owner = null;
      if (api && typeof api.unmount === "function") {
        try { api.unmount(); } catch { /* keep the mount error */ }
      }
      clearRoot(root);
      throw error;
    }
  }

  function domSnapshot() {
    assertUsable();
    const result = selectedRenderer.domSnapshot();
    if (!result || typeof result !== "object" || Array.isArray(result) ||
        typeof result.html !== "string" || !Array.isArray(result.disabled)) {
      throw fail(`renderer ${JSON.stringify(selectedName)} domSnapshot() must return {html, disabled}`);
    }
    const copy = { html: result.html, disabled: clone(result.disabled) };
    if (Object.hasOwn(result, "nodes")) copy.nodes = clone(result.nodes);
    return copy;
  }

  function failLifecycle(message, error) {
    owner = null;
    lifecycle = "failed";
    failureCause = error;
    const renderer = selectedRenderer;
    selectedRenderer = null;
    try { if (renderer) renderer.unmount(); } catch { /* preserve lifecycle error */ }
    clearRoot(root);
    throw fail(message, error);
  }

  function click(path) {
    assertUsable();
    try {
      selectedRenderer.click(normalizePath(path));
    } catch (error) {
      failLifecycle(`renderer ${JSON.stringify(selectedName)} click failed; host is now unusable`, error);
    }
    return clone(cachedSnapshot);
  }

  function focusState() {
    assertUsable();
    return clone(selectedRenderer.focusState());
  }

  function backendName() {
    assertUsable();
    return selectedName;
  }

  function replaceBackend(name) {
    assertUsable();
    if (typeof name !== "string" || !mounts.has(name)) throw fail(`unknown renderer ${JSON.stringify(name)}`);
    if (name === selectedName) return clone(cachedSnapshot);

    const oldName = selectedName;
    const oldRenderer = selectedRenderer;
    let focus;
    try { focus = clone(oldRenderer.focusState()); }
    catch (error) { throw fail(`renderer ${JSON.stringify(oldName)} could not capture focus state`, error); }

    owner = null;
    try {
      oldRenderer.unmount();
    } catch (error) {
      failLifecycle(`could not unmount renderer ${JSON.stringify(oldName)}`, error);
    }
    selectedRenderer = null;
    selectedName = null;
    clearRoot(root);

    try {
      const nextRenderer = mount(name);
      selectedRenderer = nextRenderer;
      selectedName = name;
      nextRenderer.restoreFocus(focus);
      return clone(cachedSnapshot);
    } catch (mountError) {
      owner = null;
      const failedRenderer = selectedRenderer;
      selectedRenderer = null;
      selectedName = null;
      try { if (failedRenderer) failedRenderer.unmount(); } catch { /* retain mount/restore failure */ }
      clearRoot(root);
      try {
        selectedRenderer = mount(oldName);
        selectedRenderer.restoreFocus(focus);
        selectedName = oldName;
      } catch (rollbackError) {
        try { if (selectedRenderer) selectedRenderer.unmount(); } catch { /* preserve rollback error */ }
        selectedRenderer = null;
        selectedName = null;
        failLifecycle(
          `renderer ${JSON.stringify(name)} failed to mount and rollback to ${JSON.stringify(oldName)} also failed`,
          new AggregateError([mountError, rollbackError], "renderer replacement and rollback failed"),
        );
      }
      throw fail(`renderer ${JSON.stringify(name)} failed to mount; restored ${JSON.stringify(oldName)}`, mountError);
    }
  }

  function enqueueDelivery(reply) {
    let copied;
    try { copied = assertReply(reply); }
    catch (error) {
      queuedErrors.push(error);
      return;
    }
    const record = requests.get(copied.ID);
    if (record) record.delivered = true;
    enqueue(() => {
      if (lifecycle !== "active") return;
      let next;
      try {
        next = clone(validateSnapshot(runtime.complete(copied)));
      } catch (error) {
        throw fail("runtime.complete() returned an invalid snapshot", error);
      }
      cachedSnapshot = next;
      try {
        selectedRenderer.update(clone(next));
      } catch (error) {
        failLifecycle(`renderer ${JSON.stringify(selectedName)} update failed after HTTP completion`, error);
      }
      enqueue(drainEffects);
    });
  }

  function drainEffects() {
    if (lifecycle !== "active") return;
    const commands = assertEffects(runtime.effects());
    for (const command of commands) {
      if (lifecycle !== "active") return;
      try {
        if (command.Kind === "cancel") {
          const previous = requests.get(command.ID);
          transport.cancel(command.ID);
          if (previous) previous.cancelled = true;
          continue;
        }

        const record = { command: clone(command), cancelled: false, delivered: false, started: false };
        if (requests.has(command.ID)) throw fail(`Go reused transport request ID ${command.ID}`);
        requests.set(command.ID, record);
        record.started = true;
        transport.start(clone(command), (reply) => enqueueDelivery(reply));
      } catch (error) {
        const method = command.Kind === "cancel" ? "cancel" : "start";
        queuedErrors.push(fail(`transport.${method}(${command.ID}) failed`, error));
      }
    }
  }

  function settled() {
    if (lifecycle === "disposed") throw fail("host has been disposed");
    return new Promise((resolve, reject) => {
      settledWaiters.push({ resolve, reject });
      if (!pumpScheduled && !pumping && queuedJobs.length === 0) settleWaiters();
    });
  }

  function unmount() {
    if (lifecycle === "disposed") throw fail("host has been disposed");
    lifecycle = "disposed";
    owner = null;
    const renderer = selectedRenderer;
    selectedRenderer = null;
    selectedName = null;
    const cleanupErrors = [];
    for (const [id, record] of requests) {
      if (!record.started || record.cancelled || record.delivered) continue;
      record.cancelled = true;
      try { transport.cancel(id); }
      catch (error) { cleanupErrors.push(fail(`transport.cancel(${id}) during unmount failed`, error)); }
    }
    try {
      if (renderer) renderer.unmount();
    } catch (error) {
      cleanupErrors.push(fail("renderer unmount failed", error));
    } finally {
      clearRoot(root);
      releaseRuntimeLease();
    }
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "keyed host unmount failed");
  }

  try {
    selectedRenderer = mount(initialBackend);
    selectedName = initialBackend;
  } catch (error) {
    lifecycle = "failed";
    failureCause = error;
    owner = null;
    clearRoot(root);
    releaseRuntimeLease();
    throw error;
  }

  return {
    snapshot,
    audit,
    domSnapshot,
    focusState,
    click,
    replaceBackend,
    backendName,
    flush: settled,
    settled,
    unmount,
  };
}
