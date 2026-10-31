from __future__ import annotations

import pathlib
import unittest

from audit import audit, clone_snapshot, load_snapshot


ROOT = pathlib.Path(__file__).resolve().parents[2]


class SchedulerAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.snapshot = load_snapshot(ROOT)

    def fresh(self):
        return clone_snapshot(self.snapshot)

    @staticmethod
    def epoch_records(snapshot, epoch):
        state_event = next(e for e in snapshot.state["events"]
                           if e.get("type") == "solve" and e.get("epoch") == epoch)
        return state_event, snapshot.native[epoch]

    def test_live_evidence_is_structurally_valid_but_explicitly_inflight(self):
        result = audit(self.fresh())
        self.assertEqual(result["status"], "INCOMPLETE")
        self.assertEqual(result["accepted_epochs"], list(range(len(self.snapshot.native))))
        self.assertEqual(result["initial_spawn_count"], 6)
        self.assertEqual(result["worker_count"], 6)
        self.assertEqual(result["errors"], [])
        self.assertTrue(any(item.startswith("open_jobs:") for item in result["incomplete"]))

    def test_require_complete_promotes_open_gates_to_failure(self):
        result = audit(self.fresh(), require_complete=True)
        self.assertEqual(result["status"], "FAIL")
        self.assertTrue(any(item.startswith("required_complete:") for item in result["errors"]))

    def test_bad_native_score_is_detected_against_dp(self):
        snapshot = self.fresh()
        for record in self.epoch_records(snapshot, 10):
            record["native_score"] = 399
        result = audit(snapshot)
        self.assertTrue(any(item.startswith("native_score_not_optimal:") for item in result["errors"]))

    def test_nonzero_native_broken_count_is_rejected(self):
        snapshot = self.fresh()
        for record in self.epoch_records(snapshot, 10):
            record["native_constraints"]["brokenCount"] = 1
        result = audit(snapshot)
        self.assertTrue(any(item.startswith("native_broken:") for item in result["errors"]))

    def test_duplicate_packet_assignment_exceeds_capacity(self):
        snapshot = self.fresh()
        for record in self.epoch_records(snapshot, 10):
            record["assignments"]["N1"] = "E-PREP-SCHEDULER"
            record["dispatch"]["N1"] = "E-PREP-SCHEDULER"
        result = audit(snapshot)
        self.assertTrue(any(item.startswith("packet_capacity:") for item in result["errors"]))

    def test_native_capacity_declaration_is_recomputed(self):
        snapshot = self.fresh()
        for record in self.epoch_records(snapshot, 10):
            record["caps"]["E-PREP-SCHEDULER"] = 2
        result = audit(snapshot)
        self.assertTrue(any(item.startswith("native_caps:") for item in result["errors"]))

    def test_reviewing_worker_cannot_review_own_extract(self):
        snapshot = self.fresh()
        for record in self.epoch_records(snapshot, 2):
            record["assignments"]["N1"] = "XR-GO"
            record["assignments"]["N4"] = "BENCH"
            record["dispatch"] = {"N1": "XR-GO"}
        result = audit(snapshot)
        self.assertTrue(any(item.startswith("self_review:") for item in result["errors"]))

    def test_missing_completed_receipt_is_detected(self):
        snapshot = self.fresh()
        snapshot.receipts.pop("E-GO")
        result = audit(snapshot)
        self.assertTrue(any(item.startswith("receipt_missing:") and "E-GO" in item
                            for item in result["errors"]))

    def test_actual_initial_spawn_model_proof_is_checked(self):
        snapshot = self.fresh()
        snapshot.dispatch["actual_accepted_spawns"][0]["model"] = "different-model"
        result = audit(snapshot)
        self.assertTrue(any(item.startswith("spawn_model:") for item in result["errors"]))

    def test_rejected_nonoptimal_epoch_cannot_be_marked_dispatched(self):
        snapshot = self.fresh()
        rejected = next(e for e in snapshot.state["events"]
                        if e.get("type") == "native-recommendation-rejected")
        rejected["dispatch_performed"] = True
        result = audit(snapshot)
        self.assertTrue(any(item.startswith("rejected_dispatched:") for item in result["errors"]))

    def test_actual_dispatch_must_follow_latest_native_recommendation(self):
        snapshot = self.fresh()
        first = next(e for e in snapshot.state["events"] if e.get("type") == "dispatch")
        first["job"] = "E-HOST"
        result = audit(snapshot)
        self.assertTrue(any(item.startswith("dispatch_recommendation:") for item in result["errors"]))

    def test_pinned_inflight_worker_cannot_move(self):
        snapshot = self.fresh()
        for record in self.epoch_records(snapshot, 3):
            record["assignments"]["N2"] = "BENCH"
        result = audit(snapshot)
        self.assertTrue(any(item.startswith("pin_moved:") for item in result["errors"]))

    def test_amend_extension_before_completed_review_is_rejected(self):
        snapshot = self.fresh()
        events = snapshot.state["events"]
        extension = next(event for event in events
                         if event.get("type") == "extend-after-review-amend"
                         and "E-FIX-BUILD" in event.get("new_jobs", []))
        completion_index = next(index for index, event in enumerate(events)
                                if event.get("type") == "complete"
                                and event.get("job") == "XR-BUILD")
        # Match N5's independent mutation: move the extension immediately before
        # the review completion and remove its original later occurrence.
        events.remove(extension)
        events.insert(completion_index, extension)
        result = audit(snapshot)
        self.assertTrue(any(item.startswith("amend_extension_before_review:")
                            for item in result["errors"]))

    def test_executed_failure_extension_checks_pinned_startup_log(self):
        snapshot = self.fresh()
        failure = next(event for event in snapshot.state["events"]
                       if event.get("type") == "extend-after-executed-failure")
        failure["log_sha256"] = "0" * 64
        result = audit(snapshot)
        self.assertTrue(any(item.startswith("executed_failure_log_hash:")
                            for item in result["errors"]))

    def test_followup_failure_extension_checks_exact_source_and_pinned_log(self):
        snapshot = self.fresh()
        failure = next(event for event in snapshot.state["events"]
                       if event.get("type") == "extend-after-executed-failure"
                       and event.get("source") == "031c462bcd72c0ae0bee2dc05a0972b3902ca40c")
        failure["source_remote"] = "0" * 40
        result = audit(snapshot)
        self.assertTrue(any(item.startswith("executed_failure_evidence:")
                            and "source_remote" in item for item in result["errors"]))

    def test_followup_failure_extension_requires_both_repair_review_pairs(self):
        snapshot = self.fresh()
        snapshot.state["jobs"]["XR-FIX-SOURCE-AUDIT"]["depends_on"] = "E-FIX-RUNNER-ACCEPTANCE"
        result = audit(snapshot)
        self.assertTrue(any(item.startswith("executed_failure_review_link:")
                            and "XR-FIX-SOURCE-AUDIT" in item for item in result["errors"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
