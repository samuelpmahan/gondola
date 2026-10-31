# Mounted backend qualification

This profile exercises the actual compiled publications module in mounted React and DOM browsers. It runs three healthy backends and ten renderer/event faults, records what the live renderer and callbacks produced, and sends the raw capture report to a Go certificate CLI. Go derives the qualified verdict from the fixed case registry and verifies every case evidence file hash.

The browser demo is a read-only report viewer. It displays each mounted case, its actual observations, pinned raw evidence, and the Go certificate result. Browser JavaScript does not decide whether a fault was detected or maintain application state.

This finite qualification admits the current React and DOM backends plus a healthy React/DOM renderer swap. It does not automatically certify an arbitrary third backend. A new backend requires an explicit shared-renderer ABI and host policy, a closed profile and Go case-registry extension, and the same healthy and activated-fault evidence.

## Run

Use Node 22, native Go 1.24, compiler Go 1.27.3, the repository's locked dependencies, and Chromium. The root runner must supply the exact candidate Git commit SHA used by the capture:

```sh
bash run-backend-qualification.sh --source-commit <candidate-commit-sha>
```

The runner builds fresh React and DOM GoScript inputs and a native trace, runs the 13 isolated mounted cases, asks the Go CLI to certify the raw capture report, then builds and HTTP-smokes this viewer. Every attempt gets a unique folder under `backend-qualification/output/attempts/` and an immutable receipt under `backend-qualification/evidence/attempts/`. The archive contains compact source/provenance pins, build inputs, case captures, the Go certificate, demo and smoke results; a separate consumer lists, extracts, and hashes every archived member.

The workflow file is configured to run only this focused profile on targeted pull request paths or a manual dispatch with a supplied candidate SHA. Root must publish/register the workflow before GitHub can invoke it. It does not run the inherited regression pipeline. Full inherited CI and publication are separate root gates.

## Case matrix

The three healthy cases are `healthy-react`, `healthy-dom`, and `healthy-swap`. The ten mounted fault cases cover `text-corruption`, `key-order`, `enabled-control`, `drop-click`, and `duplicate-click` once in each backend. Fault evidence comes from actual renderer updates or physical callbacks; generic exceptions and page errors never count as fault detection.

The prior 16 captured-data mutation controls are a separate check. They do not substitute for these ten mounted fault cases.
