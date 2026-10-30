import test from "node:test";
import assert from "node:assert/strict";
import { createSessionTreeHost } from "./host.mjs";

function hostFor(options) {
  return createSessionTreeHost(options);
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.nodeType = 1;
    this.childNodes = [];
    this.parentNode = null;
    this.content = "";
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index < 0) throw new Error("node is not a child of this parent");
    this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  replaceChildren(...children) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    for (const child of children) this.appendChild(child);
    this.content = children.map((child) => child.content ?? child.tagName).join("");
  }

  get firstChild() { return this.childNodes[0] ?? null; }
}

class FakeDocument {
  createElement(tagName) { return new FakeElement(tagName, this); }
}

function fakeContainer() {
  const document = new FakeDocument();
  return document.createElement("main");
}

const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const element = (Tag, Key, { Attrs = null, On = null, Kids = null } = {}) => ({
  Kind: 1, Tag, Key, Attrs, On, Kids, Text: "",
});

function makeSnapshot(session) {
  return {
    state: {
      SessionID: session.ID,
      ParentID: session.ParentID,
      Depth: session.Depth,
      Version: session.Version,
      PendingID: session.PendingID,
      Saved: session.Saved,
    },
    tree: element("div", "root", {
      Kids: [
        element("input", "draft-input", { Attrs: [
          { Name: "type", Value: "text", Flag: false, Style: null },
          { Name: "value", Value: session.Saved, Flag: false, Style: null },
        ] }),
        element("button", "save", { On: [{ Event: "click", Message: "save", Arg: "" }], Kids: [text("Save")] }),
      ],
    }),
    bindings: [],
    messages: session.messages.map((message) => ({ ...message })),
  };
}

function makeManager() {
  let nextID = 0;
  const sessions = new Map();
  const calls = {
    create: 0, createChild: [], snapshot: [], dispatch: [], effects: [], complete: [],
    audit: [], dispose: [], disposeTree: [], list: 0, tree: 0,
  };
  let nextDisposeTreeError = null;

  function get(id) {
    const session = sessions.get(id);
    if (!session) throw new Error(`unknown session ${id}`);
    return session;
  }

  function childrenOf(id) {
    return [...sessions.values()].filter((session) => session.ParentID === id).sort((a, b) => a.ID - b.ID);
  }

  function createSession(parentID, depth) {
    const ID = ++nextID;
    sessions.set(ID, { ID, ParentID: parentID, Depth: depth, Version: 0, PendingID: 0, NextRequestID: 0, Saved: "", messages: [], outbox: [], audit: [] });
    return ID;
  }

  function disposalCommands(session) {
    const result = [];
    const seen = new Set();
    for (const command of session.outbox) {
      if (command.Kind === "cancel" && !seen.has(command.ID)) {
        seen.add(command.ID);
        result.push({ Kind: "cancel", ID: command.ID, Value: "" });
      }
    }
    session.outbox = [];
    if (session.PendingID && !seen.has(session.PendingID)) result.push({ Kind: "cancel", ID: session.PendingID, Value: "" });
    return result;
  }

  function postorder(id) {
    const result = [];
    function visit(current) {
      for (const child of childrenOf(current)) visit(child.ID);
      result.push(current);
    }
    visit(id);
    return result;
  }

  const manager = {
    calls,
    sessions,
    create() {
      calls.create += 1;
      return createSession(0, 1);
    },
    createChild(parentID) {
      calls.createChild.push(parentID);
      const parent = get(parentID);
      if (parent.Depth >= 32) throw new Error("session tree depth exceeds 32");
      return createSession(parentID, parent.Depth + 1);
    },
    tree() {
      calls.tree += 1;
      return [...sessions.values()].sort((a, b) => a.ID - b.ID).map(({ ID, ParentID, Depth }) => ({ SessionID: ID, ParentID, Depth }));
    },
    snapshot(id) {
      calls.snapshot.push(id);
      return makeSnapshot(get(id));
    },
    dispatch(id, step) {
      calls.dispatch.push(id);
      const session = get(id);
      session.Version += 1;
      if (step.Key === "save") {
        session.NextRequestID += 1;
        session.PendingID = session.NextRequestID;
        session.outbox.push({ Kind: "start", ID: session.PendingID, Value: `session-${id}` });
      }
      session.messages.push({ Name: step.Key === "save" ? "save" : "tick", Arg: String(id) });
      return makeSnapshot(session);
    },
    effects(id) {
      calls.effects.push(id);
      return get(id).outbox.splice(0);
    },
    complete(id, reply) {
      calls.complete.push({ id, reply: { ...reply } });
      const session = get(id);
      if (reply.ID === session.PendingID) {
        session.PendingID = 0;
        if (reply.Error === "") session.Saved = reply.Value;
      }
      session.messages.push({ Name: "reply", Arg: String(reply.ID) });
      session.audit.push({ ID: reply.ID, Accepted: reply.ID > 0 });
      return makeSnapshot(session);
    },
    audit(id) {
      calls.audit.push(id);
      return get(id).audit.map((entry) => ({ ...entry }));
    },
    dispose(id) {
      calls.dispose.push(id);
      if (childrenOf(id).length) throw new Error("cannot dispose a nonleaf session");
      const session = get(id);
      const commands = disposalCommands(session);
      sessions.delete(id);
      return commands;
    },
    disposeTree(id) {
      calls.disposeTree.push(id);
      if (nextDisposeTreeError) {
        const error = nextDisposeTreeError;
        nextDisposeTreeError = null;
        return { error: error.message };
      }
      get(id);
      const order = postorder(id);
      const bundles = order.map((SessionID) => ({ SessionID, Commands: disposalCommands(get(SessionID)) }));
      for (const SessionID of order) sessions.delete(SessionID);
      return bundles;
    },
    list() {
      calls.list += 1;
      return [...sessions.keys()].sort((a, b) => a - b);
    },
    failNextDisposeTree(error) { nextDisposeTreeError = error; },
  };
  return manager;
}

