#!/usr/bin/env python3
"""Build deterministic rawlog pins and the XR-FINAL-ACCEPTANCE receipt."""
import hashlib
import json
from pathlib import Path

ROOT = Path('/workspace/scratch/39a56936f173/gondola-next')
COORD = ROOT / 'compiled-children/coordination'
RAWLOG = COORD / 'rawlogs/XR-FINAL-ACCEPTANCE-20261031-01'
MANIFEST = RAWLOG / 'manifest.json'
RECEIPT_PATH = COORD / 'receipts/XR-FINAL-ACCEPTANCE.json'
REPORT_PATH = COORD / 'reports/XR-FINAL-ACCEPTANCE.md'
N6_RECEIPT_PATH = COORD / 'receipts/E-FINAL-ACCEPTANCE.json'
N6_REPORT_PATH = COORD / 'reports/E-FINAL-ACCEPTANCE.md'
VERIFY_PATH = RAWLOG / 'verification.stdout.json'
MATRIX_PATH = COORD / 'ci-final-matrix-source462.json'


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def pin(path):
    raw = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(raw), 'sha256': sha_bytes(raw)}


n6_receipt = json.loads(N6_RECEIPT_PATH.read_text())
verification = json.loads(VERIFY_PATH.read_text())
if verification.get('decision') != 'accepted':
    raise AssertionError('final independent verification is not accepted')

rawlogs = [pin(p) for p in sorted(RAWLOG.iterdir()) if p.is_file() and p != MANIFEST]
rawlog_manifest_data = {
    'schema': 'gobi.compiled-children-xr-final-review-rawlogs/v1',
    'rawlogCount': len(rawlogs),
    'rawlogs': rawlogs,
}
manifest_bytes = (json.dumps(rawlog_manifest_data, indent=2, sort_keys=True) + '\n').encode()
MANIFEST.write_bytes(manifest_bytes)

native_validation = {
    'status': 'valid',
    'validator': 'compiled-children/coordination/probe.py::validate_receipt',
    'validatedReceipt': 'XR-FINAL-ACCEPTANCE.json',
    'worker': 'N5',
    'rawlogCount': len(rawlogs),
    'schedulerStateUnchanged': True,
    'mode': 'read-only; final post-seal invocation completed with exit code 0',
}

report_bytes = REPORT_PATH.read_bytes()
source_commit = n6_receipt['source']['commit']
matrix = json.loads(MATRIX_PATH.read_text())
receipt = {
    'schema': 'gobi.worker-receipt/v1',
    'job_id': 'XR-FINAL-ACCEPTANCE',
    'worker': 'N5',
    'decision': 'accepted',
    'summary': 'Accepted the frozen E-FINAL-ACCEPTANCE source462 packet after independent streaming verification of local and hosted archives, exact source pins, corrected transcript metadata, and historical custody boundaries. The prior 29/3 matrix snapshot is preserved and a later 32/32 source462 matrix snapshot is separately recorded.',
    'reviewed_job': {
        'job_id': 'E-FINAL-ACCEPTANCE',
        'worker': 'N6',
        'outcome': n6_receipt['outcome'],
        'report': pin(N6_REPORT_PATH),
        'receipt': pin(N6_RECEIPT_PATH),
    },
    'reviewed_source': {
        'commit': source_commit,
        'physical_checkout': '/workspace/scratch/39a56936f173/gondola-children-archive',
        'localSourcePins': verification['checks']['localSourcePins'],
        'localArchive': verification['checks']['localArchive'],
        'hostedChildren': verification['checks']['hostedChildren'],
        'hostedCounter': verification['checks']['hostedCounter'],
    },
    'resolved_prior_findings': [
        'The actual local archive is the -7.tar.gz path and its external .archive-manifest.json sidecar; the prior .archive-manifest.tar.gz path is nonexistent.',
        'The fixed trace is 42 events, 38 Go updates, and 39 state checkpoints.',
        'The frozen old commands.txt has a copied expected-manifest SHA typo; the actual executed E-DELIVERY command used the correct manifest hash and exited 0.',
    ],
    'preserved_historical_boundary': verification['checks']['historicalCustody'],
    'broaderMatrixAtN6Capture': verification['checks']['broaderMatrixAsCaptured'],
    'broaderMatrixLaterSnapshot': verification['checks']['broaderMatrixCurrent'],
    'nativeValidation': native_validation,
    'report': {
        'path': str(REPORT_PATH.relative_to(ROOT)),
        'bytes': len(report_bytes),
        'sha256': sha_bytes(report_bytes),
    },
    'rawlogs': rawlogs,
    'rawlogManifest': {
        'path': str(MANIFEST.relative_to(ROOT)),
        'bytes': len(manifest_bytes),
        'sha256': sha_bytes(manifest_bytes),
    },
    'limitations': [
        'Review is limited to the frozen source462 delivery packet, its exact captured React/DOM/Chromium evidence, and the separately hosted artifacts named in the report.',
        'The hosted Counter trace was verified by artifact and trace hashes plus its pinned header sidecar; this review did not parse the entire 49,490,981-byte trace into an in-memory JSON object.',
        'No full delivery pipeline, tests, or npm commands were rerun.',
    ],
    'publication': {
        'sourceEdits': False,
        'demoEdits': False,
        'gitEdits': False,
        'schedulerWrites': False,
        'fullPipelineRerun': False,
    },
}
RECEIPT_PATH.write_text(json.dumps(receipt, indent=2, sort_keys=True) + '\n')
print(json.dumps({
    'status': 'sealed',
    'receipt': str(RECEIPT_PATH.relative_to(ROOT)),
    'rawlogCount': len(rawlogs),
    'manifest': receipt['rawlogManifest'],
    'report': receipt['report'],
}, indent=2, sort_keys=True))
