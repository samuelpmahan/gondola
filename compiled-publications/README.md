# Typed inputs and keyed publications

This profile extends the compiled keyed-child example with parent-owned typed input and a delayed publication queue. The Go fixture owns the input step, lock, revision, child values, captured payloads, publication IDs, delivery decisions, and queue order. The browser renders Go's view and sends its declared messages; it has no publication reducer or queue.

The demo lets you change the React or DOM renderer while Go state and pending host request replies remain mounted. It also includes an incompatible-renderer probe, manual request replies, cancelled-reply probes, and Go-generated controls for capturing and delivering publications.

## Run locally

Use Node 22, native Go 1.24, compiler Go 1.27.3, the repository's existing locked npm dependencies, and Chromium. `CHROMIUM_PATH` can select a browser executable.

```sh
bash run-compiled-publications.sh
```

The runner builds a fresh React and DOM GoScript output from the fixture, compares their shared AppIR and encoder bytes, runs the literal and seeded conformance checks, serves the demo over local HTTP in Chromium, then archives the new attempt from a frozen file list and verifies it with a separate archive consumer. Each run uses a unique directory under `compiled-publications/demo/output/attempts/`; its immutable execution receipt is under `compiled-publications/evidence/attempts/`.

The new-profile runner is intentionally focused. The GitHub Actions workflow first runs the full inherited PR16 chain, then runs this profile.

## Demo interactions

The initial view contains a parent with step, lock, and request controls; keyed oak and elm children; and the publication queue. A child capture stores its current value with the active parent generation, child generation, and input revision. The generated `Deliver #…` buttons dispatch delivery back to Go, which accepts or rejects each queued publication.