function makeTransports({ failCancelFor = new Set() } = {}) {
  const bySession = new Map();
  function factory(sessionID, root, generation) {
    const callbacks = new Map();
    const events = [];
    const transport = {
      root,
      generation,
      events,
      start(command, deliver) {
        events.push({ kind: "start", command: { ...command } });
        callbacks.set(command.ID, deliver);
      },
      cancel(id) {
        events.push({ kind: "cancel", id });
        if (failCancelFor.has(sessionID)) throw new Error(`cancel failed for session ${sessionID}`);
      },
      deliver(id, value = `saved-${sessionID}`) {
        const deliver = callbacks.get(id);
        if (!deliver) throw new Error(`unknown request ${id} for session ${sessionID}`);
        deliver({ ID: id, Value: value, Error: "" });
      },
    };
    bySession.set(sessionID, transport);
    return transport;
  }
  return { factory, bySession };
}

function makeRenderers(records, { failMountIDs = new Set(), failUnmountIDs = new Set(), duringInit = null } = {}) {
  function mount(name, root, facade) {
    const initial = facade.init();
    const sessionID = initial.state.SessionID;
    const record = { name, root, facade, sessionID, latest: initial, focus: null, mounted: true, updates: [] };
    const paint = (snapshot) => {
      record.latest = snapshot;
      record.updates.push(snapshot);
      const content = root.ownerDocument.createElement(`${name}-view`);
      content.content = `${name}:${snapshot.state.SessionID}:${snapshot.state.Version}`;
      root.replaceChildren(content);
    };
    const api = {
      update(next) { paint(next); },
      snapshot() { return record.latest; },
      domSnapshot() { return { html: root.content, disabled: [] }; },
      focusState() { return record.focus && { ...record.focus }; },
      restoreFocus(next) { record.focus = next && { ...next }; },
      click(path) {
        assert.equal(path, "1");
        const next = facade.dispatch({ Path: "1", Event: "click", Value: "", Key: "save" });
        api.update(next);
        return next;
      },
      unmount() {
        record.mounted = false;
        if (failUnmountIDs.has(sessionID)) throw new Error(`renderer unmount failed for session ${sessionID}`);
        root.replaceChildren();
      },
    };
    record.click = api.click;
    paint(initial);
    records.push(record);
    if (duringInit) duringInit(sessionID, facade);
    if (failMountIDs.has(sessionID)) throw new Error(`renderer mount failed for session ${sessionID}`);
    return api;
  }
  return {
    dom: (root, runtime) => mount("dom", root, runtime),
    react: (root, runtime) => mount("react", root, runtime),
    broken: (root, runtime) => mount("broken", root, runtime),
  };
}

