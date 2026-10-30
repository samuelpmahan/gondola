import test from "node:test";
import assert from "node:assert/strict";
import { createManualTransport } from "../async-effects/transport.mjs";
import { createMultiRootHost } from "./host.mjs";

const attr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const element = (Tag, Key, { Attrs = null, On = null, Kids = null } = {}) => ({
  Kind: 1, Tag, Key, Attrs, On, Kids, Text: "",
});

function snapshot(session, messages = []) {
  return {
    state: {
      Draft: session.Draft,
      Saved: session.Saved,
      PendingID: session.PendingID,
      Status: session.Status,
    },
    tree: element("div", "collection", {
      Attrs: [attr("class", "collection")],
      Kids: [
        element("input", "draft-input", {
          Attrs: [attr("type", "text"), attr("value", session.Draft), attr("aria-label", "Draft")],
        }),
        element("button", "save", {
          Attrs: [attr("class", "save"), ...(session.Draft === "" ? [attr("disabled", "", true)] : [])],
          On: [{ Event: "click", Message: "save", Arg: "" }],
          Kids: [text("Save")],
        }),
        element("p", "status", { Kids: [text(`Status: ${session.Status}`)] }),
      ],
    }),
    bindings: [{ Path: "0", Event: "input", Message: "edit", Source: "target.value" }],
    messages: messages.map((message) => ({ ...message })),
  };
}

function fakeManager() {
  let nextSessionID = 0;
  const sessions = new Map();
  const calls = { complete: [], dispose: [], dispatch: [], effects: [], snapshots: [] };

  function get(id) {
    const session = sessions.get(id);
    if (!session) throw new Error(`unknown session ${id}`);
    return session;
  }

  return {
    calls,
    sessions,
    create() {
      const id = ++nextSessionID;
      sessions.set(id, {
        Draft: "", Saved: "", PendingID: 0, Status: "idle", NextID: 0,
        messages: [], outbox: [], audit: [],
      });
      return id;
    },
    snapshot(id) {
      calls.snapshots.push(id);
      const session = get(id);
      return snapshot(session, session.messages);
    },
    dispatch(id, step) {
      calls.dispatch.push(id);
      const session = get(id);
      if (step.Path === "0" && step.Key === "draft-input" && step.Event === "input") {
        session.Draft = step.Value;
        session.messages.push({ Name: "edit", Arg: step.Value });
      } else if (step.Path === "1" && step.Key === "save" && step.Event === "click" && session.Draft !== "") {
        if (session.PendingID) session.outbox.push({ Kind: "cancel", ID: session.PendingID });
        session.NextID += 1;
        session.PendingID = session.NextID;
        session.Status = "pending";
        session.outbox.push({ Kind: "start", ID: session.PendingID, Value: session.Draft });
        session.messages.push({ Name: "save", Arg: "" });
      } else {
        throw new Error("invalid dispatch key/path pair");
      }
      return snapshot(session, session.messages);
    },
    complete(id, reply) {
      calls.complete.push({ id, reply: { ...reply } });
      const session = get(id);
      const accepted = session.PendingID === reply.ID;
      session.messages.push({ Name: "reply", Arg: String(reply.ID) });
      session.audit.push({ ID: reply.ID, Accepted: accepted });
      if (accepted) {
        session.PendingID = 0;
        session.Status = reply.Error === "" ? "saved" : `error: ${reply.Error}`;
        if (reply.Error === "") session.Saved = reply.Value;
      }
      return snapshot(session, session.messages);
    },
    effects(id) {
      calls.effects.push(id);
      return get(id).outbox.splice(0);
    },
    audit(id) {
      return get(id).audit.map((entry) => ({ ...entry }));
    },
    dispose(id) {
      calls.dispose.push(id);
      const session = get(id);
      const cancel = session.PendingID ? [{ Kind: "cancel", ID: session.PendingID }] : [];
      sessions.delete(id);
      return cancel;
    },
    list() { return [...sessions.keys()]; },
  };
}

function fakeRoot() {
  return { clearCount: 0, replaceChildren() { this.clearCount += 1; } };
}

