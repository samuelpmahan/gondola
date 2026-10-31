# E-DELIVERY — mounted backend qualification

Attempt: `attempt-20261031T181327827Z-18`; candidate source: `77f7ce36439f1ae457a397269ea5a8c6d2db1cb2`; status: **passed**.

Go certified all 13 mounted cases: three healthy baselines matched and ten activated fault cases were detected. HTTP smoke passed 12 checks; the 397-member archive passed independent verification.

## Scope

This packet covers the admitted React and DOM backends and one healthy React/DOM swap. It does not certify arbitrary third backends. Earlier 16 captured-data mutation controls are separate from the ten mounted fault cases. The Go certificate validates the measured report/evidence pairs and source identity; it is not a proof against a malicious producer fabricating browser evidence.

The inherited regression chain was not run locally. Full inherited CI, review, and publication remain separate root gates.

## Evidence summary

- Cases: 13 total (3 healthy baselines matched, 10 faults detected); Go qualified: `true`.
- Native trace: 50 events, 45 Go updates. Each of the three healthy captures recorded 46 checkpoints.
- The 13-case matrix is deterministic and uses the frozen 50-event scenario; no randomized schedule seeds are involved.
- HTTP smoke: 12 checks; archive: 397 members.
- Source pins matched: `true`; source pin count: 177.
- N2 provenance pins: 87; matched to the outer source boundary: 87.

## Stages

| Stage | Result |
|---|---|
| toolchains-and-candidate-identity | passed |
| focused-go-certificate-tests | passed |
| fresh-native-and-react-dom-builds | passed |
| thirteen-isolated-mounted-cases | passed |
| focused-adapter-and-oracle-tests | passed |
| authoritative-go-certificate | passed |
| actual-evidence-viewer-and-http-smoke | passed |
| source-snapshot-and-command-boundary | passed |
| immutable-archive-and-independent-consumer | passed |

## Failures

- None.

## Provenance

- Node: v22.23.4; native Go: go version go1.24.0 linux/amd64; compiler Go: go version go1.27.3 linux/amd64.
- Chromium: Chromium 153.0.8010.0; Playwright: 1.64.1.
- Runtime attempt receipt: `backend-qualification/evidence/attempts/attempt-20261031T181327827Z-18/receipt.json`.
- Archive: `backend-qualification/output/attempts/attempt-20261031T181327827Z-18.tar.gz`, 2443344 bytes, SHA-256 `61bb3df8c16323be5ef856edf834ac73ac69fde462224dd1ac8b35ef93ed97ca`.
- Archive manifest: `backend-qualification/output/attempts/attempt-20261031T181327827Z-18.archive-manifest.json`, SHA-256 `8adc8f345a5b66a6ea1fbb92fe9bd510d1682f4c37d4c76e8a0660e06ce30cb1`.
- Post-command independent consumer: passed; archive and manifest hashes stayed stable.

Full command records and per-case evidence are preserved in the immutable attempt and evidence folders.