function setup(options = {}) {
  const manager = options.manager ?? makeManager();
  const records = [];
  const transports = makeTransports({ failCancelFor: options.failCancelFor });
  const host = hostFor({
    manager,
    descriptors: makeRenderers(records, options),
    transportFactory: transports.factory,
  });
  return { host, manager, records, transports };
}

function currentRenderer(records, sessionID, name) {
  const record = [...records].reverse().find((item) => item.sessionID === sessionID && item.name === name && item.mounted);
  assert.ok(record, `expected live ${name} renderer for session ${sessionID}`);
  return record;
}

function includesError(error, phrase) {
  if (!error) return false;
  if (String(error.message ?? error).includes(phrase)) return true;
  if (error.cause && includesError(error.cause, phrase)) return true;
  return Array.isArray(error.errors) && error.errors.some((item) => includesError(item, phrase));
}

test("public API nests stable child shells beside replaceable renderer roots", () => {
  const { host, manager, records } = setup();
  assert.deepEqual(Object.keys(host).sort(), ["dispose", "mountChild", "mountRoot", "refresh", "replace", "settled", "snapshot", "snapshotAll", "tree"]);

  const container = fakeContainer();
  const root = host.mountRoot(container);
  const child = host.mountChild(root.sessionID);
  const grandchild = host.mountChild(child.sessionID, "react");
  const siblingRoot = host.mountRoot(fakeContainer(), "react");
  assert.deepEqual([root.parentID, root.depth, child.parentID, child.depth, grandchild.parentID, grandchild.depth], [0, 1, root.sessionID, 2, child.sessionID, 3]);
  assert.equal(root.shell.parentNode, container);
  assert.deepEqual(root.shell.childNodes, [root.viewRoot, root.childrenRoot]);
  assert.equal(child.shell.parentNode, root.childrenRoot);
  assert.deepEqual(child.shell.childNodes, [child.viewRoot, child.childrenRoot]);
  assert.equal(grandchild.shell.parentNode, child.childrenRoot);

  const childShell = child.shell;
  const childViewRoot = child.viewRoot;
  const grandchildShell = grandchild.shell;
  const grandchildViewRoot = grandchild.viewRoot;
  const childRenderer = currentRenderer(records, child.sessionID, "dom");
  host.replace(root.sessionID, "react");
  assert.equal(root.viewRoot, currentRenderer(records, root.sessionID, "react").root);
  assert.equal(child.shell, childShell);
  assert.equal(child.shell.parentNode, root.childrenRoot);
  assert.equal(child.viewRoot, childViewRoot);
  assert.equal(child.viewRoot.firstChild.content, `dom:${child.sessionID}:0`);
  assert.equal(childRenderer.mounted, true, "parent replacement must preserve the child renderer handle");

  childRenderer.focus = { key: "draft-input", selectionStart: 1, selectionEnd: 3, selectionDirection: "backward" };
  host.replace(child.sessionID, "react");
  assert.equal(child.shell, childShell);
  assert.equal(child.shell.parentNode, root.childrenRoot);
  assert.equal(child.viewRoot, childViewRoot);
  assert.equal(child.childrenRoot.firstChild, grandchild.shell);
  assert.equal(grandchild.shell, grandchildShell);
  assert.equal(grandchild.viewRoot, grandchildViewRoot);
  assert.deepEqual(host.snapshotAll().find((entry) => entry.sessionID === child.sessionID).focus, {
    key: "draft-input", selectionStart: 1, selectionEnd: 3, selectionDirection: "backward",
  });

  const beforeParent = host.snapshot(root.sessionID).state.Version;
  currentRenderer(records, child.sessionID, "react").click("1");
  assert.equal(host.snapshot(child.sessionID).state.Version, 1);
  assert.equal(beforeParent, 0);
  assert.equal(host.snapshot(root.sessionID).state.Version, 0);
  assert.deepEqual(manager.calls.dispatch, [child.sessionID]);
  const treeCopy = host.tree();
  assert.deepEqual(treeCopy, [
    { SessionID: root.sessionID, ParentID: 0, Depth: 1 },
    { SessionID: child.sessionID, ParentID: root.sessionID, Depth: 2 },
    { SessionID: grandchild.sessionID, ParentID: child.sessionID, Depth: 3 },
    { SessionID: siblingRoot.sessionID, ParentID: 0, Depth: 1 },
  ]);
  treeCopy[0].ParentID = 999;
  assert.equal(host.tree()[0].ParentID, 0, "tree() returns a defensive copy");
  const entries = host.snapshotAll();
  assert.deepEqual(entries.map(({ sessionID, parentID, depth }) => [sessionID, parentID, depth]), [
    [root.sessionID, 0, 1], [child.sessionID, root.sessionID, 2],
    [grandchild.sessionID, child.sessionID, 3], [siblingRoot.sessionID, 0, 1],
  ]);
  assert.deepEqual(Object.keys(entries[0]).sort(), [
    "audit", "backend", "childrenRoot", "depth", "domSnapshot", "errors", "focus", "lifecycle",
    "parentID", "sessionID", "shell", "snapshot", "viewRoot",
  ].sort());
  assert.equal(entries.find((entry) => entry.sessionID === child.sessionID).viewRoot, child.viewRoot);

  host.dispose(root.sessionID);
  host.dispose(siblingRoot.sessionID);
});

