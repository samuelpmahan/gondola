import test from "node:test";
import assert from "node:assert/strict";

const protocolModule = await import("./protocol.mjs").catch(() => null);

const manifest = {
  protocol: "gobi.keyed-renderer",
  version: 1,
  capabilities: ["keyed-update", "controlled-input", "disabled-controls", "logical-focus", "failure-notification"],
  methods: ["update", "snapshot", "domSnapshot", "click", "focusState", "restoreFocus", "unmount"],
  tags: ["div", "p", "input", "button"],
  attributes: ["class", "type", "value", "aria-label", "disabled"],
  events: ["click", "input"],
  nodeKinds: [1, 2],
  keyPattern: "^[A-Za-z][A-Za-z0-9-]{0,63}$",
  maxDepth: 64,
  maxNodes: 4096,
  messageBlankRunes: "\t\n\v\f\r \u0085\u00a0\u1680" +
    "\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a" +
    "\u2028\u2029\u202f\u205f\u3000\ufeff",
};

const attr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const element = (Tag, Key, Kids = null, Attrs = null) => ({
  Kind: 1, Tag, Key, Attrs, On: null, Kids, Text: "",
});

function snapshot() {
  return {
    state: {},
    tree: element("div", "collection", [
      element("p", "status", [text("ready")]),
    ]),
    bindings: [],
    messages: [],
  };
}

test("manifest admission accepts the bounded keyed tree and enforces manifest depth and node kinds", () => {
  assert.equal(typeof protocolModule?.validateSnapshotAgainstManifest, "function",
    "protocol module must expose manifest-driven snapshot admission");
  const validate = protocolModule.validateSnapshotAgainstManifest;
  const valid = snapshot();
  assert.equal(validate(valid, manifest), valid);

  assert.throws(() => validate(snapshot(), { ...manifest, maxDepth: 0 }), /depth/i,
    "root depth is zero, so the child exceeds a zero-depth manifest");
  assert.throws(() => validate(snapshot(), { ...manifest, nodeKinds: [1] }), /kind/i,
    "text nodes must be rejected when the generated manifest excludes their kind");
});

test("manifest admission enforces node count, tags, and generated key pattern", () => {
  assert.equal(typeof protocolModule?.validateSnapshotAgainstManifest, "function",
    "protocol module must expose manifest-driven snapshot admission");
  const validate = protocolModule.validateSnapshotAgainstManifest;
  assert.throws(() => validate(snapshot(), { ...manifest, maxNodes: 2 }), /node count/i);
  assert.throws(() => validate(snapshot(), { ...manifest, tags: ["p", "input", "button"] }), /tag/i);
  assert.throws(() => validate(snapshot(), { ...manifest, keyPattern: "^row-[0-9]+$" }), /key/i);
});

test("handler and binding names follow Go's generated blank-rune set", () => {
  assert.equal(typeof protocolModule?.validateSnapshotAgainstManifest, "function",
    "protocol module must expose manifest-driven snapshot admission");
  const validate = protocolModule.validateSnapshotAgainstManifest;
  const cases = [
    {
      field: "handler",
      value: "\u0085",
      snapshot: (Message) => ({
        state: {},
        tree: element("div", "collection", [
          { Kind: 1, Tag: "button", Key: "save", Attrs: null,
            On: [{ Event: "click", Message, Arg: "" }], Kids: null, Text: "" },
        ]),
        bindings: [],
        messages: [],
      }),
    },
    {
      field: "handler",
      value: "\ufeff",
      snapshot: (Message) => ({
        state: {},
        tree: element("div", "collection", [
          { Kind: 1, Tag: "button", Key: "save", Attrs: null,
            On: [{ Event: "click", Message, Arg: "" }], Kids: null, Text: "" },
        ]),
        bindings: [],
        messages: [],
      }),
    },
    {
      field: "binding",
      value: "\u0085",
      snapshot: (Message) => ({
        state: {},
        tree: element("div", "collection", [
          element("input", "draft", null, [attr("type", "text"), attr("value", "")]),
        ]),
        bindings: [{ Path: "0", Event: "input", Message, Source: "target.value" }],
        messages: [],
      }),
    },
    {
      field: "binding",
      value: "\ufeff",
      snapshot: (Message) => ({
        state: {},
        tree: element("div", "collection", [
          element("input", "draft", null, [attr("type", "text"), attr("value", "")]),
        ]),
        bindings: [{ Path: "0", Event: "input", Message, Source: "target.value" }],
        messages: [],
      }),
    },
  ];

  for (const item of cases) {
    assert.throws(() => validate(item.snapshot(item.value), manifest), /blank|empty|non-empty/i,
      `${item.field} message containing only ${item.value.codePointAt(0).toString(16)} must be blank`);
  }
});

test("blank-rune policy is required and must be a canonical unique code-point string", () => {
  assert.equal(typeof protocolModule?.validateManifest, "function", "protocol module must validate manifest shape");
  const { messageBlankRunes: _omitted, ...withoutBlankRunes } = manifest;
  assert.throws(() => protocolModule.validateManifest(withoutBlankRunes), /messageBlankRunes/i);
  assert.throws(() => protocolModule.validateManifest({ ...manifest, messageBlankRunes: "\uFEFF\u0085" }), /canonical|code-point/i);
  assert.throws(() => protocolModule.validateManifest({ ...manifest, messageBlankRunes: "\u0085\u0085" }), /duplicate/i);
});
