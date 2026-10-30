import assert from "node:assert/strict";
import test from "node:test";
import { lowerView } from "./renderer.mjs";

const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const attr = (Name, Value = "", Flag = false, Style = null) => ({ Name, Value, Flag, Style });
const style = (Property, Value) => ({ Property, Value });
const on = (Event, Message, Arg = "") => ({ Event, Message, Arg });
const element = (Tag, Key, { Attrs = null, On = null, Kids = null } = {}) => ({
  Kind: 1, Tag, Key, Attrs, On, Kids, Text: "",
});
const binding = (Path, Event, Message, Source) => ({ Path, Event, Message, Source });
const view = (Tree, Bindings = []) => ({ Tree, Bindings });
const goStruct = (value) => ({ ...value, __goStructValue: true });
const goSlice = (backing, offset = 0, length = backing.length, capacity = backing.length, withTarget = true) => (
  withTarget
    ? { backing, offset, length, capacity, target: undefined }
    : { backing, offset, length, capacity }
);

function lower(value, calls = {}) {
  return lowerView(value, {
    dispatch: calls.dispatch ?? (() => {}),
    onStaleAction: calls.onStaleAction ?? (() => {}),
    isCurrent: calls.isCurrent ?? (() => true),
    refFor: calls.refFor ?? (() => null),
    renderEpoch: calls.renderEpoch ?? 1,
  });
}

test("lowers keys, React attribute names, ordered style properties, and nested children", () => {
  const tree = element("div", "app", {
    Attrs: [
      attr("class", "form"),
      attr("style", "", false, [style("margin-top", " 2px "), style("color", "red")]),
    ],
    Kids: [element("p", "label", { Kids: [text("Name")] })],
  });
  const { element: reactTree } = lower(view(tree));

  assert.equal(reactTree.key, "app");
  assert.equal(reactTree.props.className, "form");
  assert.deepEqual(reactTree.props.style, { marginTop: "2px", color: "red" });
  assert.equal(reactTree.props.children.key, "label");
  assert.equal(reactTree.props.children.props.children, "Name");
});

test("admits the observed pinned-GoScript struct marker and slice windows", () => {
  const tree = goStruct({
    Kind: 1,
    Tag: "button",
    Key: "save",
    Attrs: goSlice([
      goStruct(attr("class", "primary")),
      goStruct(attr("style", "", false, goSlice([goStruct(style("color", "red"))]))),
    ]),
    On: goSlice([goStruct(on("click", "save", "literal"))], 0, 1, 1, true),
    Kids: [goStruct(text("Save"))],
    Text: "",
  });
  const { element: reactTree } = lower(goStruct({ Tree: tree, Bindings: goSlice([]) }));
  assert.equal(reactTree.props.className, "primary");
  assert.deepEqual(reactTree.props.style, { color: "red" });
  assert.equal(reactTree.props.children, "Save");
  assert.equal(typeof reactTree.props.onClick, "function");

  const windowed = goSlice([
    goStruct(on("click", "ignored")),
    goStruct(on("click", "kept", "window")),
  ], 1, 1, 1, true);
  const windowTree = goStruct({ ...element("button", "windowed"), On: windowed });
  const delivered = [];
  lower(goStruct({ Tree: windowTree, Bindings: goSlice([]) }), {
    dispatch: (...args) => delivered.push(args),
  }).element.props.onClick({ currentTarget: { disabled: false } });
  assert.deepEqual(delivered, [[{ path: "", event: "click", value: "" }, { Name: "kept", Arg: "window" }]]);
});

test("rejects hidden schema fields, accessor-backed fields, and an invalid observed slice target", () => {
  const hiddenExtra = element("button", "save", { On: [on("click", "save")] });
  Object.defineProperty(hiddenExtra, "internal", { value: true });
  assert.throws(() => lower(view(hiddenExtra)), /must contain exactly/);

  const accessorAttr = attr("class", "safe");
  Object.defineProperty(accessorAttr, "Value", {
    enumerable: true,
    configurable: true,
    get() { throw new Error("getter must not run"); },
  });
  const accessorNode = element("button", "save", { Attrs: [accessorAttr] });
  assert.throws(() => lower(view(accessorNode)), /not an own data property/);

  const badSlice = goSlice([goStruct(on("click", "save"))], 0, 1, 1, true);
  badSlice.target = {};
  const badSliceNode = goStruct({ ...element("button", "save"), On: badSlice });
  assert.throws(() => lower(view(badSliceNode)), /invalid GoScript slice bounds or backing/);

  const sparseKids = [];
  sparseKids.length = 1;
  const sparseNode = element("div", "root", { Kids: sparseKids });
  assert.throws(() => lower(view(sparseNode)), /dense native array/);
});