function recordingRenderers(records, options = {}) {
  function mount(name, root, facade) {
    const initial = facade.init();
    const record = { name, root, facade, initial, latest: initial, updates: [], focus: null, mounted: true };
    const api = {
      update(next) {
        if (name === "explode-update") throw new Error("renderer update exploded");
        record.updates.push(next);
        record.latest = next;
      },
      snapshot() { return record.latest; },
      domSnapshot() { return { html: `<${name}>${record.latest.state.Status}</${name}>`, disabled: [] }; },
      focusState() { return record.focus; },
      restoreFocus(focus) { record.focus = focus; },
      click(path) {
        if (path !== "1") throw new Error("test renderer only supports the save path");
        const next = facade.dispatch({ Path: "1", Event: "click", Value: "", Key: "save" });
        api.update(next);
        return next;
      },
      unmount() { record.mounted = false; },
      input(value) {
        const next = facade.dispatch({ Path: "0", Event: "input", Value: value, Key: "draft-input" });
        api.update(next);
        return next;
      },
    };
    record.input = api.input;
    record.click = api.click;
    records.push(record);
    if (name === "broken-mount") throw new Error("renderer mount exploded");
    return api;
  }
  return Object.fromEntries(["dom", "react", "explode-update", "broken-mount"].map((name) => [
    name,
    (root, facade) => mount(name, root, facade),
  ]));
}

function composition({ manager = fakeManager(), renderRecords = [], transports = new Map(), transportFactory } = {}) {
  const factory = transportFactory ?? ((sessionID, root, generation) => {
    const transport = createManualTransport();
    transports.set(sessionID, { root, generation, transport });
    return transport;
  });
  const host = createMultiRootHost({
    manager,
    descriptors: recordingRenderers(renderRecords),
    transportFactory: factory,
  });
  return { host, manager, renderRecords, transports };
}

function includesError(error, phrase) {
  if (!error) return false;
  if (typeof error.message === "string" && error.message.includes(phrase)) return true;
  if (includesError(error.cause, phrase)) return true;
  return Array.isArray(error.errors) && error.errors.some((nested) => includesError(nested, phrase));
}

function rendererFor(records, root, name = "dom") {
  const record = [...records].reverse().find((entry) => entry.root === root && entry.name === name && entry.mounted);
  assert.ok(record, `expected a mounted ${name} renderer for root`);
  return record;
}

test("roots with the same local request ID use independent transports and sessions", async () => {
  const { host, manager, renderRecords, transports } = composition();
  const rootA = fakeRoot();
  const rootB = fakeRoot();
  const { sessionID: sessionA } = host.mount(rootA);
  const { sessionID: sessionB } = host.mount(rootB, "react");

  rendererFor(renderRecords, rootA).input("alpha");
  rendererFor(renderRecords, rootB, "react").input("beta");
  rendererFor(renderRecords, rootA).click("1");
  rendererFor(renderRecords, rootB, "react").click("1");
  await host.settled();

  assert.equal(host.session(rootA), sessionA);
  assert.equal(host.session(rootB), sessionB);
  assert.notEqual(sessionA, sessionB);
  assert.deepEqual(transports.get(sessionA).transport.log().filter((event) => event.kind === "start"), [
    { kind: "start", command: { Kind: "start", ID: 1, Value: "alpha" } },
  ]);
  assert.deepEqual(transports.get(sessionB).transport.log().filter((event) => event.kind === "start"), [
    { kind: "start", command: { Kind: "start", ID: 1, Value: "beta" } },
  ]);

  transports.get(sessionB).transport.deliver(1, { value: "beta saved" });
  await host.settled(rootB);
  assert.equal(host.snapshotAll().find((entry) => entry.sessionID === sessionB).snapshot.state.Saved, "beta saved");
  assert.equal(host.snapshotAll().find((entry) => entry.sessionID === sessionA).snapshot.state.Status, "pending");
  assert.deepEqual(manager.calls.complete.map(({ id }) => id), [sessionB]);
  host.unmount(rootA);
  host.unmount(rootB);
});

test("unmount cancels only its session and fences late replies while the sibling continues", async () => {
  const { host, manager, renderRecords, transports } = composition();
  const rootA = fakeRoot();
  const rootB = fakeRoot();
  const sessionA = host.mount(rootA).sessionID;
  const sessionB = host.mount(rootB).sessionID;

  rendererFor(renderRecords, rootA).input("cancel me");
  rendererFor(renderRecords, rootA).click("1");
  rendererFor(renderRecords, rootB).input("keep me");
  rendererFor(renderRecords, rootB).click("1");
  await host.settled();
  const completeCallsBeforeUnmount = manager.calls.complete.length;

  host.unmount(rootA);
  assert.deepEqual(manager.calls.dispose, [sessionA]);
  assert.deepEqual(transports.get(sessionA).transport.log().filter((event) => event.kind === "cancel"), [
    { kind: "cancel", id: 1 },
  ]);
  assert.deepEqual(transports.get(sessionB).transport.log().filter((event) => event.kind === "cancel"), []);

  transports.get(sessionA).transport.deliver(1, { value: "late" });
  assert.equal(manager.calls.complete.length, completeCallsBeforeUnmount, "late reply is stopped before the disposed bridge session");
  transports.get(sessionB).transport.deliver(1, { value: "sibling saved" });
  await host.settled(rootB);
  assert.equal(host.snapshotAll()[0].sessionID, sessionB);
  assert.equal(host.snapshotAll()[0].snapshot.state.Saved, "sibling saved");
  assert.throws(() => manager.snapshot(sessionA), /unknown session/);
  host.unmount(rootB);
});

