import base64
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from trace_candidates import InvalidExport, triage  # noqa: E402


def event(event_id, event_type, data, kind="raw.event", **extra):
    return {
        "id": event_id,
        "kind": kind,
        "payload": {
            "threadId": "private-thread-id",
            "turnId": "private-turn-id",
            "eventType": event_type,
            "data": data,
            **extra,
        },
    }


def export_with(events, version="alpha-research-v3-raw"):
    return {"batches": [{"format": "raw_v1", "consent": {"version": version}, "events": events}]}


class TraceCandidatesTests(unittest.TestCase):
    def test_background_episode_is_triaged_without_copying_private_content(self):
        private = "private@example.test secret task text"
        document = export_with(
            [
                event("start", "episode.started", {"route": "mac_background_cua", "source": "manual"}),
                event("prompt", "timeline.user", {"text": private}),
                event("snapshot", "sia.action_result", {"name": "computer_snapshot", "result": {"images": [private]}}),
                event("action", "sia.action_result", {"name": "computer_action", "arguments": {"text": private}}),
                event("end", "turn.capture_finished", {"outcome": "completed"}),
            ]
        )
        review_index = {}
        result = triage(document, review_index)
        candidate = result["episodes"][0]
        self.assertEqual(candidate["archetype"], "background_computer")
        self.assertEqual(candidate["computer_actions"], 1)
        self.assertEqual(candidate["computer_observations"], 2)
        self.assertTrue(candidate["candidate_for_review"])
        self.assertFalse(candidate["independent_reward_available"])
        self.assertEqual(review_index[candidate["episode_key"]], {"thread_id": "private-thread-id", "turn_id": "private-turn-id"})
        serialized = json.dumps(result)
        for forbidden in (private, "private-thread-id", "private-turn-id"):
            self.assertNotIn(forbidden, serialized)

    def test_reassembles_chunked_events_across_batches(self):
        body = json.dumps({"name": "computer_action", "result": {"summary": "private"}}).encode()
        middle = len(body) // 2
        chunks = [
            event(
                f"chunk-{index}",
                "sia.action_result",
                None,
                kind="raw.event_chunk",
                eventId="original-action",
                chunkIndex=index,
                chunkCount=2,
                chunkData=base64.b64encode(piece).decode(),
            )
            for index, piece in enumerate((body[:middle], body[middle:]))
        ]
        document = export_with(
            [event("start", "episode.started", {"route": "mac_background_cua"}), chunks[1]]
        )
        document["batches"].append(export_with([chunks[0], event("end", "turn.capture_finished", {"outcome": "completed"})])["batches"][0])
        result = triage(document)
        self.assertEqual(result["episodes"][0]["computer_actions"], 1)
        self.assertNotIn("private", json.dumps(result))

    def test_incomplete_chunks_fail_closed(self):
        document = export_with(
            [
                event("start", "episode.started", {"route": "mac_background_cua"}),
                event(
                    "chunk-0", "sia.action_result", None, kind="raw.event_chunk",
                    eventId="original", chunkIndex=0, chunkCount=2, chunkData="e30=",
                ),
            ]
        )
        with self.assertRaises(InvalidExport):
            triage(document)

    def test_unconsented_batches_do_not_become_candidates(self):
        document = export_with(
            [
                event("start", "episode.started", {"route": "mac_foreground_native"}),
                event("end", "turn.capture_finished", {"outcome": "completed"}),
            ], version="alpha-research-v2"
        )
        self.assertEqual(triage(document)["episodes"], [])

    def test_workspace_connector_turn_is_excluded_even_if_export_is_malformed(self):
        document = export_with(
            [
                event("start", "episode.started", {"route": "mac_background_cua"}),
                event("snapshot", "sia.action_result", {"name": "computer_snapshot"}),
                event("mail", "sia.action_result", {"name": "mail_search"}),
                event("end", "turn.capture_finished", {"outcome": "completed"}),
            ]
        )
        self.assertEqual(triage(document)["episodes"], [])

    def test_cli_writes_private_review_index_and_metadata_only_candidate(self):
        document = export_with(
            [
                event("start", "episode.started", {"route": "mac_background_cua"}),
                event("private", "timeline.user", {"text": "do not copy private@example.test"}),
                event("snapshot", "sia.action_result", {"name": "computer_snapshot"}),
                event("end", "turn.capture_finished", {"outcome": "completed"}),
            ]
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, candidate, index = (root / name for name in ("raw.json", "candidates.json", "index.json"))
            source.write_text(json.dumps(document))
            subprocess.run(
                [sys.executable, str(Path(__file__).resolve().parents[1] / "tools" / "trace_candidates.py"), str(source), "--output", str(candidate), "--review-index", str(index)],
                check=True,
                capture_output=True,
                text=True,
            )
            public = candidate.read_text()
            self.assertNotIn("private@example.test", public)
            self.assertNotIn("private-thread-id", public)
            self.assertIn("private-thread-id", index.read_text())
            if os.name == "posix":
                self.assertEqual(stat.S_IMODE(candidate.stat().st_mode), 0o600)
                self.assertEqual(stat.S_IMODE(index.stat().st_mode), 0o600)


if __name__ == "__main__":
    unittest.main()
