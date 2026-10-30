"""Focused adversarial checks for the receipt and reviewer assignment gates."""
from __future__ import annotations

import hashlib
import json
import pathlib
import sys
import tempfile
import unittest


HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True
import adapter  # noqa: E402


class CoordinationGateTests(unittest.TestCase):
    def test_missing_author_receipt_blocks_readiness(self) -> None:
        packet = {"status": "running", "author_results": []}
        with self.assertRaisesRegex(ValueError, "no actual author receipt"):
            adapter.ready_author_result("E1", packet, HERE)

    def test_author_amendment_supersedes_an_earlier_acceptance(self) -> None:
        packet = {
            "status": "amendment_requested",
            "author_results": [{"decision": "accepted", "receipt_sha256": "old-receipt"}],
        }
        with self.assertRaisesRegex(ValueError, "not currently accepted"):
            adapter.ready_author_result("E5", packet, HERE)

    def test_self_review_assignment_is_rejected(self) -> None:
        workers = list(adapter.WORKERS)
        jobs = []
        dispatch = {}
        for worker in workers:
            job_id = f"XR-{worker}"
            jobs.append({
                "id": job_id,
                "author_worker": worker,
                "allow_workers": [other for other in workers if other != worker],
            })
            dispatch[worker] = job_id
        spec = {"workers": workers, "jobs": jobs}
        report = {
            "assignments": dispatch,
            "dispatch": dispatch,
            "native_constraints": {"brokenVal": 0, "brokenCount": 0},
            "independent_capacity_check": True,
            "independent_eligibility_check": True,
            "exact_score": 600,
            "native_score": 600,
        }
        with self.assertRaisesRegex(ValueError, "ineligible review assignment"):
            adapter.verify_review_solution(spec, report)

    def test_tampered_acceptance_receipt_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            receipt_path = root / "receipt.json"
            original = json.dumps({"decision": "accepted"}).encode()
            receipt_path.write_bytes(original)
            result = {
                "decision": "accepted",
                "receipt_path": "receipt.json",
                "receipt_sha256": hashlib.sha256(original).hexdigest(),
                "deliverables": [],
            }
            receipt_path.write_bytes(json.dumps({"decision": "amend"}).encode())
            with self.assertRaisesRegex(ValueError, "tampered"):
                adapter.ready_author_result("E1", {"status": "accepted", "author_results": [result]}, root)


if __name__ == "__main__":
    unittest.main(verbosity=2)
