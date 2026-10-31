# E-DELIVERY — mounted backend qualification

Attempt: `attempt-20261031T200506490Z-116`; candidate source: `a275d646b0d8ceed956b27b6b8f3099e17106857`; status: **passed**.

Go certified all 13 mounted cases: three healthy baselines matched and ten activated fault cases were detected. HTTP smoke passed 12 checks; the 409-member archive passed independent verification.

## Scope

This packet covers the admitted React and DOM backends and one healthy React/DOM swap. It does not certify arbitrary third backends. Earlier 16 captured-data mutation controls are separate from the ten mounted fault cases. The Go certificate validates the measured report/evidence pairs and source identity; it is not a proof against a malicious producer fabricating browser evidence.

The inherited regression chain was not run locally. Full inherited CI, review, and publication remain separate root gates.

## Evidence summary

- Cases: 13 total (3 healthy baselines matched, 10 faults detected); Go qualified: `true`.
- Native trace: 50 events, 45 Go updates. Each of the three healthy captures recorded 46 checkpoints.
- The 13-case matrix is deterministic and uses the frozen 50-event scenario; no randomized schedule seeds are involved.
- HTTP smoke: 12 checks; archive: 409 members.
- Source pins matched: `true`; source pin count: 181.
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
- Runtime attempt receipt: `backend-qualification/evidence/attempts/attempt-20261031T200506490Z-116/receipt.json`.
- Archive: `backend-qualification/output/attempts/attempt-20261031T200506490Z-116.tar.gz`, 2485927 bytes, SHA-256 `b1d9d5bc30bcce395fae361845ee02b1896b595a567a4c2923d6f898a60c8556`.
- Archive manifest: `backend-qualification/output/attempts/attempt-20261031T200506490Z-116.archive-manifest.json`, SHA-256 `9ce8013a9afbf1b97c526e504961f6525ded134455de7f24e8a28acc89457a3d`.
- Post-command independent consumer: passed; archive and manifest hashes stayed stable.

Full command records and per-case evidence are preserved in the immutable attempt and evidence folders.
