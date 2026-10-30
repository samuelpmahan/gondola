# P-DEMO — executable typed-composition browser capture

## Outcome

**Outcome: confirmed reuse.** I captured the existing built demo in Chromium after a real child save through the loopback HTTP lab and a Publish action into the parent Go Inbox. The screenshot shows the parent at `Published: 1`, the typed retained receipt, the completed HTTP request, and the saved child row rendered by GoDOM after switching from the initial React renderer. The parent policy supplies the child title and is set to read-only after publication; the child’s saved value remains visible.

The screenshot is [typed-composition-demo.png](../../evidence/typed-composition-demo.png) (1680 × 1716, SHA-256 `d816f80ae7d139c3c16098cc42df7dc7e1c4cf58a158f5518de83e52634725a3`). The accompanying [demonstration JSON](../../evidence/typed-composition-demo.json) records actual parent and child Go snapshots, the receipt panel, HTTP server record, runtime URL, and full before/after source and asset hash maps (13/13 unchanged; JSON SHA-256 `8e81675dda61d1abfc88adf663a1d6c603bdc084f93953123888f891e0e2c348`).

## Captured state

- Browser URL at capture: `http://127.0.0.1:34477/typed-composition/demo.html` (the ephemeral port is assigned on each run).
- Parent session 1 showed `Published: 1`; child session 2 was rendered with GoDOM after the initial React view was replaced.
- Parent supplied title `Quarterly release review`; after publish, the parent set the child read-only. The child Go snapshot retained row 1 with draft/saved value `Release checklist approved`, `Saves: 1`, `Status: saved`, `PendingID: 0`, title `Quarterly release review`, and `ReadOnly: true`.
- The actual parent Go snapshot contained this receipt: `{ Sequence: 1, ParentID: 1, ChildID: 2, RowID: 1, Saved: "Release checklist approved", Saves: 1, InputRevision: 2 }`. The visible receipt panel renders these typed values.
- The loopback server’s lane `composition-2-388ea035-cf30-4448-82c4-29b2c1090075` recorded request 1 with value `Release checklist approved`, mode `success`, result `success`, HTTP status 200, and state `completed`.
- The demo’s visible error panel remained hidden; browser page/console errors were empty. The HTTP lab closed through the bounded helper and passed `assertCleanHTTPProcessClose`.

## Source and asset hashes

The demonstration JSON stores both before and after hashes and an equality flag for every listed file. Every pair matched. The captured SHA-256 (both before and after) values were:

| Source or asset | SHA-256 |
|---|---|
| `typed-composition/demo.html` | `ea73df608e3fb9d4555f3fc7a99201865d202a9efef78c008e5e9da2bb8c0913` |
| `typed-composition/demo.mjs` | `e266f424833760a7448414ff11661b3ed8bc32a71fb0502e6f9cfdc5bab124da` |
| `typed-composition/host.mjs` | `e030ff3e1f10a19b2a520f7b652df5e1bc14cb7d5d33bc2f10076f0d11685f3c` |
| `typed-composition/build/composition.wasm` | `3e2ad04fc31bab0684c942590b3f030d83328e6b43e513bd69e8bafc5fdb87cc` |
| `typed-composition/build/godom.wasm` | `3e14286f2d97916996c0604d7d3e3d4ec525bb2998c08e6411d21da2140c9cdb` |
| `typed-composition/build/wasm_exec.js` | `0c949f4996f9a89698e4b5c586de32249c3b69b7baadb64d220073cc04acba14` |
| `typed-composition/build/react.bundle.mjs` | `091e9e8a2f17a9d148803f568720614a911cd22d0fed6db7cbd55c47597e17a6` |
| `keyed-editor/dom.mjs` | `c11b8f23221c524d31a676f161d0e799742ff5af527408805b8ee328f2943a67` |
| `renderer-conformance/adapter.mjs` | `6e6a8c48c32866ad45c40a726a8422950928578745e83503e5dcc8c5e7462e51` |
| `session-tree/host.mjs` | `f5ce451235ec2506d80d9ac3ebc364a9e43ba774cd56a66e25e3f8f7bd8a0c5a` |
| `http-effects/transport.mjs` | `b6ca9454a359f76a352123b4625dc174aea31fcf802699573a89a2cfe3cf09ff` |
| `http-effects/build/http-lab` | `9a1a9c90e70c714199ee09ec87026ac71328d9fd52674a1e7a0c96480c417289` |
| `typed-composition/http-lab-process.mjs` | `1ed818981bd1ef8337a1d96f775cc91d2d98c7d328da2bf2b6b2c7e8af030999` |

Runtime used: Node `v22.23.4`, Playwright `1.64.1`, Chromium `153.0.8010.0`; `/tmp/chromium` SHA-256 `53a15d6c3a3d27dfb54c4ba60278b1683136f70cf1e67e989da7dfbd3d451ef0`. No source or build asset was edited or rebuilt.

## Reproduction

From the repository root, start the existing HTTP lab:

```sh
./http-effects/build/http-lab -addr 127.0.0.1:0 -root .
```

Open the readiness URL it prints with `/typed-composition/demo.html`. In the parent session controls, set the child title to `Quarterly release review`. In the child view, add a row, enter `Release checklist approved`, and save; wait for the HTTP request to complete. Click Publish, switch the child renderer from React to GoDOM and apply it, then check `Child is read-only` in the parent controls. The parent view and receipt panel should show the published result as in the capture.

The first capture-harness attempt reached the scenario but stopped before writing the screenshot because it treated Playwright's `waitForFunction()` JSHandle as its underlying value (`TypeError` while reading the request state). The browser and HTTP lab teardown ran. I corrected the temporary capture harness to call `jsonValue()` and repeated the capture successfully; no application source or asset changed. Final capture command used the existing browser-smoke dependencies and a temporary script under `/tmp`; it exited 0 with clean bounded process teardown. No broad or inherited suite was run. This is live demonstration evidence, not pixel-parity evidence.