test("refresh reads authoritative Go state into the current session renderer without remounting", async () => {
  const { host, manager, records } = setup();
  const root = host.mountRoot(fakeContainer());
  const renderer = currentRenderer(records, root.sessionID, "dom");
  renderer.focus = { key: "draft-input", selectionStart: 1, selectionEnd: 4, selectionDirection: "forward" };
  manager.sessions.get(root.sessionID).Version = 9;

  const refreshed = host.refresh(root.sessionID);
  assert.equal(refreshed.state.Version, 9);
  assert.equal(host.snapshot(root.sessionID).state.Version, 9);
  assert.equal(renderer.updates.length, 2, "refresh paints through the existing renderer API");
  assert.deepEqual(host.snapshotAll()[0].focus, renderer.focus);
  assert.equal(host.snapshotAll()[0].lifecycle, "active");
  assert.equal(records.filter((record) => record.sessionID === root.sessionID && record.mounted).length, 1);
  await host.settled();

  host.dispose(root.sessionID);
  assert.throws(() => host.refresh(root.sessionID), /not mounted/);
});

test("refresh reserves structural host operations across renderer callbacks", () => {
  const { host, manager, records } = setup();
  const root = host.mountRoot(fakeContainer());
  const renderer = currentRenderer(records, root.sessionID, "dom");
  const nestedErrors = [];
  const replaceChildren = renderer.root.replaceChildren.bind(renderer.root);
  let probing = false;
  renderer.root.replaceChildren = (...children) => {
    if (!probing) {
      probing = true;
      for (const action of [
        () => host.dispose(root.sessionID),
        () => host.replace(root.sessionID, "react"),
        () => host.refresh(root.sessionID),
      ]) {
        try { action(); }
        catch (error) { nestedErrors.push(error); }
      }
    }
    return replaceChildren(...children);
  };

  manager.sessions.get(root.sessionID).Version = 9;
  let refreshed;
  let outerError;
  try { refreshed = host.refresh(root.sessionID); }
  catch (error) { outerError = error; }

  assert.deepEqual(manager.calls.disposeTree, [], "nested disposal is rejected before Go mutation");
  assert.equal(nestedErrors.length, 3);
  assert.ok(nestedErrors.every((error) => /cannot re-enter an active refresh operation/.test(error.message)));
  assert.equal(outerError, undefined, "the renderer update and outer refresh complete normally");
  assert.deepEqual(manager.list(), [root.sessionID]);
  assert.equal(refreshed.state.Version, 9, "the outer refresh still updates the existing renderer");
  assert.equal(renderer.mounted, true);
  assert.equal(host.snapshot(root.sessionID).state.Version, 9);
  host.dispose(root.sessionID);
});

test("child renderer dispatch is scoped to its node and never updates its parent", () => {
  const { host, manager, records } = setup();
  const root = host.mountRoot(fakeContainer());
  const child = host.mountChild(root.sessionID);
  const mountedChild = currentRenderer(records, child.sessionID, "dom");
  const before = host.snapshot(root.sessionID).state.Version;
  mountedChild.click("1");
  assert.equal(host.snapshot(child.sessionID).state.Version, 1);
  assert.equal(host.snapshot(root.sessionID).state.Version, before);
  assert.deepEqual(manager.calls.dispatch, [child.sessionID]);
  host.dispose(root.sessionID);
});

