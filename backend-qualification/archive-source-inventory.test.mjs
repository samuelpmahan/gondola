import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildArchiveSourceInventory } from "./archive-source-inventory.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const testdata = join(here, "../portable-qualification/testdata");
const readJSON = async (name) => JSON.parse(await readFile(join(testdata, name), "utf8"));

test("source pins complete the captured 397-member inventory to the exact 405-member fixture", async () => {
  const original = await readJSON("runtime.manifest.json");
  const complete = await readJSON("runtime-complete.manifest.json");

  const originalPaths = original.members.map(({ path }) => path);
  const completeSourceMembers = complete.members.filter(({ path }) => path.startsWith("source/"));
  const sourcePins = Object.fromEntries(completeSourceMembers.map(({ path, bytes, sha256 }) => [
    path.slice("source/".length), { bytes, sha256 },
  ]));
  const inventory = buildArchiveSourceInventory(originalPaths, sourcePins);

  assert.equal(original.sourceCommit, "77f7ce36439f1ae457a397269ea5a8c6d2db1cb2");
  assert.equal(original.members.length, 397);
  assert.equal(complete.members.length, 405);
  assert.equal(completeSourceMembers.length, 177);
  assert.equal(original.members.filter(({ path }) => path.startsWith("source/")).length, 169);
  assert.deepEqual(inventory, complete.members.map(({ path }) => path).sort());

  const originalByPath = new Map(original.members.map((member) => [member.path, member]));
  const completeByPath = new Map(complete.members.map((member) => [member.path, member]));
  for (const member of original.members) {
    assert.deepEqual(completeByPath.get(member.path), member, `original member changed: ${member.path}`);
  }
  const added = complete.members.filter(({ path }) => !originalByPath.has(path));
  assert.deepEqual(added.map(({ path }) => path).sort(), [
    "source/compiled-frontend/frontend/react/review-evidence/r2-go-emit.log",
    "source/compiled-frontend/frontend/react/review-evidence/r2-node-green.log",
    "source/compiled-frontend/frontend/react/review-evidence/r2-node-red.log",
    "source/compiled-frontend/frontend/react/review-evidence/r2-proxy-slice-after.exit-code",
    "source/compiled-frontend/frontend/react/review-evidence/r2-proxy-slice-after.raw.json",
    "source/compiled-frontend/frontend/react/review-evidence/r2-proxy-slice-after.stderr.log",
    "source/compiled-frontend/frontend/react/review-evidence/r2-proxy-slice-before.raw.json",
    "source/compiled-frontend/frontend/react/review-evidence/r2-proxy-slice-before.stderr.log",
  ]);
  assert.equal(added.length, 8);
  assert.ok(added.every(({ path }) => path.startsWith("source/compiled-frontend/frontend/react/review-evidence/")));
});

test("inventory output is unique and lexically sorted", () => {
  assert.deepEqual(
    buildArchiveSourceInventory(["demo/z.json", "source/a.go", "demo/z.json"], { "a.go": {} }),
    ["demo/z.json", "source/a.go"],
  );
});

test("unsafe paths cannot enter the archive inventory", () => {
  for (const path of ["../escape", "/absolute", "a\\b", "a//b", "a/./b", "a/../b", ""]) {
    assert.throws(() => buildArchiveSourceInventory([path], {}), /unsafe archive file path/);
    assert.throws(() => buildArchiveSourceInventory([], { [path]: {} }), /unsafe pinned source path/);
  }
});
