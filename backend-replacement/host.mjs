// Owns the one long-lived runtime and routes it through one renderer at a time.
// A renderer is a function `(root, runtimeFacade) => rendererApi`; the facade's
// init() reads the host's latest snapshot and dispatch() is fenced to the
// renderer generation that received it.

function fail(message, cause) {
  const error = new Error(`backend host: ${message}`, cause === undefined ? undefined : { cause });
  return error;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const copy = {};
    for (const [key, item] of Object.entries(value)) copy[key] = clone(item);
    return copy;
  }
  return value;
}

function assertSnapshot(snapshot, operation) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw fail(`${operation} must return a snapshot object`);
  }
  if (snapshot.error) throw fail(`${operation} returned a runtime error: ${snapshot.error}`);
  if (!snapshot.state || typeof snapshot.state !== "object" || Array.isArray(snapshot.state)) {
    throw fail(`${operation} snapshot must contain a state object`);
  }
  if (!snapshot.tree || typeof snapshot.tree !== "object" || Array.isArray(snapshot.tree)) {
    throw fail(`${operation} snapshot must contain a tree object`);
  }
  if (!Array.isArray(snapshot.messages)) {
    throw fail(`${operation} snapshot must contain a messages array`);
  }
  return snapshot;
}

function backendEntries(backends) {
  if (backends instanceof Map) return [...backends.entries()];
  if (!backends || typeof backends !== "object" || Array.isArray(backends)) {
    throw fail("backends must be a name-to-mount-function object or Map");
  }
  return Object.entries(backends);
}

function clearRoot(root) {
  if (root && typeof root.replaceChildren === "function") {
    try {
      root.replaceChildren();
    } catch {
      // Cleanup is best effort. The original mounting/unmounting failure is
      // more useful to the caller and is preserved by the host.
    }
  }
}

/**
 * Create a host for swapping renderers without restarting the runtime.
 *
 * Each backend is a mount function `(root, runtimeFacade) => rendererApi`.
 * The renderer API must provide `snapshot()`, `domSnapshot()`, `click(path)`
 * and `unmount()`. The facade has `init()` and `dispatch(input)` methods. Its
 * init() returns the host's latest cached snapshot; it never calls the real
 * runtime's init(). A stale facade throws if it attempts to dispatch.
 *
 * replaceBackend(name) returns a copy of the latest runtime snapshot. Replacing
 * with the active name is an idempotent no-op. If a new backend fails to mount,
 * the previous backend is mounted again against the latest cached snapshot.
 * Once unmount() is called, every host operation (including a second unmount)
 * throws an explicit disposed-host error.
 */
