import test from "node:test";
import assert from "node:assert/strict";
import { createManualTransport } from "../async-effects/transport.mjs";
import { createCompositionHost } from "./host.mjs";

const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const element = (Tag, Key, { On = null, Kids = null } = {}) => ({
  Kind: 1, Tag, Key, Attrs: null, On, Kids, Text: "",
});

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
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
    if (index < 0) throw new Error("node is not a child");
    this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  replaceChildren(...children) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    this.content = children.map((child) => child.content ?? child.tagName).join("");
    for (const child of children) this.appendChild(child);
  }
}

class FakeDocument {
  createElement(tagName) { return new FakeElement(tagName, this); }
}

function fakeContainer() {
  return new FakeDocument().createElement("main");
}

function fakeManager() {
  let nextID = 0;
  let nextSequence = 0;
  const sessions = new Map();
  const dirty = new Set();
  const calls = {
    snapshot: [], dispatch: [], complete: [], effects: [], audit: [], changes: 0,
    setChildInputs: [], publish: [], disposeTree: [],
  };

  function get(id) {
    const session = sessions.get(id);
    if (!session) throw new Error(`unknown session ${id}`);
    return session;
  }

  function createSession(parentID, depth) {
    const id = ++nextID;
    sessions.set(id, {
      id, parentID, depth, version: 0, inputs: { Title: "", ReadOnly: false }, inputRevision: 0,
      inbox: [], messages: [], outbox: [], rows: [{ ID: 1, Saved: "" }], nextRequest: 0,
    });
    return id;
  }

  function snapshot(id) {
    calls.snapshot.push(id);
    const session = get(id);
    return {
      state: {
        SessionID: session.id, ParentID: session.parentID, Depth: session.depth, Version: session.version,
        Inputs: { ...session.inputs }, InputRevision: session.inputRevision,
        Inbox: session.inbox.map((item) => ({ ...item })),
        Rows: session.rows.map((row) => ({ ...row })),
      },
      tree: element("div", "composition", {
        Kids: [
          element("button", "tick", { On: [{ Event: "click", Message: "tick", Arg: "" }], Kids: [text("Tick")] }),
          element("p", "title", { Kids: [text(`Title: ${session.inputs.Title}`)] }),
          element("p", "inbox", { Kids: [text(`Published: ${session.inbox.length}`)] }),
        ],
      }),
      bindings: [],
      messages: session.messages.map((message) => ({ ...message })),
    };
  }

  function postorder(rootID) {
    const result = [];
    function visit(id) {
      for (const child of [...sessions.values()].filter((entry) => entry.parentID === id).sort((a, b) => a.id - b.id)) {
        visit(child.id);
      }
      result.push(id);
    }
    visit(rootID);
    return result;
  }

  return {
    calls,
    sessions,
    create() { return createSession(0, 1); },
    createChild(parentID) {
      const parent = get(parentID);
      return createSession(parentID, parent.depth + 1);
    },
    tree() {
      return [...sessions.values()].sort((a, b) => a.id - b.id).map((session) => ({
        SessionID: session.id, ParentID: session.parentID, Depth: session.depth,
      }));
    },
    list() { return [...sessions.keys()].sort((a, b) => a - b); },
    snapshot,
    dispatch(id, step) {
      calls.dispatch.push(id);
      const session = get(id);
      if (step.Path !== "0" || step.Key !== "tick" || step.Event !== "click") throw new Error("invalid step");
      session.version += 1;
      session.messages.push({ Name: "tick", Arg: String(session.version) });
      session.nextRequest += 1;
      session.outbox.push({ Kind: "start", ID: session.nextRequest, Value: `tick-${id}` });
      dirty.add(id);
      return snapshot(id);
    },
    effects(id) {
      calls.effects.push(id);
      return get(id).outbox.splice(0);
    },
    complete(id, reply) {
      calls.complete.push(id);
      const session = get(id);
      session.version += 1;
      session.messages.push({ Name: "reply", Arg: String(reply.ID) });
      dirty.add(id);
      return snapshot(id);
    },
    audit(id) { calls.audit.push(id); return []; },
    dispose(id) {
      if ([...sessions.values()].some((entry) => entry.parentID === id)) throw new Error("session has children");
      sessions.delete(id);
      return [];
    },
    disposeTree(id) {
      calls.disposeTree.push(id);
      const ids = postorder(id);
      const result = ids.map((sessionID) => ({ SessionID: sessionID, Commands: [] }));
      for (const sessionID of ids) sessions.delete(sessionID);
      // Leave dirty IDs behind to exercise the browser host's disposed-node fence.
      return result;
    },
    setChildInputs(parentID, childID, inputs) {
      calls.setChildInputs.push({ parentID, childID });
      const parent = get(parentID);
      const child = get(childID);
      if (child.parentID !== parent.id) throw new Error("parent is not the immediate parent");
      if (typeof inputs?.Title !== "string" || typeof inputs?.ReadOnly !== "boolean") throw new Error("invalid inputs");
      child.inputs = { Title: inputs.Title, ReadOnly: inputs.ReadOnly };
      child.inputRevision += 1;
      child.version += 1;
      dirty.add(childID);
      return snapshot(childID);
    },
    publish(childID, rowID, inputRevision) {
      calls.publish.push({ childID, rowID, inputRevision });
      const child = get(childID);
      if (child.parentID === 0 || inputRevision !== child.inputRevision) return { error: "publish revision rejected" };
      const row = child.rows.find((entry) => entry.ID === rowID);
      if (!row || row.Saved === "" || child.inputs.ReadOnly) return { error: "publish policy rejected" };
      const publication = {
        Sequence: ++nextSequence, ParentID: child.parentID, ChildID: childID, RowID: rowID,
        Saved: row.Saved, Saves: 1, InputRevision: inputRevision,
      };
      get(child.parentID).inbox.push({ ...publication });
      child.messages.push({ Name: "publish", Arg: `${rowID}/${inputRevision}` });
      dirty.add(childID);
      dirty.add(child.parentID);
      return publication;
    },
    changes() {
      calls.changes += 1;
      const changed = [...dirty].sort((a, b) => a - b);
      dirty.clear();
      return changed;
    },
  };
}

