import { createKeyedHost } from "../keyed-editor/host.mjs";
import { createMultiRootManagerAdapter, createSessionRuntime } from "./runtime.mjs";

function fail(message, cause) {
  return new Error(`multi-root host: ${message}`, cause === undefined ? undefined : { cause });
}

function copyDescriptors(descriptors) {
  let entries;
  if (descriptors instanceof Map) entries = [...descriptors.entries()];
  else if (descriptors && typeof descriptors === "object" && !Array.isArray(descriptors)) {
    entries = Object.entries(descriptors);
  } else {
    throw fail("descriptors must be a renderer name-to-mount-function object or Map");
  }

  const result = new Map();
  for (const [name, mount] of entries) {
    if (typeof name !== "string" || name.length === 0) throw fail("renderer names must be non-empty strings");
    if (typeof mount !== "function") throw fail(`renderer ${JSON.stringify(name)} must be a mount function`);
    if (result.has(name)) throw fail(`duplicate renderer name ${JSON.stringify(name)}`);
    result.set(name, mount);
  }
  return result;
}

function assertRoot(root) {
  if (!root || typeof root.replaceChildren !== "function") {
    throw fail("root must support replaceChildren()");
  }
}

function assertTransport(transport) {
  if (!transport || typeof transport !== "object" || Array.isArray(transport) ||
      typeof transport.start !== "function" || typeof transport.cancel !== "function") {
    throw fail("transportFactory must return an object with start() and cancel()");
  }
}

function disposeCommands(value) {
  if (!Array.isArray(value)) throw fail("manager.dispose() must return an array of cancel commands");
  return value.map((command, index) => {
    if (!command || typeof command !== "object" || Array.isArray(command) ||
        command.Kind !== "cancel" || !Number.isSafeInteger(command.ID) || command.ID <= 0) {
      throw fail(`manager.dispose() command ${index} must be a cancel command with a positive safe ID`);
    }
    return { Kind: "cancel", ID: command.ID };
  });
}

/**
 * Compose independent Go sessions with the existing keyed renderer host.
 * Root identity, local request IDs, transport callbacks, and lifecycle
 * generations stay inside one record; this layer does not interpret messages.
 */
