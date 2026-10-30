import { clone } from "../keyed-editor/protocol.mjs";
import { createMultiRootHost } from "../multi-root/host.mjs";

const MANAGER_METHODS = ["create", "createChild", "tree", "snapshot", "dispatch", "effects", "complete", "audit", "dispose", "disposeTree", "list"];

function fail(message, cause) {
  return new Error(`session tree host: ${message}`, cause === undefined ? undefined : { cause });
}

function assertManager(manager) {
  if (!manager || typeof manager !== "object" || Array.isArray(manager)) throw fail("manager bridge is required");
  for (const method of MANAGER_METHODS) {
    if (typeof manager[method] !== "function") throw fail(`manager bridge must expose ${method}()`);
  }
}

function sessionID(value, label = "session ID") {
  if (!Number.isSafeInteger(value) || value <= 0) throw fail(`${label} must be a positive safe integer`);
  return value;
}

function bridgeCall(manager, method, ...args) {
  let result;
  try { result = Reflect.apply(manager[method], manager, args); }
  catch (error) { throw fail(`gobiMultiRoot.${method}() failed`, error); }
  if (result !== null && typeof result === "object" && !Array.isArray(result)) {
    const keys = Object.keys(result);
    if (keys.length === 1 && keys[0] === "error" && typeof result.error === "string") {
      throw fail(`gobiMultiRoot.${method} returned error frame: ${result.error}`);
    }
  }
  return result;
}

function validateTree(value) {
  if (!Array.isArray(value)) throw fail("manager.tree() must return an array");
  const records = value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw fail(`tree record ${index} must be an object`);
    const id = sessionID(entry.SessionID, `tree record ${index} SessionID`);
    if (!Number.isSafeInteger(entry.ParentID) || entry.ParentID < 0 ||
        !Number.isSafeInteger(entry.Depth) || entry.Depth < 1 || entry.Depth > 32) {
      throw fail(`tree record ${index} must have a nonnegative ParentID and depth from 1 to 32`);
    }
    return { SessionID: id, ParentID: entry.ParentID, Depth: entry.Depth };
  });
  const byID = new Map();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (byID.has(record.SessionID)) throw fail(`manager.tree() repeated session ${record.SessionID}`);
    if (index > 0 && records[index - 1].SessionID >= record.SessionID) {
      throw fail("manager.tree() must be ordered by SessionID");
    }
    byID.set(record.SessionID, record);
  }
  for (const record of records) {
    if (record.ParentID === 0) {
      if (record.Depth !== 1) throw fail(`root session ${record.SessionID} must have depth 1`);
    } else {
      const parent = byID.get(record.ParentID);
      if (!parent || record.Depth !== parent.Depth + 1) {
        throw fail(`session ${record.SessionID} has an invalid parent/depth relationship`);
      }
    }
  }
  return { records, byID };
}

function validateCommands(value, sessionIDValue) {
  if (!Array.isArray(value)) throw fail(`DisposeTree bundle for session ${sessionIDValue} must contain Commands[]`);
  return value.map((command, index) => {
    if (!command || typeof command !== "object" || Array.isArray(command) || command.Kind !== "cancel" ||
        !Number.isSafeInteger(command.ID) || command.ID <= 0 || command.Value !== "") {
      throw fail(`DisposeTree bundle ${sessionIDValue} command ${index} must be a cancel command with a positive safe ID and empty Value`);
    }
    return { Kind: "cancel", ID: command.ID, Value: command.Value };
  });
}

function assertContainer(container) {
  if (!container || typeof container.appendChild !== "function" || typeof container.removeChild !== "function" ||
      !container.ownerDocument || typeof container.ownerDocument.createElement !== "function") {
    throw fail("container must be a DOM element with ownerDocument.createElement(), appendChild(), and removeChild()");
  }
}

function createShell(container) {
  assertContainer(container);
  const document = container.ownerDocument;
  const shell = document.createElement("section");
  const viewRoot = document.createElement("div");
  const childrenRoot = document.createElement("div");
  shell.className = "session-tree-shell";
  viewRoot.className = "session-tree-view";
  childrenRoot.className = "session-tree-children";
  shell.appendChild(viewRoot);
  shell.appendChild(childrenRoot);
  return { shell, viewRoot, childrenRoot };
}