function recordingRenderers(records, manager) {
  function mount(name, root, runtime) {
    const initial = runtime.init();
    const record = { name, root, runtime, latest: initial, focus: null, updates: [], mounted: true };
    const api = {
      update(next) {
        if (manager.failUpdate) throw new Error("renderer refresh failed");
        record.latest = next;
        record.updates.push(next);
      },
      snapshot() { return record.latest; },
      domSnapshot() { return { html: `${name}:${record.latest.state.SessionID}`, disabled: [] }; },
      focusState() { return record.focus && { ...record.focus }; },
      restoreFocus(next) { record.focus = next && { ...next }; },
      click(path) {
        if (path !== "0") throw new Error("only tick path is clickable");
        const next = runtime.dispatch({ Path: "0", Event: "click", Value: "", Key: "tick" });
        api.update(next);
        return next;
      },
      unmount() { record.mounted = false; },
    };
    record.click = api.click;
    records.push(record);
    return api;
  }
  return {
    dom: (root, runtime) => mount("dom", root, runtime),
    react: (root, runtime) => mount("react", root, runtime),
  };
}

function setup(manager = fakeManager()) {
  const records = [];
  const transports = new Map();
  const host = createCompositionHost({
    manager,
    descriptors: recordingRenderers(records, manager),
    transportFactory(sessionID) {
      const transport = createManualTransport();
      transports.set(sessionID, transport);
      return transport;
    },
  });
  return { host, manager, records, transports };
}

function currentRenderer(records, id) {
  const record = [...records].reverse().find((entry) => entry.latest.state.SessionID === id && entry.mounted);
  assert.ok(record, `expected a mounted renderer for ${id}`);
  return record;
}