test("rejects GoScript slice wrappers without the observed own undefined target field", () => {
  const unobservedShape = goSlice([goStruct(on("click", "save"))], 0, 1, 1, false);
  const tree = goStruct({ ...element("button", "save"), On: unobservedShape });
  assert.throws(() => lower(goStruct({ Tree: tree, Bindings: goSlice([]) })), /unsupported GoScript slice shape/);
});

test("rejects a proxied slice whose target descriptor is invalid even when get masks it", () => {
  const raw = { backing: [goStruct(on("click", "save"))], offset: 0, length: 1, capacity: 1, target: {} };
  let targetGets = 0;
  const slice = new Proxy(raw, {
    get(target, key, receiver) {
      if (key === "target") {
        targetGets += 1;
        return undefined;
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const tree = goStruct({ ...element("button", "save"), On: slice });

  assert.throws(() => lower(goStruct({ Tree: tree, Bindings: goSlice([]) })), /invalid GoScript slice bounds or backing/);
  assert.equal(targetGets, 0, "descriptor validation must not consult the Proxy get trap");
});

test("snapshots GoScript wrapper and backing array descriptors without ordinary gets", () => {
  const rawBacking = [goStruct(on("click", "save", "literal"))];
  const backing = new Proxy(rawBacking, {
    get(target, key, receiver) {
      if (key === "slice" || key === "length" || key === "0") throw new Error(`unexpected backing get: ${String(key)}`);
      return Reflect.get(target, key, receiver);
    },
  });
  const rawSlice = { backing, offset: 0, length: 1, capacity: 1, target: undefined };
  const slice = new Proxy(rawSlice, {
    get(_target, key) { throw new Error(`unexpected slice get: ${String(key)}`); },
  });
  const tree = goStruct({ ...element("button", "save"), On: slice });

  const { element: reactTree } = lower(goStruct({ Tree: tree, Bindings: goSlice([]) }));
  assert.equal(typeof reactTree.props.onClick, "function");
});

test("snapshots native array descriptors before using length or elements", () => {
  const rawKids = [goStruct(text("safe child"))];
  const kids = new Proxy(rawKids, {
    get(target, key, receiver) {
      if (key === "length" || key === "0") throw new Error(`unexpected native array get: ${String(key)}`);
      return Reflect.get(target, key, receiver);
    },
  });
  const { element: reactTree } = lower(view(element("div", "root", { Kids: kids })));

  assert.equal(reactTree.props.children, "safe child");
});

test("rejects accessor descriptors in proxied native arrays without invoking them", () => {
  let getterCalls = 0;
  const rawKids = [];
  rawKids.length = 1;
  Object.defineProperty(rawKids, "0", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      throw new Error("array accessor must not run");
    },
  });
  const kids = new Proxy(rawKids, {
    get(_target, key) { throw new Error(`unexpected native array get: ${String(key)}`); },
  });

  assert.throws(() => lower(view(element("div", "root", { Kids: kids }))), /own data property/);
  assert.equal(getterCalls, 0);
});

test("uses own metadata descriptor values and ignores inherited view aliases", () => {
  const proxiedHandler = new Proxy(on("click", "save"), {
    get(_target, key) { throw new Error(`unexpected handler get: ${String(key)}`); },
  });
  const proxiedNode = new Proxy(element("button", "save", { On: [proxiedHandler] }), {
    get(_target, key) { throw new Error(`unexpected node get: ${String(key)}`); },
  });
  const rawView = { Tree: proxiedNode, Bindings: [] };
  const proxiedView = new Proxy(rawView, {
    get(_target, key) { throw new Error(`unexpected view get: ${String(key)}`); },
  });
  assert.equal(typeof lower(proxiedView).element.props.onClick, "function");

  const inheritedView = Object.create({ Tree: rawView.Tree, Bindings: [] });
  assert.throws(() => lower(inheritedView), /must contain exactly/);
});

test("forwards dynamic text and checkbox values from live target properties", () => {
  const textInput = goStruct({ ...element("input", "draft", {
    Attrs: goSlice([goStruct(attr("type", "text")), goStruct(attr("value", "old"))]),
  }),
  });
  const checkedInput = goStruct({ ...element("input", "enabled", {
    Attrs: goSlice([goStruct(attr("type", "checkbox")), goStruct(attr("checked", "", true))]),
  }),
  });
  const root = goStruct({ ...element("div", "root", { Kids: [textInput, checkedInput] }) });
  const events = [];
  const typedView = goStruct({
    Tree: root,
    Bindings: goSlice([
      goStruct(binding("0", "input", "draft", "target.value")),
      goStruct(binding("1", "change", "enabled", "target.checked")),
    ]),
  });
  const { element: reactTree } = lower(typedView, { dispatch: (...args) => events.push(args) });

  const [draft, enabled] = reactTree.props.children;
  draft.props.onInput({ currentTarget: { value: "typed", disabled: false } });
  enabled.props.onChange({ currentTarget: { checked: false, disabled: false } });
  enabled.props.onChange({ currentTarget: { checked: true, disabled: false } });

  assert.deepEqual(events, [
    [{ path: "0", event: "input", value: "typed" }, { Name: "draft", Arg: "typed" }],
    [{ path: "1", event: "change", value: "false" }, { Name: "enabled", Arg: "false" }],
    [{ path: "1", event: "change", value: "true" }, { Name: "enabled", Arg: "true" }],
  ]);
});

test("records the physical target value without replacing literal On.Arg", () => {
  const button = element("button", "submit", { On: [on("click", "submit", "target.value")] });
  let received;
  const { element: reactTree } = lower(view(button), { dispatch: (...args) => { received = args; } });

  reactTree.props.onClick({ currentTarget: { value: "physical button value", disabled: false } });
  assert.deepEqual(received, [
    { path: "", event: "click", value: "physical button value" },
    { Name: "submit", Arg: "target.value" },
  ]);
});

test("reports stale detached callbacks with their captured render epoch", () => {
  const button = element("button", "save", { On: [on("click", "save", "literal")] });
  const stale = [];
  const { element: reactTree } = lower(view(button), {
    renderEpoch: 4,
    isCurrent: () => false,
    onStaleAction: (...args) => stale.push(args),
  });

  reactTree.props.onClick({ currentTarget: { disabled: false } });
  assert.deepEqual(stale, [[{ path: "", event: "click", value: "" }, 4]]);
});

test("rejects unknown and duplicate events, including literal-binding collisions", () => {
  const unknown = element("button", "bad", { On: [on("not-a-dom-event", "bad")] });
  const duplicate = element("button", "bad", { On: [on("click", "a"), on("click", "b")] });
  const collision = element("input", "draft", {
    Attrs: [attr("type", "text"), attr("value", "")],
    On: [on("input", "literal")],
  });
  assert.throws(() => lower(view(unknown)), /unsupported event/);
  assert.throws(() => lower(view(duplicate)), /duplicate event/);
  assert.throws(() => lower(view(collision, [binding("", "input", "bound", "target.value")])), /collides with literal/);
});

test("rejects duplicate sibling keys while allowing keys in separate sibling groups", () => {
  const repeated = element("div", "root", {
    Kids: [element("p", "same"), element("button", "same")],
  });
  const separate = element("div", "root", {
    Kids: [
      element("section", "left", { Kids: [element("p", "item")] }),
      element("section", "right", { Kids: [element("p", "item")] }),
    ],
  });
  assert.throws(() => lower(view(repeated)), /duplicate sibling key/);
  assert.doesNotThrow(() => lower(view(separate)));
});

test("keeps nested unkeyed controls attached to their keyed parent identity across reorders", () => {
  const row = (key) => element("li", key, { Kids: [element("input", "")] });
  const identities = (kids) => {
    const found = new Map();
    lower(view(element("ul", "root", { Kids: kids })), {
      refFor(path, identity, node) {
        if (node.Tag === "input") found.set(node?.Key || path, identity);
        return null;
      },
    });
    return found;
  };
  const before = identities([row("a"), row("b")]);
  const after = identities([row("b"), row("a")]);
  assert.equal(before.get("0/0"), after.get("1/0"));
  assert.notEqual(before.get("0/0"), after.get("0/0"));
});

test("tracks fragment identity scopes and rejects duplicate keyed fragments", () => {
  const fragment = (key) => ({ Kind: 3, Tag: "", Key: key, Attrs: null, On: null, Kids: [element("input", "")], Text: "" });
  const ids = [];
  lower(view(element("div", "root", { Kids: [fragment("first"), fragment("second")] })), {
    refFor(path, identity, node) {
      if (node.Tag === "input") ids.push({ path, identity });
      return null;
    },
  });
  assert.deepEqual(ids, [
    { path: "0/0", identity: '["root","first","@0"]' },
    { path: "1/0", identity: '["root","second","@0"]' },
  ]);
  assert.throws(() => lower(view(element("div", "root", { Kids: [fragment("same"), fragment("same")] }))), /duplicate sibling key/);
});

test("rejects invalid binding paths, targets, sources, events, and value modes", () => {
  const root = element("div", "root", {
    Kids: [
      element("input", "draft", { Attrs: [attr("type", "text"), attr("value", "")] }),
      element("input", "enabled", { Attrs: [attr("type", "checkbox")] }),
    ],
  });
  const invalid = [
    binding("00", "input", "draft", "target.value"),
    binding("8", "input", "draft", "target.value"),
    binding("0", "change", "draft", "target.value"),
    binding("1", "input", "enabled", "target.checked"),
    binding("1", "change", "enabled", "target.checked-ish"),
    binding("", "change", "enabled", "target.checked"),
  ];
  for (const item of invalid) assert.throws(() => lower(view(root, [item])));
});