test("unmount before effect draining still cancels only the disposed session's queued request", async () => {
  const { host, manager, renderRecords, transports } = composition();
  const rootA = fakeRoot();
  const rootB = fakeRoot();
  const sessionA = host.mount(rootA).sessionID;
  const sessionB = host.mount(rootB).sessionID;

  rendererFor(renderRecords, rootA).input("queued only");
  rendererFor(renderRecords, rootA).click("1");
  host.unmount(rootA);
  await Promise.resolve();

  assert.deepEqual(transports.get(sessionA).transport.log(), [{ kind: "cancel", id: 1 }]);
  assert.deepEqual(transports.get(sessionB).transport.log(), []);
  assert.ok(!manager.calls.effects.includes(sessionA), "disposed queued work never drains effects into the bridge");
  assert.equal(host.session(rootB), sessionB);
  host.unmount(rootB);
});

test("a reused DOM root receives a fresh session and generation; old callbacks cannot enter it", async () => {
  const { host, renderRecords, transports } = composition();
  const root = fakeRoot();
  const first = host.mount(root);
  rendererFor(renderRecords, root).input("old generation");
  rendererFor(renderRecords, root).click("1");
  await host.settled(root);
  const oldTransport = transports.get(first.sessionID).transport;

  host.unmount(root);
  const second = host.mount(root);
  assert.notEqual(second.sessionID, first.sessionID);
  assert.equal(second.generation, first.generation + 1);
  assert.equal(host.session(root), second.sessionID);
  assert.equal(host.snapshotAll()[0].snapshot.state.Draft, "");

  oldTransport.deliver(1, { value: "must stay old" });
  await host.settled(root);
  assert.equal(host.snapshotAll()[0].sessionID, second.sessionID);
  assert.equal(host.snapshotAll()[0].snapshot.state.Saved, "");
  host.unmount(root);
});

test("renderer swaps preserve this root's focus and a failed replacement rolls back locally", () => {
  const { host, renderRecords } = composition();
  const rootA = fakeRoot();
  const rootB = fakeRoot();
  const sessionA = host.mount(rootA).sessionID;
  const sessionB = host.mount(rootB).sessionID;
  rendererFor(renderRecords, rootA).focus = {
    key: "draft-input", selectionStart: 2, selectionEnd: 5, selectionDirection: "forward",
  };
  rendererFor(renderRecords, rootA).input("focused draft");

  host.replace(rootA, "react");
  assert.equal(host.session(rootA), sessionA);
  assert.equal(host.snapshotAll().find((entry) => entry.sessionID === sessionA).backend, "react");
  assert.deepEqual(host.snapshotAll().find((entry) => entry.sessionID === sessionA).focus, {
    key: "draft-input", selectionStart: 2, selectionEnd: 5, selectionDirection: "forward",
  });
  assert.equal(host.snapshotAll().find((entry) => entry.sessionID === sessionB).backend, "dom");

  assert.throws(() => host.replace(rootA, "broken-mount"), /failed to mount; restored "react"/);
  assert.equal(host.snapshotAll().find((entry) => entry.sessionID === sessionA).backend, "react");
  assert.equal(host.session(rootB), sessionB);
  assert.equal(host.snapshotAll().find((entry) => entry.sessionID === sessionB).lifecycle, "active");
  host.unmount(rootA);
  host.unmount(rootB);
});

test("renderer update failure is contained to one root while a sibling completion succeeds", async () => {
  const { host, renderRecords, transports } = composition();
  const rootA = fakeRoot();
  const rootB = fakeRoot();
  const sessionA = host.mount(rootA).sessionID;
  const sessionB = host.mount(rootB).sessionID;
  rendererFor(renderRecords, rootA).input("fails on paint");
  rendererFor(renderRecords, rootA).click("1");
  rendererFor(renderRecords, rootB).input("continues");
  rendererFor(renderRecords, rootB).click("1");
  await host.settled();
  host.replace(rootA, "explode-update");

  transports.get(sessionA).transport.deliver(1, { value: "A" });
  await assert.rejects(host.settled(rootA), (error) =>
    error instanceof AggregateError && error.errors.some((item) => /update failed after HTTP completion/.test(item.message)));
  transports.get(sessionB).transport.deliver(1, { value: "B" });
  await host.settled(rootB);

  const entries = host.snapshotAll();
  assert.equal(entries.find((entry) => entry.sessionID === sessionA).lifecycle, "failed");
  assert.equal(entries.find((entry) => entry.sessionID === sessionB).snapshot.state.Saved, "B");
  assert.equal(entries.find((entry) => entry.sessionID === sessionB).lifecycle, "active");
  host.unmount(rootA);
  host.unmount(rootB);
});

