# Multi-root Go Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run multiple independently replaceable Go application roots in one browser realm with session-scoped effects and teardown.

**Architecture:** A typed Go manager owns existing collection sessions and exposes a strict WASM bridge. A JavaScript composition host binds each DOM root, renderer, transport, focus state, and callback generation to one manager session. GoDOM returns independent renderer handles instead of using a realm-wide singleton.

**Tech Stack:** Go 1.24, `syscall/js`, Node 22, React/ReactDOM 19.3.1, Playwright 1.64.1, Chromium, native Rebalancer 1.0.4.

**Spec:** `multi-root/DESIGN.md`

## Global Constraints

- Reuse `collection.Session`, the keyed host, current renderers, HTTP lab, and renderer v1 contract.
- Add no JavaScript dependency and preserve the pinned React reference.
- Existing Milestone 0 and all delivery manifests must remain byte-exact.
- Root owns Git, integration, coordination state, and final evidence; workers edit only assigned paths.
- Publication is a stacked feature PR based on `codex/gobi-go-renderer-contract-20261030`; do not merge main or deploy.

## Review Focus

- Two sessions may both emit request ID 1; transport/callback routing must still be session-exact.
- Disposal during a held request must cancel only that session and reject its late reply.
- A failed or unmounted GoDOM instance must not fence a sibling instance.
- Root reuse must create a fresh session and must not accept callbacks from the previous generation.
- Concurrent focus and renderer replacement must preserve logical selection per root without moving focus between roots.

---

### Task 1: Typed Go session manager

**Files:** Create `multisession/manager.go`, `multisession/manager_test.go`.

**Interfaces:** Produces `SessionID`, `Manager`, `NewManager`, `Create`, `Snapshot`, `Dispatch`, `Effects`, `Complete`, `Audit`, `Dispose`, and `List` for the WASM bridge.

- [ ] Write failing tests for monotonic IDs, independent same-numbered row/request IDs, scoped effects/audits, disposal cancel order, unknown/disposed IDs, late replies, and mutation isolation.
- [ ] Implement the manager as an ownership layer over unchanged `collection.Session`.
- [ ] Run `go test -race ./multisession` and `go vet ./multisession`.

### Task 2: Strict multi-session WASM bridge

**Files:** Create `cmd/multi-root-wasm/main_wasm.go`, `main_stub.go`, `main_test.go`, `smoke.mjs`, `smoke.html`.

**Interfaces:** Consumes Task 1. Produces `globalThis.gobiMultiRoot` with strict `create`, `snapshot`, `dispatch`, `effects`, `complete`, `audit`, `dispose`, `list`, `encodeHTTP`, and `decodeHTTP` methods.

- [ ] Write native decoder tests and a real-WASM smoke that uses at least three simultaneous sessions.
- [ ] Implement strict arity, safe-integer session decoding, exact step/reply objects, error frames, and manager routing.
- [ ] Build for `GOOS=js GOARCH=wasm`, run native tests/vet, and execute the browser smoke.

### Task 3: Multi-instance GoDOM bridge

**Files:** Modify `cmd/godom-wasm/main_wasm.go`, `renderer-conformance/adapter.mjs`, their focused tests and smoke fixtures only.

**Interfaces:** Produces `gobiGoDOM.mount(root, facade) -> renderer API`; every returned method addresses only its closed-over renderer.

- [ ] Add failing tests for two simultaneous instances, independent update/focus/fence/unmount, idempotent cleanup, stale handle calls, and compatibility error unwrapping.
- [ ] Replace the global active renderer with per-mount API closures and update the adapter.
- [ ] Run focused Node tests and the real two-WASM bridge smoke.

### Task 4: JavaScript composition host

**Files:** Create `multi-root/host.mjs`, `runtime.mjs`, `host.test.mjs`, `runtime.test.mjs`.

**Interfaces:** Consumes Tasks 2 and 3 plus the existing keyed host. Produces `createMultiRootHost({manager, descriptors, transportFactory})`, `mount(root, backend)`, `replace`, `session`, `unmount`, `settled`, and `snapshotAll`.

- [ ] Add failing tests for independent leases, same request IDs, callback generation fences, scoped cancel, sibling survival, root reuse, and per-root renderer failure.
- [ ] Implement session-scoped runtime facades and root records without application transition logic.
- [ ] Run focused Node tests with strict fakes and mutation probes.

### Task 5: Deterministic oracle and replay

**Files:** Create `multi-root/scripts.mjs`, `reference.mjs`, `check.mjs`, focused tests, and trace schema documentation.

**Interfaces:** Consumes Task 4. Produces deterministic action scripts, independent React reference ticks, native comparison envelopes, and a final report.

- [ ] Define fixed witnesses plus seeds 20261030 and 20261031 for add/edit/save/release/swap/focus/unmount/remount interleavings.
- [ ] Add fail-closed tests for missing actors/channels, session aliasing, canceled-session revival, synchronized no-ops, event order, and empty native traces.
- [ ] Run the seeded replay and retain exact mismatches and native inputs.

### Task 6: Executable demo, runner, CI, and evidence

**Files:** Create `multi-root/demo.*`, browser smoke, `run-multi-root.sh`, `.github/workflows/multi-root.yml`, `multi-root/README.md`, `RESULTS.md`, evidence and coordination manifests; modify root `README.md` only.

**Interfaces:** Consumes Tasks 1-5. Produces the user-visible three-root demo and the default end-to-end reproduction command.

- [ ] Demonstrate simultaneous DOM/React/GoDOM roots, held saves, root-local swaps, disposal, late release, sibling continuation, and fresh remount.
- [ ] Make the runner execute `run-renderer-conformance.sh` before all new gates; CI installs pinned dependencies and Chromium first.
- [ ] Record versions, commands, seeds, counts, mismatches, traces, repairs, tested/untested guarantees, delivery hashes, Rebalancer receipts, and six review acceptances.
