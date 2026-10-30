import assert from "node:assert/strict";
import test from "node:test";

import { compareFixtureAdmissions } from "./fixture-check.mjs";

const manifest = {
  protocol: "gobi.keyed-renderer",
  version: 1,
  capabilities: [],
  methods: [],
  tags: ["div"],
  attributes: [],
  events: [],
  nodeKinds: [1],
  keyPattern: "^[A-Za-z][A-Za-z0-9-]{0,63}$",
  maxDepth: 64,
  maxNodes: 4096,
  messageBlankRunes: "\t\n\v\f\r \u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff",
};

const validSnapshot = {
  state: {},
  tree: { Kind: 1, Tag: "div", Key: "root", Attrs: null, On: null, Kids: null, Text: "" },
  bindings: [],
  messages: [],
};

test("fixture checker compares native and manifest-driven admission for JSON objects", async () => {
  const fixtures = [
    { name: "accepted", category: "valid", admission: "snapshot", expectedValid: true, raw: JSON.stringify(validSnapshot) },
    { name: "extra-field", category: "schema", admission: "snapshot", expectedValid: false, raw: JSON.stringify({ ...validSnapshot, extra: true }) },
  ];
  const seen = [];
  const result = await compareFixtureAdmissions({ manifest, fixtures }, {
    nativeValidate: async (raw, fixture) => {
      seen.push(fixture.name);
      return fixture.expectedValid;
    },
  });
  assert.equal(result.nativeChecked, 2);
  assert.equal(result.javascriptCompared, 2);
  assert.equal(result.rawJsonOnly, 0);
  assert.deepEqual(seen, ["accepted", "extra-field"]);
});

test("raw JSON-only rejects reach the native parser but never the browser object validator", async () => {
  const fixture = {
    name: "duplicate-key",
    category: "schema",
    admission: "raw-json-only",
    expectedValid: false,
    raw: '{"state":{},"state":{},"tree":{},"bindings":[],"messages":[]}',
  };
  let nativeCalls = 0;
  const result = await compareFixtureAdmissions({ manifest, fixtures: [fixture] }, {
    nativeValidate: async () => { nativeCalls += 1; return false; },
    javascriptValidate: () => assert.fail("browser-object admission must not receive raw-only JSON"),
  });
  assert.equal(nativeCalls, 1);
  assert.equal(result.javascriptCompared, 0);
  assert.equal(result.rawJsonOnly, 1);
});

test("fixture checker fails closed when native admission disagrees with the declared outcome", async () => {
  const fixture = {
    name: "native-disagrees",
    category: "schema",
    admission: "snapshot",
    expectedValid: false,
    raw: JSON.stringify({ ...validSnapshot, extra: true }),
  };
  await assert.rejects(
    compareFixtureAdmissions({ manifest, fixtures: [fixture] }, { nativeValidate: async () => true }),
    /native admission disagrees/i,
  );
});
