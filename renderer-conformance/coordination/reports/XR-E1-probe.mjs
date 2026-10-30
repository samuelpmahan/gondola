import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateSnapshotAgainstManifest } from "../../protocol.mjs";

const root = resolve(import.meta.dirname, "../../..");
const manifest = JSON.parse(readFileSync(resolve(root, "renderer-conformance/build/manifest.json"), "utf8"));
const command = process.env.RENDER_CONTRACT_BIN ?? resolve(root, "renderer-conformance/build/render-contract");
const space = [...manifest.messageBlankRunes];
const blankMatrix = [];

function baseSnapshot() {
  return {
    state: { extension: { nested: [null, true, 4, "opaque"] } },
    tree: {
      Kind: 1, Tag: "div", Key: "root", Attrs: null,
      On: null,
      Kids: [{
        Kind: 1, Tag: "input", Key: "input", Attrs: [
          { Name: "type", Value: "text", Flag: false, Style: null },
          { Name: "value", Value: "", Flag: false, Style: null },
        ], On: null, Kids: null, Text: "",
      }], Text: "",
    },
    bindings: [{ Path: "0", Event: "input", Message: "change", Source: "target.value" }],
    messages: [],
  };
}

function nativeValid(snapshot) {
  const child = spawnSync(command, ["validate"], {
    cwd: root,
    input: JSON.stringify(snapshot),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  assert.equal(child.error, undefined, child.error?.message);
  let result;
  try { result = JSON.parse(child.stdout); }
  catch (error) { throw new Error(`invalid CLI JSON: ${child.stdout}`, { cause: error }); }
  assert.equal(typeof result.valid, "boolean", JSON.stringify(result));
  return result.valid;
}

function nativeRawValid(raw) {
  const child = spawnSync(command, ["validate"], {
    cwd: root,
    input: raw,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  assert.equal(child.error, undefined, child.error?.message);
  let result;
  try { result = JSON.parse(child.stdout); }
  catch (error) { throw new Error(`invalid CLI JSON: ${child.stdout}`, { cause: error }); }
  return result.valid;
}

for (const rune of space) {
  for (const target of ["handler", "binding"]) {
    const snapshot = baseSnapshot();
    if (target === "handler") {
      snapshot.tree.On = [{ Event: "click", Message: rune, Arg: "" }];
    } else {
      snapshot.bindings[0].Message = rune;
    }
    assert.throws(() => validateSnapshotAgainstManifest(snapshot, manifest),
      `${target} U+${rune.codePointAt(0).toString(16)} must reject in JS`);
    assert.equal(nativeValid(snapshot), false,
      `${target} U+${rune.codePointAt(0).toString(16)} must reject in Go`);
    blankMatrix.push({ target, codePoint: rune.codePointAt(0) });
  }
}

for (const target of ["handler", "binding"]) {
  const snapshot = baseSnapshot();
  if (target === "handler") snapshot.tree.On = [{ Event: "click", Message: "\u200b", Arg: "" }];
  else snapshot.bindings[0].Message = "\u200b";
  assert.equal(validateSnapshotAgainstManifest(snapshot, manifest), snapshot,
    `${target} U+200B should remain nonblank in JS`);
  assert.equal(nativeValid(snapshot), true,
    `${target} U+200B should remain nonblank in Go`);
}

const integerLexemeRaw = `{"state":{},"tree":{"Kind":1.0,"Tag":"div","Key":"root","Attrs":null,"On":null,"Kids":null,"Text":""},"bindings":[],"messages":[]}`;
const integerLexemeObject = JSON.parse(integerLexemeRaw);
assert.equal(nativeRawValid(integerLexemeRaw), false,
  "Go's uint8 Kind parser should reject a fractional numeric lexeme");
assert.equal(validateSnapshotAgainstManifest(integerLexemeObject, manifest), integerLexemeObject,
  "JSON.parse normalizes 1.0 to integer Number 1 before JS object admission");

const result = {
  manifestBlankRunes: space.length,
  blankMatrixChecks: blankMatrix.length,
  nonblankChecks: 4,
  rawNumberLexeme: "Go rejects Kind 1.0; JS receives integer 1 and accepts (raw-only distinction)",
  status: "passed",
};
process.stdout.write(`${JSON.stringify(result)}\n`);