function includesError(error, phrase) {
  if (!error) return false;
  if (String(error.message ?? error).includes(phrase)) return true;
  if (error.cause && includesError(error.cause, phrase)) return true;
  return Array.isArray(error.errors) && error.errors.some((nested) => includesError(nested, phrase));
}

test("renderer dispatch schedules dirty refresh after the event and settled waits for effects", async () => {
  const { host, manager, records, transports } = setup();
  const root = host.mountRoot(fakeContainer());
  const child = host.mountChild(root.sessionID);
  const parentRenderer = currentRenderer(records, root.sessionID);
  const childRenderer = currentRenderer(records, child.sessionID);

  childRenderer.click("0");
  assert.equal(childRenderer.updates.length, 1, "the renderer paints its dispatch result synchronously");
  assert.equal(parentRenderer.updates.length, 0);
  assert.deepEqual(transports.get(child.sessionID).log(), [], "effect work waits until the event callback returns");
  await host.settled();

  assert.equal(childRenderer.updates.length, 2, "the Go dirty snapshot is refreshed in place");
  assert.equal(parentRenderer.updates.length, 0, "an unrelated parent stays untouched");
  assert.equal(host.snapshot(child.sessionID).state.Version, 1);
  assert.deepEqual(transports.get(child.sessionID).log(), [
    { kind: "start", command: { Kind: "start", ID: 1, Value: `tick-${child.sessionID}` } },
  ]);
  assert.equal(manager.calls.snapshot.filter((id) => id === child.sessionID).length, 3,
    "initialization, dispatch, and dirty refresh all read Go snapshots without reinitializing");
  host.dispose(root.sessionID);
});

test("child inputs and publication refresh only Go-dirty sessions and keep renderers mounted", async () => {
  const { host, manager, records } = setup();
  const root = host.mountRoot(fakeContainer());
  const child = host.mountChild(root.sessionID);
  const parentRenderer = currentRenderer(records, root.sessionID);
  const childRenderer = currentRenderer(records, child.sessionID);
  const childFocus = { key: "publish", selectionStart: 2, selectionEnd: 4, selectionDirection: "forward" };
  childRenderer.focus = childFocus;

  const inputSnapshot = host.setChildInputs(root.sessionID, child.sessionID, { Title: "child title", ReadOnly: false });
  assert.equal(inputSnapshot.state.InputRevision, 1);
  assert.equal(childRenderer.updates.length, 0, "the host waits until the call stack returns");
  await host.settled();
  assert.equal(childRenderer.latest.state.Inputs.Title, "child title");
  assert.equal(childRenderer.updates.length, 1);
  assert.equal(parentRenderer.updates.length, 0);
  assert.deepEqual(childRenderer.focus, childFocus);

  manager.sessions.get(child.sessionID).rows[0].Saved = "captured value";
  const receipt = host.publish(child.sessionID, 1, 1);
  assert.equal(receipt.Saved, "captured value");
  assert.equal(parentRenderer.updates.length, 0, "publication updates wait for propagation");
  await host.settled();

  assert.equal(childRenderer.updates.length, 2);
  assert.equal(parentRenderer.updates.length, 1);
  assert.equal(host.snapshot(root.sessionID).state.Inbox.length, 1);
  assert.deepEqual(host.snapshot(child.sessionID).messages.at(-1), { Name: "publish", Arg: "1/1" });
  assert.equal(currentRenderer(records, root.sessionID), parentRenderer, "the existing parent renderer is retained");
  assert.equal(currentRenderer(records, child.sessionID), childRenderer, "the existing child renderer is retained");
  host.dispose(root.sessionID);
});