test("subtree disposal fences descendants, returns postorder cancels per transport, and leaves siblings live", async () => {
  const { host, manager, records, transports } = setup();
  const container = fakeContainer();
  const root = host.mountRoot(container);
  const childA = host.mountChild(root.sessionID);
  const childB = host.mountChild(root.sessionID);
  const grandchild = host.mountChild(childA.sessionID);
  const sibling = host.mountRoot(fakeContainer());

  for (const id of [root.sessionID, childA.sessionID, childB.sessionID, grandchild.sessionID, sibling.sessionID]) {
    currentRenderer(records, id, "dom").click("1");
  }
  await host.settled();

  const oldTransports = [root.sessionID, childA.sessionID, childB.sessionID, grandchild.sessionID].map((id) => transports.bySession.get(id));
  const childFacade = currentRenderer(records, childA.sessionID, "dom").facade;
  const grandchildFacade = currentRenderer(records, grandchild.sessionID, "dom").facade;
  let preFenced = false;
  const disposeTree = manager.disposeTree;
  manager.disposeTree = function (id) {
    assert.throws(() => host.snapshot(root.sessionID), /not mounted/);
    assert.deepEqual(host.snapshotAll().map((entry) => entry.sessionID), [sibling.sessionID]);
    assert.throws(() => childFacade.dispatch({ Path: "1", Event: "click", Value: "", Key: "save" }),
      (error) => includesError(error, "not an active session-tree node"));
    assert.throws(() => grandchildFacade.dispatch({ Path: "1", Event: "click", Value: "", Key: "save" }),
      (error) => includesError(error, "not an active session-tree node"));
    preFenced = true;
    return disposeTree.call(this, id);
  };
  const bundles = host.dispose(root.sessionID);
  manager.disposeTree = disposeTree;
  assert.equal(preFenced, true, "every node is fenced before the authoritative DisposeTree call");
  assert.deepEqual(bundles.map((bundle) => bundle.SessionID), [grandchild.sessionID, childA.sessionID, childB.sessionID, root.sessionID]);
  assert.deepEqual(bundles.map((bundle) => bundle.Commands), [
    [{ Kind: "cancel", ID: 1, Value: "" }], [{ Kind: "cancel", ID: 1, Value: "" }],
    [{ Kind: "cancel", ID: 1, Value: "" }], [{ Kind: "cancel", ID: 1, Value: "" }],
  ]);
  for (const id of [root.sessionID, childA.sessionID, childB.sessionID, grandchild.sessionID]) {
    assert.deepEqual(transports.bySession.get(id).events.filter((event) => event.kind === "cancel"), [{ kind: "cancel", id: 1 }]);
  }
  assert.deepEqual(transports.bySession.get(sibling.sessionID).events.filter((event) => event.kind === "cancel"), []);
  assert.deepEqual(host.tree(), [{ SessionID: sibling.sessionID, ParentID: 0, Depth: 1 }]);
  assert.deepEqual(host.snapshotAll().map((entry) => entry.sessionID), [sibling.sessionID]);
  assert.equal(container.childNodes.length, 0, "the whole disposed subtree shell is removed");
  assert.deepEqual(manager.calls.disposeTree, [root.sessionID]);
  assert.deepEqual(manager.calls.dispose, [], "flat-host teardown must consume cached bundles without calling Go Dispose again");

  const completeCount = manager.calls.complete.length;
  for (const transport of oldTransports) transport.deliver(1, "late");
  await host.settled();
  assert.equal(manager.calls.complete.length, completeCount, "retired callbacks never reach a disposed or recreated node");

  const recreated = host.mountRoot(container);
  assert.notEqual(recreated.sessionID, root.sessionID);
  assert.equal(host.snapshot(recreated.sessionID).state.Version, 0);
  transports.bySession.get(sibling.sessionID).deliver(1, "sibling saved");
  await host.settled();
  assert.equal(host.snapshot(sibling.sessionID).state.Saved, "sibling saved");
  host.dispose(recreated.sessionID);
  host.dispose(sibling.sessionID);
});