export function createMultiRootHost({ manager, descriptors, transportFactory } = {}) {
  manager = createMultiRootManagerAdapter(manager);
  const renderers = copyDescriptors(descriptors);
  if (renderers.size === 0) throw fail("at least one renderer descriptor is required");
  if (typeof transportFactory !== "function") throw fail("transportFactory must be a function");

  const roots = new Map();
  const generations = new Map();
  const issuedSessionIDs = new Set();
  const issuedTransports = new WeakSet();
  const transportOwners = new WeakMap();

  function currentRecord(root) {
    const record = roots.get(root);
    if (!record || !record.active) throw fail("root is not mounted");
    return record;
  }

  function isCurrent(record) {
    return record.active && roots.get(record.root) === record &&
      generations.get(record.root) === record.generation;
  }

  function fencedTransport(record, transport) {
    const cancelled = new Set();
    return {
      start(command, deliver) {
        if (!isCurrent(record)) throw fail("cannot start a request for a stale root generation");
        if (typeof deliver !== "function") throw fail("transport start callback must be a function");
        return transport.start(command, (reply) => {
          if (isCurrent(record)) deliver(reply);
        });
      },
      cancel(id) {
        if (cancelled.has(id)) return undefined;
        const result = transport.cancel(id);
        cancelled.add(id);
        return result;
      },
    };
  }

  function reserveTransport(transport, record) {
    assertTransport(transport);
    if (issuedTransports.has(transport)) {
      throw fail("transportFactory must provide a fresh transport for each root generation");
    }
    if (transportOwners.has(transport)) throw fail("transport is already owned by another root");
    issuedTransports.add(transport);
    transportOwners.set(transport, record);
  }

  function releaseTransport(record) {
    if (record.transport && transportOwners.get(record.transport) === record) {
      transportOwners.delete(record.transport);
    }
  }

  function cancelDisposeCommands(record, errors) {
    if (!record.disposeCommands || !record.scopedTransport) return;
    for (const command of record.disposeCommands) {
      try { record.scopedTransport.cancel(command.ID); }
      catch (error) { errors.push(fail(`transport.cancel(${command.ID}) during session disposal failed`, error)); }
    }
  }

  function retire(record) {
    if (!record || record.retired) return [];
    record.retired = true;
    record.active = false;
    if (roots.get(record.root) === record) roots.delete(record.root);

    const errors = [];
    try {
      record.disposeCommands = disposeCommands(manager.dispose(record.sessionID));
    } catch (error) {
      errors.push(fail(`could not dispose session ${record.sessionID}`, error));
    }
    cancelDisposeCommands(record, errors);
    try {
      if (record.keyedHost) record.keyedHost.unmount();
    } catch (error) {
      errors.push(fail(`could not unmount keyed host for session ${record.sessionID}`, error));
    } finally {
      releaseTransport(record);
    }
    return errors;
  }

  function retireUncommitted(sessionID, transport, scopedTransport, keyedHost) {
    const errors = [];
    let commands = [];
    try { commands = disposeCommands(manager.dispose(sessionID)); }
    catch (error) { errors.push(fail(`could not dispose unmounted session ${sessionID}`, error)); }
    if (scopedTransport) {
      for (const command of commands) {
        try { scopedTransport.cancel(command.ID); }
        catch (error) { errors.push(fail(`transport.cancel(${command.ID}) during failed mount failed`, error)); }
      }
    }
    if (keyedHost) {
      try { keyedHost.unmount(); }
      catch (error) { errors.push(fail(`could not clean up keyed host for failed session ${sessionID}`, error)); }
    }
    if (transport) {
      const owner = transportOwners.get(transport);
      if (owner && owner.sessionID === sessionID) transportOwners.delete(transport);
    }
    return errors;
  }

  function mount(root, backend = "dom") {
    assertRoot(root);
    if (roots.has(root)) throw fail("root is already mounted; unmount it before mounting again");

    const generation = (generations.get(root) ?? 0) + 1;
    generations.set(root, generation);

    let sessionID;
    try { sessionID = manager.create(); }
    catch (error) { throw fail("manager.create() failed", error); }
    if (!Number.isSafeInteger(sessionID) || sessionID <= 0) {
      throw fail("manager.create() must return a positive safe integer session ID");
    }
    if (issuedSessionIDs.has(sessionID)) {
      throw fail(`manager.create() reused session ID ${sessionID}`);
    }
    issuedSessionIDs.add(sessionID);

    let transport;
    let record;
    try {
      transport = transportFactory(sessionID, root, generation);
      assertTransport(transport);
      record = {
        root, generation, sessionID, transport, scopedTransport: null, keyedHost: null,
        active: true, retired: false, backend: null, lifecycle: "active", disposeCommands: null,
      };
      reserveTransport(transport, record);
      record.scopedTransport = fencedTransport(record, transport);
      roots.set(root, record);
      const runtime = createSessionRuntime(manager, sessionID, () => isCurrent(record));
      record.keyedHost = createKeyedHost(root, runtime, renderers, record.scopedTransport, backend);
      record.backend = record.keyedHost.backendName();
      return { sessionID, generation };
    } catch (error) {
      const cleanupErrors = record
        ? retire(record)
        : retireUncommitted(sessionID, transport, null, null);
      if (cleanupErrors.length) {
        throw new AggregateError([error, ...cleanupErrors], `multi-root host: mount for session ${sessionID} failed and cleanup was incomplete`);
      }
      throw error;
    }
  }

  function replace(root, backend) {
    const record = currentRecord(root);
    try {
      const result = record.keyedHost.replaceBackend(backend);
      record.backend = record.keyedHost.backendName();
      record.lifecycle = "active";
      return result;
    } catch (error) {
      try {
        record.backend = record.keyedHost.backendName();
        record.lifecycle = "active";
      } catch {
        record.backend = null;
        record.lifecycle = "failed";
      }
      throw error;
    }
  }

  function unmount(root) {
    const record = currentRecord(root);
    const errors = retire(record);
    if (errors.length) throw new AggregateError(errors, `multi-root host: unmount for session ${record.sessionID} failed`);
    return true;
  }

  function settled(root) {
    if (arguments.length > 0) return currentRecord(root).keyedHost.settled();
    return Promise.all([...roots.values()].map((record) => record.keyedHost.settled()));
  }

  function snapshotAll() {
    return [...roots.values()].map((record) => {
      const result = {
        sessionID: record.sessionID,
        generation: record.generation,
        backend: null,
        snapshot: null,
        audit: null,
        domSnapshot: null,
        focus: null,
        lifecycle: record.lifecycle,
        errors: [],
      };
      const read = (key, get) => {
        try { result[key] = get(); }
        catch (error) {
          result.errors.push(error instanceof Error ? error.message : String(error));
          result.lifecycle = "failed";
        }
      };
      read("backend", () => record.keyedHost.backendName());
      read("snapshot", () => record.keyedHost.snapshot());
      read("audit", () => record.keyedHost.audit());
      read("domSnapshot", () => record.keyedHost.domSnapshot());
      read("focus", () => record.keyedHost.focusState());
      return result;
    });
  }

  return {
    mount,
    replace,
    session(root) { return currentRecord(root).sessionID; },
    unmount,
    settled,
    snapshotAll,
  };
}