export function createBackendHost(root, runtime, backends, initialBackend = "dom") {
  if (!root) throw fail("root is required");
  if (!runtime || typeof runtime.init !== "function" || typeof runtime.dispatch !== "function") {
    throw fail("runtime must expose init() and dispatch(input)");
  }

  const entries = backendEntries(backends);
  const mounts = new Map();
  for (const [name, mount] of entries) {
    if (typeof name !== "string" || name.length === 0) {
      throw fail("backend names must be non-empty strings");
    }
    if (typeof mount !== "function") throw fail(`backend ${JSON.stringify(name)} must be a mount function`);
    if (mounts.has(name)) throw fail(`duplicate backend name ${JSON.stringify(name)}`);
    mounts.set(name, mount);
  }
  if (!mounts.has(initialBackend)) {
    throw fail(`unknown backend ${JSON.stringify(initialBackend)}`);
  }

  let cachedSnapshot = clone(assertSnapshot(runtime.init(), "runtime.init()"));
  let selectedName = null;
  let selectedRenderer = null;
  let owner = null;
  let generation = 0;
  let lifecycle = "active";
  let failureCause = null;

  function assertUsable() {
    if (lifecycle === "disposed") throw fail("host has been disposed");
    if (lifecycle === "failed") throw fail("host is unusable after a failed renderer rollback", failureCause);
  }

  function snapshot() {
    assertUsable();
    return clone(cachedSnapshot);
  }

  function facadeFor(token) {
    function assertOwner() {
      assertUsable();
      if (owner !== token) throw fail("stale renderer cannot access the runtime");
    }

    return {
      init() {
        assertOwner();
        return clone(cachedSnapshot);
      },
      dispatch(input) {
        assertOwner();
        if (!token.ready) throw fail("renderer cannot dispatch before mount completes");
        const next = assertSnapshot(runtime.dispatch(input), "runtime.dispatch()");
        cachedSnapshot = clone(next);
        return clone(cachedSnapshot);
      },
    };
  }

  function mount(name) {
    const token = { generation: ++generation, name, ready: false };
    owner = token;
    let returnedApi = null;
    try {
      returnedApi = mounts.get(name)(root, facadeFor(token));
      if (!returnedApi || typeof returnedApi !== "object") {
        throw fail(`backend ${JSON.stringify(name)} must return a renderer API`);
      }
      for (const method of ["snapshot", "domSnapshot", "click", "unmount"]) {
        if (typeof returnedApi[method] !== "function") {
          throw fail(`backend ${JSON.stringify(name)} renderer API must provide ${method}()`);
        }
      }
      token.ready = true;
      return returnedApi;
    } catch (error) {
      if (owner === token) owner = null;
      if (returnedApi && typeof returnedApi.unmount === "function") {
        try {
          returnedApi.unmount();
        } catch {
          // Preserve the original mount error.
        }
      }
      clearRoot(root);
      throw error;
    }
  }

  function unmountRenderer(renderer) {
    renderer.unmount();
  }

  function domSnapshot() {
    assertUsable();
    const snapshot = selectedRenderer.domSnapshot();
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
        typeof snapshot.html !== "string" || !Array.isArray(snapshot.disabled)) {
      throw fail(`backend ${JSON.stringify(selectedName)} domSnapshot() must return { html: string, disabled: array }`);
    }
    return { html: snapshot.html, disabled: clone(snapshot.disabled) };
  }

  function click(path) {
    assertUsable();
    try {
      selectedRenderer.click(path);
    } catch (error) {
      // dispatch() may already have committed this snapshot before the
      // renderer failed to validate or paint it. Keep that accepted runtime
      // state, but fence this renderer and stop the host from dispatching again.
      owner = null;
      lifecycle = "failed";
      failureCause = error;
      throw fail(`renderer ${JSON.stringify(selectedName)} click failed; host is now unusable`, error);
    }
    return clone(cachedSnapshot);
  }

  function backendName() {
    assertUsable();
    return selectedName;
  }

  function replaceBackend(name) {
    assertUsable();
    if (typeof name !== "string" || !mounts.has(name)) {
      throw fail(`unknown backend ${JSON.stringify(name)}`);
    }
    if (name === selectedName) return clone(cachedSnapshot);

    const oldName = selectedName;
    const oldRenderer = selectedRenderer;

    // Fence callbacks before disposing the old renderer so event handlers it
    // retained cannot dispatch while the next backend is mounting.
    owner = null;
    try {
      unmountRenderer(oldRenderer);
    } catch (error) {
      lifecycle = "failed";
      failureCause = error;
      clearRoot(root);
      throw fail(`could not unmount backend ${JSON.stringify(oldName)}`, error);
    }
    selectedRenderer = null;
    clearRoot(root);

    try {
      selectedRenderer = mount(name);
      selectedName = name;
      return clone(cachedSnapshot);
    } catch (mountError) {
      owner = null;
      clearRoot(root);
      try {
        selectedRenderer = mount(oldName);
        selectedName = oldName;
      } catch (rollbackError) {
        owner = null;
        selectedRenderer = null;
        selectedName = null;
        lifecycle = "failed";
        failureCause = rollbackError;
        clearRoot(root);
        throw fail(
          `backend ${JSON.stringify(name)} failed to mount and rollback to ${JSON.stringify(oldName)} also failed`,
          new AggregateError([mountError, rollbackError], "renderer replacement and rollback failed"),
        );
      }
      throw fail(`backend ${JSON.stringify(name)} failed to mount; restored ${JSON.stringify(oldName)}`, mountError);
    }
  }

  try {
    selectedRenderer = mount(initialBackend);
    selectedName = initialBackend;
  } catch (error) {
    lifecycle = "failed";
    failureCause = error;
    owner = null;
    clearRoot(root);
    throw error;
  }

  return {
    snapshot,
    domSnapshot,
    click,
    replaceBackend,
    backendName,
    unmount() {
      if (lifecycle === "disposed") throw fail("host has been disposed");
      lifecycle = "disposed";
      owner = null;
      const renderer = selectedRenderer;
      selectedRenderer = null;
      selectedName = null;
      try {
        if (renderer) unmountRenderer(renderer);
      } finally {
        clearRoot(root);
      }
    },
  };
}