test("subtree disposal cancels queued requests without draining effects", async () => {
  const { host, manager, records, transports } = setup();
  const root = host.mountRoot(fakeContainer());
  const child = host.mountChild(root.sessionID);
  const sibling = host.mountRoot(fakeContainer());
  currentRenderer(records, root.sessionID, "dom").click("1");
  currentRenderer(records, child.sessionID, "dom").click("1");

  const bundles = host.dispose(root.sessionID);
  await host.settled();
  assert.deepEqual(bundles.map((bundle) => bundle.SessionID), [child.sessionID, root.sessionID]);
  for (const id of [root.sessionID, child.sessionID]) {
    assert.deepEqual(transports.bySession.get(id).events, [{ kind: "cancel", id: 1 }]);
    assert.ok(!manager.calls.effects.includes(id), "queued effects must not drain after subtree disposal");
  }
  assert.deepEqual(transports.bySession.get(sibling.sessionID).events, []);
  host.dispose(sibling.sessionID);
});

test("subtree disposal reserves structural operations before calling Go", () => {
  const { host, manager } = setup();
  const root = host.mountRoot(fakeContainer());
  const child = host.mountChild(root.sessionID);
  const sibling = host.mountRoot(fakeContainer());
  const createsBeforeDispose = manager.calls.create;
  let reentryError;
  const disposeTree = manager.disposeTree;
  manager.disposeTree = function (id) {
    try { host.mountRoot(fakeContainer()); }
    catch (error) { reentryError = error; }
    return disposeTree.call(this, id);
  };

  assert.deepEqual(host.dispose(root.sessionID).map((bundle) => bundle.SessionID), [child.sessionID, root.sessionID]);
  assert.match(reentryError.message, /cannot re-enter an active dispose operation/);
  assert.equal(manager.calls.create, createsBeforeDispose, "reentrant mount cannot allocate another Go root");
  assert.deepEqual(host.tree(), [{ SessionID: sibling.sessionID, ParentID: 0, Depth: 1 }]);
  const recreated = host.mountRoot(fakeContainer());
  assert.notEqual(recreated.sessionID, root.sessionID);
  assert.deepEqual(host.tree().map((entry) => entry.SessionID), [sibling.sessionID, recreated.sessionID]);
  host.dispose(recreated.sessionID);
  host.dispose(sibling.sessionID);
});

test("unowned descendants and invalid parents are rejected before mutation", () => {
  const { host, manager } = setup();
  const root = host.mountRoot(fakeContainer());
  const createChildCount = manager.calls.createChild.length;
  assert.throws(() => host.mountChild(0), /positive safe integer/);
  assert.throws(() => host.mountChild(9999), /unknown|not mounted|parent/i);
  assert.equal(manager.calls.createChild.length, createChildCount);

  const unownedChild = manager.createChild(root.sessionID);
  const disposeCallsBefore = manager.calls.disposeTree.length;
  assert.throws(() => host.dispose(root.sessionID), /unowned|not mounted|ownership/i);
  assert.equal(manager.calls.disposeTree.length, disposeCallsBefore, "ownership rejection precedes DisposeTree");
  assert.equal(host.snapshot(root.sessionID).state.SessionID, root.sessionID, "ownership rejection does not fence the owned root");
  assert.equal(manager.sessions.has(unownedChild), true);
  manager.dispose(unownedChild);
  host.dispose(root.sessionID);
});

test("depth 32 is accepted and a 33rd level is rejected before Go allocation", () => {
  const { host, manager } = setup();
  let node = host.mountRoot(fakeContainer());
  for (let depth = 2; depth <= 32; depth += 1) node = host.mountChild(node.sessionID);
  assert.equal(node.depth, 32);
  assert.equal(manager.calls.createChild.length, 31);
  assert.throws(() => host.mountChild(node.sessionID), /depth cannot exceed 32/);
  assert.equal(manager.calls.createChild.length, 31);
  assert.equal(manager.list().length, 32);
  host.dispose(1);
  assert.deepEqual(manager.list(), []);
});