function removeShell(shell) {
  const parent = shell?.parentNode;
  if (parent && typeof parent.removeChild === "function") parent.removeChild(shell);
}

function postorderFor(tree, rootID) {
  const root = tree.byID.get(rootID);
  if (!root) throw fail(`session ${rootID} is not live in manager.tree()`);
  const children = new Map();
  for (const record of tree.records) {
    if (record.ParentID === 0) continue;
    if (!children.has(record.ParentID)) children.set(record.ParentID, []);
    children.get(record.ParentID).push(record.SessionID);
  }
  for (const ids of children.values()) ids.sort((a, b) => a - b);
  const result = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw fail(`manager.tree() contains a cycle through session ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const childID of children.get(id) ?? []) visit(childID);
    visiting.delete(id);
    visited.add(id);
    result.push(id);
  }
  visit(rootID);
  return result;
}

function validateBundles(value, expectedIDs) {
  const errors = [];
  const commandsByID = new Map();
  const bundles = [];
  const expected = new Set(expectedIDs);
  if (!Array.isArray(value)) {
    errors.push(fail("manager.disposeTree() must return an array of Disposal bundles"));
    return { bundles, commandsByID, errors };
  }
  if (value.length !== expectedIDs.length) errors.push(fail("DisposeTree returned the wrong number of subtree bundles"));
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const bundle = value[index];
    if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
      errors.push(fail(`DisposeTree bundle ${index} must be an object`));
      continue;
    }
    let id;
    try { id = sessionID(bundle.SessionID, `DisposeTree bundle ${index} SessionID`); }
    catch (error) { errors.push(error); continue; }
    if (!expected.has(id)) errors.push(fail(`DisposeTree returned unowned session ${id}`));
    if (seen.has(id)) errors.push(fail(`DisposeTree returned duplicate session ${id}`));
    seen.add(id);
    let commands = [];
    try { commands = validateCommands(bundle.Commands, id); }
    catch (error) { errors.push(error); }
    if (expected.has(id) && !commandsByID.has(id)) commandsByID.set(id, commands);
    bundles.push({ SessionID: id, Commands: commands });
    if (expectedIDs[index] !== id) errors.push(fail("DisposeTree bundles must be returned in deterministic postorder"));
  }
  for (const id of expectedIDs) {
    if (!seen.has(id)) errors.push(fail(`DisposeTree omitted session ${id}`));
    if (!commandsByID.has(id)) commandsByID.set(id, []);
  }
  return { bundles, commandsByID, errors };
}

function copySnapshotEntry(entry) {
  return {
    sessionID: entry.sessionID,
    parentID: entry.parentID,
    depth: entry.depth,
    backend: entry.backend,
    snapshot: entry.snapshot == null ? null : clone(entry.snapshot),
    audit: entry.audit == null ? null : clone(entry.audit),
    domSnapshot: entry.domSnapshot == null ? null : clone(entry.domSnapshot),
    focus: entry.focus == null ? null : clone(entry.focus),
    lifecycle: entry.lifecycle,
    errors: Array.isArray(entry.errors) ? [...entry.errors] : [],
    shell: entry.shell,
    viewRoot: entry.viewRoot,
    childrenRoot: entry.childrenRoot,
  };
}

/**
 * Compose a Go-owned parent/child session tree while keeping each renderer on
 * its own nested viewRoot and passing subtree cancel bundles through the flat
 * multi-root host's normal leaf-disposal path.
 */
export function createSessionTreeHost({ manager, descriptors, transportFactory } = {}) {
  assertManager(manager);
  if (typeof transportFactory !== "function") throw fail("transportFactory must be a function");

  const nodes = new Map();
  const activeNodes = new Map();
  let operation = null;

  function assertIdle(action) {
    if (operation) throw fail(`${action} cannot re-enter an active ${operation.kind} operation`);
  }

  function nodeForRuntime(id) {
    sessionID(id);
    const node = nodes.get(id);
    const provisional = operation?.kind === "mount" && operation.node === node;
    if (!node || !node.active || (!node.committed && !provisional)) {
      throw fail(`session ${id} is not an active session-tree node`);
    }
    return node;
  }

  function consumeOrDispose(id) {
    sessionID(id);
    if (operation?.kind === "dispose") {
      if (operation.phase !== "cleanup") {
        throw fail(`flat host requested session ${id} disposal before DisposeTree completed`);
      }
      if (!operation.idSet.has(id)) throw fail(`flat host requested disposal outside subtree ${operation.rootID}`);
      if (operation.consumed.has(id)) return [];
      operation.consumed.add(id);
      return clone(operation.commandsByID.get(id) ?? []);
    }
    const result = bridgeCall(manager, "dispose", id);
    const node = nodes.get(id);
    if (node && !node.committed && operation?.kind === "mount" && operation.node === node) {
      node.active = false;
      node.lifecycle = "disposed";
      nodes.delete(id);
      activeNodes.delete(id);
    }
    return result;
  }

  const flatManager = {
    create() {
      if (operation?.kind !== "mount" || operation.created) {
        throw fail("manager.create() is only available once inside a guarded mount allocation");
      }
      operation.created = true;
      const id = operation.parentID === 0
        ? bridgeCall(manager, "create")
        : bridgeCall(manager, "createChild", operation.parentID);
      sessionID(id, "manager.create() result");
      if (nodes.has(id)) throw fail(`manager reused session ID ${id}`);
      const node = {
        sessionID: id,
        parentID: operation.parentID,
        depth: operation.parentID === 0 ? 1 : operation.parent.depth + 1,
        shell: operation.shell,
        viewRoot: operation.viewRoot,
        childrenRoot: operation.childrenRoot,
        container: operation.container,
        generation: null,
        backend: operation.backend,
        lifecycle: "mounting",
        active: true,
        committed: false,
      };
      operation.node = node;
      nodes.set(id, node);
      return id;
    },
    snapshot(id) { nodeForRuntime(id); return bridgeCall(manager, "snapshot", id); },
    dispatch(id, step) { nodeForRuntime(id); return bridgeCall(manager, "dispatch", id, step); },
    effects(id) { nodeForRuntime(id); return bridgeCall(manager, "effects", id); },
    complete(id, reply) { nodeForRuntime(id); return bridgeCall(manager, "complete", id, reply); },
    audit(id) { nodeForRuntime(id); return bridgeCall(manager, "audit", id); },
    dispose(id) { return consumeOrDispose(id); },
    list() { return bridgeCall(manager, "list"); },
  };

  const flatHost = createMultiRootHost({ manager: flatManager, descriptors, transportFactory });

  function mountNode(container, parent = null, backend = "dom") {
    assertIdle("mount");
    if (parent && (!parent.active || !parent.committed || activeNodes.get(parent.sessionID) !== parent)) {
      throw fail(`parent session ${parent.sessionID} is not mounted`);
    }
    if (parent && parent.depth >= 32) throw fail("session tree depth cannot exceed 32 levels");

    const nextOperation = {
      kind: "mount",
      parentID: parent?.sessionID ?? 0,
      parent,
      container,
      backend,
      created: false,
      node: null,
      shell: null,
      viewRoot: null,
      childrenRoot: null,
    };
    operation = nextOperation;
    let flatMounted = false;
    try {
      const shellParts = createShell(container);
      Object.assign(nextOperation, shellParts);
      container.appendChild(nextOperation.shell);
      const mounted = flatHost.mount(nextOperation.viewRoot, backend);
      flatMounted = true;
      const node = nextOperation.node;
      if (!node || mounted.sessionID !== node.sessionID) throw fail("flat host mounted a session outside its allocation context");
      const authoritative = currentTree().byID.get(node.sessionID);
      if (!authoritative || authoritative.ParentID !== node.parentID || authoritative.Depth !== node.depth) {
        throw fail(`manager.tree() does not match the allocated parent/depth for session ${node.sessionID}`);
      }
      node.generation = mounted.generation;
      node.lifecycle = "active";
      node.active = true;
      node.committed = true;
      activeNodes.set(node.sessionID, node);
      return {
        sessionID: node.sessionID,
        parentID: node.parentID,
        depth: node.depth,
        shell: node.shell,
        viewRoot: node.viewRoot,
        childrenRoot: node.childrenRoot,
      };
    } catch (error) {
      const node = nextOperation.node;
      const cleanupErrors = [];
      if (flatMounted && nextOperation.viewRoot) {
        try { flatHost.unmount(nextOperation.viewRoot); }
        catch (cleanupError) { cleanupErrors.push(fail("could not roll back flat renderer after failed mount", cleanupError)); }
      }
      if (node) {
        node.active = false;
        node.lifecycle = "failed";
        nodes.delete(node.sessionID);
        activeNodes.delete(node.sessionID);
      }
      try { removeShell(nextOperation.shell); }
      catch (cleanupError) { cleanupErrors.push(fail("could not remove shell for failed mount", cleanupError)); }
      if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], "session tree host mount cleanup failed");
      throw error;
    } finally {
      operation = null;
    }
  }

  function currentTree() {
    return validateTree(bridgeCall(manager, "tree"));
  }

  function assertOwnedSubtree(rootID, tree) {
    const target = activeNodes.get(rootID);
    if (!target || !target.active) throw fail(`session ${rootID} is not mounted by this host`);
    const postorder = postorderFor(tree, rootID);
    const ids = new Set(postorder);
    const ownedChildren = new Map();
    for (const node of activeNodes.values()) {
      if (!ownedChildren.has(node.parentID)) ownedChildren.set(node.parentID, []);
      ownedChildren.get(node.parentID).push(node.sessionID);
    }
    for (const childIDs of ownedChildren.values()) childIDs.sort((a, b) => a - b);
    const ownedPostorder = [];
    function visitOwned(id) {
      for (const childID of ownedChildren.get(id) ?? []) visitOwned(childID);
      ownedPostorder.push(id);
    }
    visitOwned(rootID);
    const ownedSet = new Set(ownedPostorder);
    if (ownedSet.size !== ids.size || [...ids].some((id) => !ownedSet.has(id))) {
      throw fail(`subtree ${rootID} contains unowned or inconsistent session nodes`);
    }
    for (const id of postorder) {
      const node = activeNodes.get(id);
      const info = tree.byID.get(id);
      if (!node || !info || node.parentID !== info.ParentID || node.depth !== info.Depth) {
        throw fail(`subtree ${rootID} contains unowned or inconsistent session ${id}`);
      }
    }
    if (ownedPostorder.length !== postorder.length || ownedPostorder.some((id, index) => id !== postorder[index])) {
      throw fail(`subtree ${rootID} has inconsistent child ordering`);
    }
    return { target, postorder };
  }

  function removeNodeRecords(node) {
    node.active = false;
    node.committed = false;
    node.lifecycle = "disposed";
    activeNodes.delete(node.sessionID);
    nodes.delete(node.sessionID);
  }

  function mountRoot(container, backend = "dom") {
    return mountNode(container, null, backend);
  }

  function mountChild(parentID, backend = "dom") {
    sessionID(parentID, "parent session ID");
    assertIdle("mountChild");
    const parent = activeNodes.get(parentID);
    if (!parent || !parent.active) throw fail(`parent session ${parentID} is not mounted`);
    return mountNode(parent.childrenRoot, parent, backend);
  }

  function replace(id, backend) {
    sessionID(id);
    assertIdle("replace");
    const node = activeNodes.get(id);
    if (!node || !node.active) throw fail(`session ${id} is not mounted`);
    operation = { kind: "replace", node };
    try {
      const result = flatHost.replace(node.viewRoot, backend);
      node.backend = backend;
      node.lifecycle = "active";
      return result;
    } catch (error) {
      const entry = flatHost.snapshotAll().find((item) => item.sessionID === id);
      node.backend = entry?.backend ?? null;
      node.lifecycle = entry?.lifecycle ?? "failed";
      throw error;
    } finally {
      operation = null;
    }
  }

  function snapshot(id) {
    sessionID(id);
    const node = activeNodes.get(id);
    if (!node || !node.active) throw fail(`session ${id} is not mounted`);
    const entry = flatHost.snapshotAll().find((item) => item.sessionID === id);
    if (!entry) throw fail(`flat host has no renderer record for session ${id}`);
    if (entry.snapshot == null) {
      throw new AggregateError(entry.errors.map((message) => fail(message)), `snapshot for session ${id} is unavailable`);
    }
    return clone(entry.snapshot);
  }

  function tree() {
    return currentTree().records.map((record) => ({ ...record }));
  }

  function snapshotAll() {
    const flatEntries = new Map(flatHost.snapshotAll().map((entry) => [entry.sessionID, entry]));
    return [...activeNodes.values()].filter((node) => node.active).sort((a, b) => a.sessionID - b.sessionID).map((node) => {
      const flatEntry = flatEntries.get(node.sessionID);
      return copySnapshotEntry({
        sessionID: node.sessionID,
        parentID: node.parentID,
        depth: node.depth,
        backend: flatEntry?.backend ?? node.backend,
        snapshot: flatEntry?.snapshot ?? null,
        audit: flatEntry?.audit ?? null,
        domSnapshot: flatEntry?.domSnapshot ?? null,
        focus: flatEntry?.focus ?? null,
        lifecycle: flatEntry?.lifecycle ?? node.lifecycle,
        errors: flatEntry?.errors ?? [],
        shell: node.shell,
        viewRoot: node.viewRoot,
        childrenRoot: node.childrenRoot,
      });
    });
  }

  function settled() {
    return flatHost.settled();
  }

  function dispose(id) {
    sessionID(id);
    assertIdle("dispose");
    const subtree = assertOwnedSubtree(id, currentTree());
    const priorLifecycle = new Map(subtree.postorder.map((sessionIDValue) => {
      const node = activeNodes.get(sessionIDValue);
      return [sessionIDValue, node.lifecycle];
    }));
    const idSet = new Set(subtree.postorder);
    for (const sessionIDValue of subtree.postorder) {
      const node = activeNodes.get(sessionIDValue);
      node.active = false;
      node.lifecycle = "disposing";
    }

    const disposeOperation = {
      kind: "dispose",
      phase: "authoritative",
      rootID: id,
      idSet,
      commandsByID: new Map(),
      consumed: new Set(),
    };
    operation = disposeOperation;

    let result;
    try { result = bridgeCall(manager, "disposeTree", id); }
    catch (error) {
      for (const sessionIDValue of subtree.postorder) {
        const node = activeNodes.get(sessionIDValue);
        node.active = true;
        node.lifecycle = priorLifecycle.get(sessionIDValue);
      }
      operation = null;
      throw error;
    }

    let checked;
    try { checked = validateBundles(result, subtree.postorder); }
    catch (error) {
      checked = {
        bundles: [],
        commandsByID: new Map(subtree.postorder.map((sessionIDValue) => [sessionIDValue, []])),
        errors: [fail("could not validate DisposeTree bundles", error)],
      };
    }
    const errors = [...checked.errors];
    disposeOperation.commandsByID = checked.commandsByID;
    disposeOperation.phase = "cleanup";
    try {
      for (const sessionIDValue of subtree.postorder) {
        const node = nodes.get(sessionIDValue);
        if (!node) {
          errors.push(fail(`session ${sessionIDValue} disappeared before renderer cleanup`));
          continue;
        }
        try { flatHost.unmount(node.viewRoot); }
        catch (error) { errors.push(fail(`could not unmount renderer for session ${sessionIDValue}`, error)); }
        try { removeShell(node.shell); }
        catch (error) { errors.push(fail(`could not remove shell for session ${sessionIDValue}`, error)); }
        removeNodeRecords(node);
      }
    } finally {
      operation = null;
    }

    if (errors.length) throw new AggregateError(errors, `session tree host: dispose subtree ${id} completed with cleanup errors`);
    return checked.bundles.map((bundle) => ({ SessionID: bundle.SessionID, Commands: bundle.Commands.map((command) => ({ ...command })) }));
  }

  return { mountRoot, mountChild, replace, snapshot, tree, snapshotAll, settled, dispose };
}
