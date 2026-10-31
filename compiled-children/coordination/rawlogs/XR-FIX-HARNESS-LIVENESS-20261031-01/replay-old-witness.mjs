import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "../../../..");
const mutantPath = resolve(root,
  "compiled-children/coordination/rawlogs/XR-HARNESS-20261031-01/wrong-active-renderer-browser.json.gz");
const expectedArchiveHashFromReceipt = "dfd8a37b439369754fe3574ca1fc93b1ee7090fc74109275fed2656d8d5b8835";
const expectedRawHashFromReceipt = "86731f80e91cead461973ec4521a54f002ed7c1783633bfc010a51f34fa41fbb";
const bytes = await readFile(mutantPath);
const archiveHash = createHash("sha256").update(bytes).digest("hex");
assert.equal(archiveHash, expectedArchiveHashFromReceipt);
const captureBytes = gunzipSync(bytes);
const rawHash = createHash("sha256").update(captureBytes).digest("hex");
assert.equal(rawHash, expectedRawHashFromReceipt);
const capture = JSON.parse(captureBytes.toString("utf8"));
const profile = capture.profiles.swap;
const accepted = profile.swaps.find((swap) => swap.eventIndex === 10);
assert.equal(accepted.accepted, true);
assert.deepEqual(accepted.after.renderer, { backend: "dom", id: 1 });
const event = profile.events.find((row) => row.eventIndex === 13);
assert.equal(event.event.kind, "click");
assert.deepEqual({
  backend: event.operation.observed.backend,
  rendererId: event.operation.observed.rendererId,
}, { backend: "dom", rendererId: 1 });
const action = profile.actions.find((row) => row.eventIndex === 13);
assert.deepEqual({ backend: action.observed.backend, rendererId: action.observed.rendererId },
  { backend: "dom", rendererId: 1 });
const dispatch = profile.observations.dispatch.find((row) => row.eventIndex === 13);
assert.deepEqual({ backend: dispatch.backend, rendererId: dispatch.rendererId },
  { backend: "dom", rendererId: 1 });

const { assertRendererLifecycle } = await import(resolve(root, "compiled-children/conformance/check.mjs"));
let rejection;
try {
  assertRendererLifecycle(profile, "XR-HARNESS-1 archived wrong-active-renderer witness");
} catch (error) {
  rejection = { name: error.name, message: error.message };
}
assert.ok(rejection, "the original wrong React/2 -> DOM/1 witness must now fail");

process.stdout.write(`${JSON.stringify({
  schema: "gobi.xr-fix-harness-liveness-old-witness-replay/v1",
  archivedWitness: {
    path: "compiled-children/coordination/rawlogs/XR-HARNESS-20261031-01/wrong-active-renderer-browser.json.gz",
    archiveSha256: archiveHash,
    uncompressedBytes: captureBytes.length,
    uncompressedSha256: rawHash,
    acceptedSwap: { eventIndex: accepted.eventIndex, to: accepted.to, afterRenderer: accepted.after.renderer },
    postRejectionPhysicalClick: {
      eventIndex: event.eventIndex,
      method: event.operation.method,
      operation: { backend: event.operation.observed.backend, rendererId: event.operation.observed.rendererId },
      action: { backend: action.observed.backend, rendererId: action.observed.rendererId },
      dispatch: { backend: dispatch.backend, rendererId: dispatch.rendererId },
    },
  },
  checker: "assertRendererLifecycle",
  result: "rejected",
  rejection,
}, null, 2)}\n`);