test("failed renderer mount rolls back its new Go session and only its shell", () => {
  const failMountIDs = new Set([2]);
  const { host, manager } = setup({ failMountIDs });
  const container = fakeContainer();
  const parent = host.mountRoot(container);
  assert.throws(() => host.mountChild(parent.sessionID, "broken"), /renderer mount failed|failed to mount/);
  assert.equal(container.childNodes[0], parent.shell);
  assert.equal(parent.childrenRoot.childNodes.length, 0);
  assert.deepEqual(manager.list(), [parent.sessionID]);
  assert.deepEqual(manager.calls.dispose, [2], "failed child mount disposes its one newly allocated leaf session");
  assert.deepEqual(host.tree(), [{ SessionID: parent.sessionID, ParentID: 0, Depth: 1 }]);
  host.dispose(parent.sessionID);
});

test("mount reentry is blocked while the guarded manager create context is active", () => {
  let host;
  let nestedError;
  const manager = makeManager();
  const records = [];
  const transports = makeTransports();
  host = hostFor({
    manager,
    descriptors: makeRenderers(records, {
      duringInit() {
        try { host.mountRoot(fakeContainer()); }
        catch (error) { nestedError = error; }
      },
    }),
    transportFactory: transports.factory,
  });
  const root = host.mountRoot(fakeContainer());
  assert.match(nestedError.message, /reentrant|allocation|mount/i);
  assert.equal(manager.calls.create, 1, "reentrant mount cannot allocate another Go root");
  assert.deepEqual(manager.list(), [root.sessionID]);
  host.dispose(root.sessionID);
});

test("DisposeTree failure restores the subtree and releases its structural-operation reservation", () => {
  const { host, manager, records } = setup();
  const root = host.mountRoot(fakeContainer());
  const child = host.mountChild(root.sessionID);
  const sibling = host.mountRoot(fakeContainer());
  let reentryError;
  const disposeTree = manager.disposeTree;
  manager.disposeTree = function (id) {
    try { host.mountRoot(fakeContainer()); }
    catch (error) { reentryError = error; }
    return disposeTree.call(this, id);
  };
  manager.failNextDisposeTree(new Error("atomic DisposeTree rejected"));
  assert.throws(() => host.dispose(root.sessionID), (error) => includesError(error, "atomic DisposeTree rejected"));
  assert.match(reentryError.message, /cannot re-enter an active dispose operation/);
  assert.deepEqual(host.tree(), [
    { SessionID: root.sessionID, ParentID: 0, Depth: 1 },
    { SessionID: child.sessionID, ParentID: root.sessionID, Depth: 2 },
    { SessionID: sibling.sessionID, ParentID: 0, Depth: 1 },
  ]);
  assert.equal(host.snapshot(root.sessionID).state.Version, 0);
  assert.equal(host.snapshot(child.sessionID).state.Version, 0);
  assert.equal(host.snapshot(sibling.sessionID).state.Version, 0);
  assert.equal(records.filter((record) => record.mounted).length, 3);
  assert.deepEqual(manager.calls.dispose, []);
  const recovered = host.mountRoot(fakeContainer());
  assert.notEqual(recovered.sessionID, root.sessionID, "failed DisposeTree releases the operation lock");
  host.dispose(root.sessionID);
  host.dispose(recovered.sessionID);
  host.dispose(sibling.sessionID);
});

test("subtree cleanup continues across cancel and renderer unmount errors", async () => {
  const manager = makeManager();
  const childID = 2;
  const { host, records, transports } = setup({ manager, failCancelFor: new Set([childID]), failUnmountIDs: new Set([1]) });
  const rootContainer = fakeContainer();
  const root = host.mountRoot(rootContainer);
  const child = host.mountChild(root.sessionID);
  currentRenderer(records, root.sessionID, "dom").click("1");
  currentRenderer(records, child.sessionID, "dom").click("1");
  await host.settled();
  assert.throws(() => host.dispose(root.sessionID), (error) =>
    error instanceof AggregateError && includesError(error, "cancel failed for session 2") && includesError(error, "renderer unmount failed for session 1"));
  assert.deepEqual(manager.list(), []);
  assert.equal(rootContainer.childNodes.length, 0, "parent shell removal continues after child cleanup errors");
  assert.deepEqual(manager.calls.disposeTree, [root.sessionID]);
  assert.deepEqual(manager.calls.dispose, []);
  assert.ok(records.every((record) => !record.mounted));
  assert.ok(transports.bySession.get(child.sessionID).events.some((event) => event.kind === "cancel"));
});
