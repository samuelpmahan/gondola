# O-FIXTURE — composition observation producer

## Outcome

Updated `typed-composition/fixture.mjs` to retain the host generation passed to the actual transport factory in mounted-session metadata and disposal history. Active session and lifecycle observations now report the bound generation, including after disposal. This closes the producer gap that caused the preceding fixed replay to report null expected generations against transport events with generation 1.

The fixture also retains the O-FIXTURE observation channels established earlier: real disabled `.click()` suppression and unchanged physical/Go state before a separately labeled direct guard; actual enabled input event values; immediate focus and selection evidence around renderer replacement with unchanged tree/snapshot; and a shared per-side transport invocation clock that records starts, cancellations (including ignored calls), and deliveries at invocation entry.

## Verification

The syntax check passed. A fixed-only browser/native replay ran all three fixed scripts and matched with zero findings. The run performed three native replay executions, captured all 63 native action frames, and compared 126 candidate/reference actor frames. Mutation controls all had their expected outcomes: wrong parent and stale revision rejected without mutation, inbox-order and physical-DOM disabled mutations detected, and retained callback delivery after disposal/recreation fenced.

Command, from the repository root:

```sh
COMPOSITION_REPLAY_BIN=typed-composition/build/composition-replay \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
PATH=/tmp/gondola-node22/node_modules/node/bin:/tmp/gondola-go/bin:$PATH \
  node typed-composition/check.mjs \
  --cases 0 --max-actions 40 \
  --output typed-composition/build/generation-fixed-report.json
```

The report records default seeds `20261030,20261031`, zero seeded cases, and the three fixed traces: `inputs-publication-races` (23 actions), `readonly-pending-reply` (14), and `grandchild-routing-disposal-and-recreation` (26). Tool versions were Node `v22.23.4`, Go `go1.24.0 linux/amd64`, Chromium `153.0.8010.0`, React `19.3.1`, and React DOM `19.3.1`. Native replay binary SHA-256: `38d42d71fb2d3ed301ea7cf13ae527306063234bd3ad6cb6e494262ba19309a3`.

The successful report is `typed-composition/build/generation-fixed-report.json` (SHA-256 `24c86089951b732f5c810d44fb7625386a6faa460129fc8c2375252ef573e92f`). It includes six complete raw scenario/control shards and a manifest. The checker source-set SHA-256 was `ad5ddea05a4b5eecc3089f2b5cd297106e6f12b271593ec373334f55f0bde057`.

## Source pins

- `typed-composition/fixture.mjs`: `854dfae39c9c0c32d3955e9158bd5656e33f29641b52d3544d04e9bd3302020c`
- `typed-composition/check.mjs`: `fea6e333b301a010fab306475b2d9b5eae8c2b918b8defa4045c8384b8f1d422`
- `typed-composition/check.test.mjs`: `ea153f9dc5b2b6a9a70a9ffec13786434c6e48490e95c9b9349ed8c293a6dc76`

An earlier launch attempt without `CHROMIUM_EXECUTABLE_PATH` exited before starting browser or native scenarios because Playwright's managed Chromium was unavailable. The successful command explicitly selected `/tmp/chromium`; no findings or raw evidence were discarded or overwritten.

## Scope and limits

Only `fixture.mjs` was edited by this job. The three fixed scripts pass the repaired checker, but this packet does not run seeded cases or the default full replay, and it does not claim overall acceptance. Root owns the final replay. The earlier generation-mismatch report remains preserved at `typed-composition/build/closure-fixed-report.json` with its log; this run is a separate fresh result.
