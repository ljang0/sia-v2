import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from evaluate_background import evaluate, oracle
from trace_candidates import InvalidExport
from test_trace_candidates import event, export_with


ORIGIN = "http://127.0.0.1:8123"


def episode():
    return export_with([
        event("start", "episode.started", {"route": "mac_background_cua"}),
        *[
            event(str(index), "sia.action_result", {
                "name": "computer_action",
                "result": {
                    "outcome": "accepted_unverified",
                    "data": {"source_url": ORIGIN + source, "delivery": {"delivery_mode": "background"}},
                },
            })
            for index, (source, _) in enumerate(oracle.EXPECTED.values())
        ],
        event("end", "turn.capture_finished", {"outcome": "completed"}),
    ])


class BackgroundEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.answer = Path(self.temporary.name) / "answer.json"
        self.answer.write_text(json.dumps({
            "term": "Fall 2026",
            "courses": [
                {"code": code, "source_path": source, "instructors": sorted(names)}
                for code, (source, names) in oracle.EXPECTED.items()
            ],
        }))

    def test_correct_output_and_grounded_background_route_pass(self):
        result = evaluate(episode(), self.answer, ORIGIN)
        self.assertTrue(result["passed"])
        self.assertEqual(result["observed_required_sources"], 3)

    def test_capture_completed_is_not_reward(self):
        self.answer.write_text('{"success":true,"reward":1}')
        result = evaluate(episode(), self.answer, ORIGIN)
        self.assertTrue(result["background_route_passed"])
        self.assertEqual(result["outcome_reward"], 0)
        self.assertFalse(result["passed"])

    def test_correct_answer_without_observations_does_not_prove_cua(self):
        document = episode()
        document["batches"][0]["events"] = [document["batches"][0]["events"][0], document["batches"][0]["events"][-1]]
        result = evaluate(document, self.answer, ORIGIN)
        self.assertEqual(result["outcome_reward"], 1)
        self.assertFalse(result["background_route_passed"])

    def test_foreground_uncertain_external_and_native_search_routes_fail(self):
        for change in ("foreground", "uncertain", "external", "search"):
            with self.subTest(change=change):
                document = episode()
                events = document["batches"][0]["events"]
                result = events[1]["payload"]["data"]["result"]
                if change == "foreground":
                    result["data"]["delivery"]["delivery_mode"] = "foreground"
                elif change == "uncertain":
                    result["outcome"] = "uncertain"
                elif change == "external":
                    result["data"]["source_url"] = "https://example.test/courses/cs-122/people"
                else:
                    events.append(event("search", "provider.tool", {"payload": {"name": "web_search"}}))
                self.assertFalse(evaluate(document, self.answer, ORIGIN)["passed"])

    def test_refuses_unconsented_ambiguous_or_non_loopback_input(self):
        document = episode()
        document["batches"][0]["consent"]["version"] = "old-consent"
        with self.assertRaises(InvalidExport):
            evaluate(document, self.answer, ORIGIN)
        with self.assertRaises(ValueError):
            evaluate(episode(), self.answer, "https://private.example.test")
        document = episode()
        document["batches"][0]["events"].append(event("second-start", "episode.started", {"route": "mac_background_cua"}))
        with self.assertRaises(InvalidExport):
            evaluate(document, self.answer, ORIGIN)

    def test_duplicate_json_keys_are_not_accepted(self):
        original = self.answer.read_text()
        self.answer.write_text(original.replace('"term": "Fall 2026"', '"term": "Spring 2026", "term": "Fall 2026"'))
        self.assertEqual(evaluate(episode(), self.answer, ORIGIN)["outcome_reward"], 0)

    def test_refused_stale_snapshot_is_not_outside_observation(self):
        document = episode()
        events = document["batches"][0]["events"]
        refused = event("stale", "sia.action_result", {"name": "computer_snapshot", "result": {"outcome": "stale", "data": {}}})
        events.append(refused)
        result = evaluate(document, self.answer, ORIGIN)
        self.assertTrue(result["passed"])
        self.assertEqual(result["refused_observations"], 1)
        refused["payload"]["data"]["result"]["images"] = [{"data": "unbound pixels"}]
        self.assertFalse(evaluate(document, self.answer, ORIGIN)["passed"])

    def test_guarded_stale_action_records_recovery_cost(self):
        document = episode()
        document["batches"][0]["events"].append(event("stale-action", "sia.action_result", {"name": "computer_action", "result": {"outcome": "stale", "data": {}}}))
        result = evaluate(document, self.answer, ORIGIN)
        self.assertTrue(result["passed"])
        self.assertFalse(result["clean_execution"])
        self.assertEqual(result["refused_actions"], 1)
        self.assertEqual(result["violations"], [])


if __name__ == "__main__":
    unittest.main()