test("policy errors do not dirty or poison a live composition host", async () => {
  const { host, manager, records } = setup();
  const rootA = host.mountRoot(fakeContainer());
  const childA = host.mountChild(rootA.sessionID);
  const rootB = host.mountRoot(fakeContainer());
  const beforeChanges = manager.calls.changes;

  assert.throws(() => host.setChildInputs(rootB.sessionID, childA.sessionID, { Title: "wrong parent", ReadOnly: false }),
    (error) => includesError(error, "immediate parent"));
  assert.throws(() => host.publish(childA.sessionID, 1, 99), (error) => includesError(error, "revision rejected"));
  assert.equal(manager.calls.changes, beforeChanges, "rejected calls do not schedule a dirty drain");
  await host.settled();
  assert.equal(host.snapshot(childA.sessionID).state.InputRevision, 0);
  assert.equal(host.snapshotAll().every((entry) => entry.lifecycle === "active"), true);
  assert.equal(records.filter((entry) => entry.updates.length > 0).length, 0);

  host.dispose(rootA.sessionID);
  host.dispose(rootB.sessionID);
});

test("host forwards raw input records to the strict manager without inspecting them", () => {
  const manager = fakeManager();
  const { host } = setup(manager);
  const root = host.mountRoot(fakeContainer());
  const child = host.mountChild(root.sessionID);
  let getterReads = 0;
  let receivedInputs;
  const symbol = Symbol("unknown input field");
  const inputs = { ReadOnly: false, [symbol]: "preserve for strict rejection" };
  Object.defineProperty(inputs, "Title", {
    enumerable: true,
    get() {
      getterReads += 1;
      throw new Error("host must not invoke caller getters");
    },
  });
  manager.setChildInputs = (_parentID, childID, value) => {
    receivedInputs = value;
    return manager.snapshot(childID);
  };

  host.setChildInputs(root.sessionID, child.sessionID, inputs);
  assert.equal(receivedInputs, inputs, "the manager receives the original record by identity");
  assert.equal(getterReads, 0);
  assert.deepEqual(Reflect.ownKeys(receivedInputs), ["ReadOnly", "Title", symbol]);
  assert.equal(Object.getOwnPropertyDescriptor(receivedInputs, "Title").get instanceof Function, true);
  host.dispose(root.sessionID);
});

test("queued dirty IDs for a disposed subtree are fenced before renderer refresh", async () => {
  const { host, manager, records } = setup();
  const root = host.mountRoot(fakeContainer());
  const child = host.mountChild(root.sessionID);
  host.setChildInputs(root.sessionID, child.sessionID, { Title: "queued", ReadOnly: false });
  const beforeDisposal = manager.calls.snapshot.filter((id) => id === child.sessionID).length;
  host.dispose(root.sessionID);
  await host.settled();

  assert.equal(manager.calls.snapshot.filter((id) => id === child.sessionID).length, beforeDisposal,
    "the queued propagation never asks Go to snapshot a retired child");
  assert.equal(records.every((entry) => !entry.mounted), true);
  assert.deepEqual(host.tree(), []);
});

test("refresh failures surface from settled without rolling back committed Go state", async () => {
  const manager = fakeManager();
  const { host, records } = setup(manager);
  const root = host.mountRoot(fakeContainer());
  const child = host.mountChild(root.sessionID);
  manager.failUpdate = true;

  host.setChildInputs(root.sessionID, child.sessionID, { Title: "committed", ReadOnly: false });
  await assert.rejects(host.settled(), (error) => includesError(error, "renderer refresh failed"));
  assert.equal(manager.sessions.get(child.sessionID).inputs.Title, "committed");
  assert.equal(host.snapshotAll().find((entry) => entry.sessionID === child.sessionID).lifecycle, "failed");
  assert.ok(records.some((entry) => entry.latest.state.SessionID === child.sessionID && !entry.mounted));

  manager.failUpdate = false;
  host.dispose(root.sessionID);
});

test("one manager cannot be owned by two composition hosts", () => {
  const manager = fakeManager();
  const first = setup(manager).host;
  assert.throws(() => createCompositionHost({ manager, descriptors: {}, transportFactory() {} }), /already has an active/);
  assert.deepEqual(first.tree(), []);
});
