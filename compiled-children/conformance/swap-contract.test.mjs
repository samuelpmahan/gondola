import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { assertRendererLifecycle } from "./check.mjs";

const capturePath = fileURLToPath(new URL(
  "../coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2/browser.json.gz",
  import.meta.url,
));
const archiveSHA256 = "b578feb89f9c1b8c23cb25c946811d207391e535ddb0e9be00ef98826cb9979a";
const captureSHA256 = "31ef47512d037ab7e7c64a5c0789e5a7d69a067b1e9819a267e23b28fdfae26d";

const archive = await readFile(capturePath);
const rawCapture = gunzipSync(archive);
const browserCapture = JSON.parse(rawCapture.toString("utf8"));
const authenticSwapProfile = browserCapture.profiles.swap;
const acceptedSwap = authenticSwapProfile.swaps.find((swap) => swap.accepted === true);
const rejectedSwap = authenticSwapProfile.swaps.find((swap) => swap.accepted === false);
const postRejectionClick = authenticSwapProfile.events.find((event) =>
  event.eventIndex > rejectedSwap.eventIndex && event.event?.kind === "click");

function mutated(mutator) {
  const copy = structuredClone(authenticSwapProfile);
  mutator(copy);
  return copy;
}

function setLiveClickIdentity(profile, { backend, id }) {
  const event = profile.events[postRejectionClick.eventIndex];
  event.operation.observed.backend = backend;
  event.operation.observed.rendererId = id;
  event.snapshot.operation.observed.backend = backend;
  event.snapshot.operation.observed.rendererId = id;
  const action = profile.actions.find((item) => item.eventIndex === postRejectionClick.eventIndex);
  action.observed.backend = backend;
  action.observed.rendererId = id;
  const dispatch = profile.observations.dispatch.find((item) => item.eventIndex === postRejectionClick.eventIndex);
  dispatch.backend = backend;
  dispatch.rendererId = id;
}

test("swap lifecycle review input is the pinned authentic attempt 12 capture", () => {
  assert.equal(createHash("sha256").update(archive).digest("hex"), archiveSHA256);
  assert.equal(createHash("sha256").update(rawCapture).digest("hex"), captureSHA256);
  assert.equal(browserCapture.schema, "gobi.compiled-children-browser/v1");
  assert.equal(browserCapture.profiles.swap, authenticSwapProfile);
  assert.equal(assertRendererLifecycle(authenticSwapProfile, "attempt12.browser.swap"), true);
});

test("renderer lifecycle checker binds accepted candidate backend to live identity", () => {
  const candidate = mutated((profile) => {
    profile.swaps.find((swap) => swap.eventIndex === acceptedSwap.eventIndex).after.renderer.backend =
      acceptedSwap.before.renderer.backend;
  });
  assert.throws(() => assertRendererLifecycle(candidate, "mutated.accepted.backend"));
});

test("renderer lifecycle checker binds accepted candidate renderer ID", () => {
  const candidate = mutated((profile) => {
    profile.swaps.find((swap) => swap.eventIndex === acceptedSwap.eventIndex).after.renderer.id =
      acceptedSwap.before.renderer.id;
  });
  assert.throws(() => assertRendererLifecycle(candidate, "mutated.accepted.rendererId"));
});

test("renderer lifecycle checker rejects a post-rejection callback on the retired backend", () => {
  const candidate = mutated((profile) => setLiveClickIdentity(profile, {
    backend: acceptedSwap.before.renderer.backend,
    id: acceptedSwap.after.renderer.id,
  }));
  assert.throws(() => assertRendererLifecycle(candidate, "mutated.liveCallback.backend"));
});

test("renderer lifecycle checker rejects a post-rejection callback on the retired renderer ID", () => {
  const candidate = mutated((profile) => setLiveClickIdentity(profile, {
    backend: acceptedSwap.after.renderer.backend,
    id: acceptedSwap.before.renderer.id,
  }));
  assert.throws(() => assertRendererLifecycle(candidate, "mutated.liveCallback.rendererId"));
});

test("renderer lifecycle checker rejects action metadata detached from the live callback", () => {
  const candidate = mutated((profile) => {
    profile.actions.find((action) => action.eventIndex === postRejectionClick.eventIndex).observed.backend =
      acceptedSwap.before.renderer.backend;
  });
  assert.throws(() => assertRendererLifecycle(candidate, "mutated.liveCallback.actionMetadata"));
});

test("renderer lifecycle checker checks swap pending state at both event boundaries", () => {
  const candidate = mutated((profile) => {
    const swap = profile.swaps.find((item) => item.eventIndex === rejectedSwap.eventIndex);
    swap.after.pending.reverse();
  });
  assert.throws(() => assertRendererLifecycle(candidate, "mutated.rejectedSwap.pending"));
});

test("renderer lifecycle checker rejects a click whose event snapshot uses another renderer", () => {
  const candidate = mutated((profile) => {
    profile.events[postRejectionClick.eventIndex].snapshot.operation.observed.rendererId =
      acceptedSwap.before.renderer.id;
  });
  assert.throws(() => assertRendererLifecycle(candidate, "mutated.liveCallback.snapshot"));
});
