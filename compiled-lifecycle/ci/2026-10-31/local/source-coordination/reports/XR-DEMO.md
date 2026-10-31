# XR-DEMO — independent review of E-DEMO

**Decision: accepted for the recorded `bridge-green-02` preintegration demo only.** This review does not accept the current checkout or replace the separate final source-pinned lifecycle matrix.

## Review method

I checked the E-DEMO report and receipt hashes, the retained N6 attempt and its source pins, the React and DOM compiler outputs, the static demo build, raw browser smoke JSON, screenshot, and 152-member archive. I independently reran the native Go CLI against the frozen fixture and compared every browser Go tick with its corresponding native Go state, message, view, effects, and effect correlations. The final physical DOM was compared with N4's independent lifecycle oracle. I also opened the raw screenshot and checked its hash against the receipt.

The audit script and machine-readable result are in `compiled-lifecycle/coordination/reviews/xr-demo/`. The audit used Node v22.23.4 and `/tmp/gondola-go/bin/go` with the fixture's recorded toolchain: Go compiler 1.27.3, Go root 1.24.0, Chromium 153.0.8010.0, React/React DOM 19.3.1, Playwright 1.64.1, and esbuild 0.28.2. The Node process emitted the existing experimental `EnvHttpProxyAgent` warning; the browser smoke recorded no browser or console errors.

## Findings

Both compiler commands exited 0, emitted 67 outputs, had empty stderr and diagnostics, and generated React/DOM AppIRs with matching component identity and state schema. Both declare `view.node` and `effect.request-reply`. The static demo was built from the actual React compiled Go module and mounted it through the existing DOM/React renderers. The demo build and HTTP smoke both exited 0.

The native CLI emitted all 26 scripted fixture steps. Of these, the browser schedule has 23 Go `Update` calls plus Init: the renderer-swap step has no Go tick, and the two fixture duplicate-completion no-ops are exercised as rejected host replays in the browser. All 24 raw browser trace ticks match the corresponding native Go state, message, view, emitted effects, and effect correlation. The native and browser paths use the canonical AppIR component ID `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`.

| Check | Independently verified result |
|---|---|
| Scenario checks / browser trace | 12 checks; 24 ticks including Init; 4 renderer replacements |
| Generation-1 pending requests | Parent, Child, Grandchild, Sibling in token order; state, view, trace and pending correlations survive DOM→React→DOM swaps without a Go tick |
| Parent subtree removal | Go emits cancels in Grandchild, Child, Parent order; Sibling remains alive and pending as `sibling:g1:r4` |
| Remount and stale replies | Parent/Child/Grandchild return as generation 2; all three retired host callback probes are rejected without a tick; explicit stale Go `complete` messages leave the remounted state and view unchanged |
| Duplicate and live replies | Duplicate Sibling and Child host deliveries are rejected without ticks; Sibling and generation-2 Grandchild/Child/Parent replies are accepted |
| Effect host | 19 ordered records: 7 requests, 3 cancels, 3 rejected retired-callback probes, 4 accepted deliveries, and 2 rejected duplicate deliveries; no requests remain pending |
| Final physical DOM | Matches the independent oracle; request controls and Parent remount are disabled, Parent removal remains enabled |
| Browser/network | Three static assets returned HTTP 200; no failed requests, browser errors, console errors, WebAssembly requests, or WebAssembly API attempts |

The raw screenshot shows the complete generation-2 tree and the completed generation-1 Sibling, with the final disabled controls and an explicitly rejected duplicate replay. The smoke uses fresh DOM selectors for subsequent user actions; it does not retain and click detached pre-removal buttons. That detached-button lifetime case is outside this demo packet and must be covered by the separate full harness if claimed.

The raw Go output, native CLI stdout/stderr, browser smoke JSON, screenshot and static bundle are retained. The archive has 152 entries. I independently checked each archive member's name, byte length and SHA-256 against the manifest; all matched. The archive SHA-256 is `1bf62ad5462a8ee71d6ac640228a6e620ee5cd9510d698f09f397d86a1cf18d5`.

## Source and artifact pins

The E-DEMO report hash matches its receipt: `aa830613ba33d715342a8cbace2b82cddbc2ca06f9b7fd0c78fc7b838e7f0e2b`. The post-run source pins match the current source for the fixture, native adapter, shared runtime, and demo inputs. The receipt's lifecycle adapter pin is the earlier R-EFFECT-SLICE wrapper (`c6fad592554dda059c45ecdb1db55ab62283783de1b1d76c0f320f44fbdf7166`). The current frozen R-UNMOUNT wrapper is `9c2a06521ec19be0f70415dcdcf6aa71b022b08daaf6f913e503cc197e2261ed`; the two hashes differ as the E-DEMO report explicitly records. This demo therefore does not evidence the later wrapper fix. E-DEMO also records that its source snapshot was taken after the run and makes no before/after source-stability claim.

| Artifact | SHA-256 |
|---|---|
| E-DEMO report | `aa830613ba33d715342a8cbace2b82cddbc2ca06f9b7fd0c78fc7b838e7f0e2b` |
| HTTP smoke JSON | `7ff02b0e825e8bb136cf67c111ef0f33acb18c0e02bc6f3e3bd6204a418b2aad` |
| Raw screenshot | `6f366f62a04be4223324602333013b5bfc5c69aaf2c9eeb2edd61e44b8bd8053` |
| Static demo bundle | `bb9c5f05294816087c647ab965077e4ba4c3672c5e8464f52d4881ea56aac175` |
| Archive | `1bf62ad5462a8ee71d6ac640228a6e620ee5cd9510d698f09f397d86a1cf18d5` |
| React/DOM AppIR (identical) | `341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d` |
| Independent N4 oracle source | `795ba7fef0ff680019f4988aba5cfcecb25b205516a2c7058bfc720fc217cb82` |

## Scope limits

E-DEMO marks `acceptanceRun=false` and `attempt_kind=preintegration-demo-only`. This review accepts its finite fixture smoke and archive only. It does not claim arbitrary pointer/Manager support, production transport behavior, detached-button lifetime coverage, before/after source stability, or full cross-profile conformance on the current wrapper. The final source-pinned runner remains a separate gate.
