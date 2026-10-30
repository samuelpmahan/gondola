import assert from "node:assert/strict";
import { createCompositionHost } from "../../host.mjs";

class Element {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.childNodes = [];
    this.parentNode = null;
    this.className = "";
  }
  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index < 0) throw new Error("missing child");
    this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }
  replaceChildren(...nodes) {
    for (const node of this.childNodes) node.parentNode = null;
    this.childNodes = [];
    for (const node of nodes) this.appendChild(node);
  }
}

class Document {
  createElement(tagName) { return new Element(tagName, this); }
}

const sessions = new Map();
const dirty = new Set();
const managerCalls = { snapshots: 0, dispatch: 0, complete: 0, effects: 0, changes: 0 };
let nextID = 0;

function makeSession(parentID) {
  const id = ++nextID;
  sessions.set(id, { id, parentID, status: "idle", saved: "", pending: 0, nextRequest: 0, outbox: [], messages: [] });
  return id;
}

function snapshot(id) {
  managerCalls.snapshots += 1;
  const session = sessions.get(id);
  if (!session) throw new Error(`unknown session ${id}`);
  return {
    state: {
      Version: session.messages.length,
      Saved: session.saved,
      PendingID: session.pending,
      Status: session.status,
      Inputs: { Title: "", ReadOnly: false },
      InputRevision: 0,
      Inbox: [],
      Rows: [],
    },
    tree: { Kind: 1, Tag: "div", Key: "composition", Attrs: null, On: null, Text: "",
      Kids: [{ Kind: 1, Tag: "button", Key: "save", Attrs: null,
        On: [{ Event: "click", Message: "save", Arg: "" }], Text: "",
        Kids: [{ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text: "Save" }] }] },
    bindings: [],
    messages: session.messages.map((message) => ({ ...message })),
  };
}

const manager = {
  create() { return makeSession(0); },
  createChild(parentID) { return makeSession(parentID); },
  tree() { return [...sessions.values()].map(({ id, parentID }) => ({ SessionID: id, ParentID: parentID, Depth: parentID ? 2 : 1 })); },
  list() { return [...sessions.keys()]; },
  snapshot,
  dispatch(id, step) {
    managerCalls.dispatch += 1;
    assert.deepEqual(step, { Path: "0", Event: "click", Value: "", Key: "save" });
    const session = sessions.get(id);
    session.status = "pending";
    session.nextRequest += 1;
    session.pending = session.nextRequest;
    session.outbox.push({ Kind: "start", ID: session.pending, Value: "saved by transport" });
    session.messages.push({ Name: "save", Arg: "" });
    dirty.add(id);
    return snapshot(id);
  },
  effects(id) {
    managerCalls.effects += 1;
    return sessions.get(id).outbox.splice(0);
  },
  complete(id, reply) {
    managerCalls.complete += 1;
    const session = sessions.get(id);
    session.saved = reply.Value;
    session.status = "saved";
    session.pending = 0;
    session.messages.push({ Name: "reply", Arg: String(reply.ID) });
    dirty.add(id);
    return snapshot(id);
  },
  audit() { return []; },
  dispose(id) { sessions.delete(id); return []; },
  disposeTree(id) { sessions.delete(id); return [{ SessionID: id, Commands: [] }]; },
  setChildInputs() { throw new Error("unused"); },
  publish() { throw new Error("unused"); },
  changes() {
    managerCalls.changes += 1;
    const ids = [...dirty].sort((a, b) => a - b);
    dirty.clear();
    return ids;
  },
};

const records = [];
const host = createCompositionHost({
  manager,
  descriptors: {
    dom(root, runtime) {
      const record = { root, runtime, latest: runtime.init(), updates: 0, mounted: true };
      const api = {
        update(next) { record.latest = next; record.updates += 1; },
        snapshot() { return record.latest; },
        domSnapshot() { return { html: "", disabled: [] }; },
        focusState() { return null; },
        restoreFocus() {},
        click() {
          const next = runtime.dispatch({ Path: "0", Event: "click", Value: "", Key: "save" });
          api.update(next);
        },
        unmount() { record.mounted = false; },
      };
      record.click = api.click;
      records.push(record);
      return api;
    },
  },
  transportFactory() {
    return {
      start(command, deliver) {
        queueMicrotask(() => deliver({ ID: command.ID, Value: command.Value, Error: "" }));
      },
      cancel() {},
    };
  },
});

const mounted = host.mountRoot(new Element("main", new Document()));
const record = records[0];
record.click();
assert.equal(record.latest.state.Status, "pending", "dispatch paints its immediate Go snapshot");
assert.equal(managerCalls.complete, 0, "effects wait until the host pump runs");
await host.settled();
assert.equal(record.latest.state.Saved, "saved by transport", "settled includes async completion");
assert.equal(record.latest.state.Status, "saved");
assert.equal(managerCalls.complete, 1);
assert.ok(managerCalls.snapshots >= 5, "initial, dispatch, propagation, completion, and completion propagation snapshots were read");
assert.equal(record.mounted, true, "refreshes retained the same renderer instance");
assert.ok(record.updates >= 3, "dispatch, dispatch propagation, and completion painted through update");
host.dispose(mounted.sessionID);
console.log(JSON.stringify({ ok: true, managerCalls, rendererUpdates: record.updates, saved: record.latest.state.Saved }));