test("duplicate active mounts and reused transport instances fail closed", () => {
  const manager = fakeManager();
  const rootA = fakeRoot();
  const rootB = fakeRoot();
  const sharedTransport = createManualTransport();
  const records = [];
  const host = createMultiRootHost({
    manager,
    descriptors: recordingRenderers(records),
    transportFactory: () => sharedTransport,
  });

  host.mount(rootA);
  assert.throws(() => host.mount(rootA), /already mounted/);
  assert.throws(() => host.mount(rootB), /fresh transport/);
  assert.equal(host.snapshotAll().length, 1, "a rejected second root cannot disturb the live owner");
  host.unmount(rootA);
});

test("duplicate session IDs are rejected without disposing the session that already owns the ID", () => {
  const manager = fakeManager();
  let first = true;
  const originalCreate = manager.create;
  manager.create = () => {
    if (first) {
      first = false;
      return originalCreate.call(manager);
    }
    return 1;
  };
  const transports = [];
  const host = createMultiRootHost({
    manager,
    descriptors: recordingRenderers([]),
    transportFactory() {
      const transport = createManualTransport();
      transports.push(transport);
      return transport;
    },
  });
  const rootA = fakeRoot();
  const rootB = fakeRoot();
  const sessionA = host.mount(rootA).sessionID;

  assert.equal(sessionA, 1);
  assert.throws(() => host.mount(rootB), /reused session ID 1/);
  assert.equal(host.session(rootA), sessionA);
  assert.equal(host.snapshotAll().length, 1, "the duplicate ID cannot create an aliasing root");
  assert.deepEqual(manager.calls.dispose, [], "rejecting a duplicate never disposes the live owner's session");
  host.unmount(rootA);
});

test("mount surfaces a Go create error frame before allocating root resources", () => {
  const manager = fakeManager();
  manager.create = () => ({ error: "create rejected" });
  let transportFactoryCalls = 0;
  const { host } = composition({
    manager,
    transportFactory() {
      transportFactoryCalls += 1;
      return createManualTransport();
    },
  });

  assert.throws(() => host.mount(fakeRoot()), (error) => includesError(error, "create rejected"));
  assert.equal(transportFactoryCalls, 0);
  assert.deepEqual(host.snapshotAll(), []);
});

test("mount cleanup surfaces a Go snapshot error frame instead of treating it as a snapshot", () => {
  const manager = fakeManager();
  manager.snapshot = () => ({ error: "snapshot rejected" });
  const { host } = composition({ manager });

  assert.throws(() => host.mount(fakeRoot()), (error) => includesError(error, "snapshot rejected"));
  assert.deepEqual(manager.calls.dispose, [1], "failed initialization disposes the newly created bridge session");
  assert.deepEqual(host.snapshotAll(), []);
});

test("an effects error frame rejects settled work instead of being treated as an empty command list", async () => {
  const manager = fakeManager();
  manager.effects = () => ({ error: "effects rejected" });
  const { host, renderRecords } = composition({ manager });
  const root = fakeRoot();
  host.mount(root);

  rendererFor(renderRecords, root).input("pending work");
  rendererFor(renderRecords, root).click("1");
  await assert.rejects(host.settled(root), (error) => includesError(error, "effects rejected"));
  assert.equal(host.snapshotAll()[0].lifecycle, "active", "a Go bridge error does not retire an otherwise usable root");
  host.unmount(root);
});

test("a dispose error frame is reported while a sibling root remains mounted", () => {
  const manager = fakeManager();
  manager.dispose = (id) => id === 1 ? { error: "dispose rejected" } : [];
  const { host } = composition({ manager });
  const rootA = fakeRoot();
  const rootB = fakeRoot();
  const sessionA = host.mount(rootA).sessionID;
  const sessionB = host.mount(rootB).sessionID;
  assert.equal(sessionA, 1);

  assert.throws(() => host.unmount(rootA), (error) => includesError(error, "dispose rejected"));
  assert.deepEqual(host.snapshotAll().map((entry) => entry.sessionID), [sessionB]);
  assert.equal(host.session(rootB), sessionB);
  host.unmount(rootB);
});
