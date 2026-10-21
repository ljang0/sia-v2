#!/usr/bin/env python3
"""Triage consented Sia raw exports without copying task content into candidates."""

import argparse
import base64
import hashlib
import json
import os
import secrets
from collections import defaultdict
from pathlib import Path


CONSENT_VERSION = "alpha-research-v3-raw"
MAX_EXPORT_BYTES = 64 * 1024 * 1024
MAX_CHUNKS_PER_EVENT = 4096


class InvalidExport(ValueError):
    pass


def _is_object(value):
    return isinstance(value, dict)


def _raw_events(document):
    batches = document.get("batches") if _is_object(document) else None
    if not isinstance(batches, list):
        raise InvalidExport("Expected a Sia research export with a batches array")
    ordinary = []
    chunks = defaultdict(list)
    for batch in batches:
        if not _is_object(batch) or batch.get("format") != "raw_v1":
            continue
        consent = batch.get("consent")
        if not _is_object(consent) or consent.get("version") != CONSENT_VERSION:
            continue
        for event in batch.get("events", []):
            if not _is_object(event) or not _is_object(event.get("payload")):
                raise InvalidExport("Malformed raw event")
            payload = event["payload"]
            if not all(isinstance(payload.get(field), str) for field in ("threadId", "turnId", "eventType")):
                raise InvalidExport("Raw event has no turn identity")
            if event.get("kind") == "raw.event":
                ordinary.append((event.get("id"), payload))
            elif event.get("kind") == "raw.event_chunk":
                event_id = payload.get("eventId")
                if not isinstance(event_id, str):
                    raise InvalidExport("Raw chunk has no event ID")
                chunks[event_id].append(payload)
            else:
                raise InvalidExport("Unexpected raw event kind")
    for event_id, parts in chunks.items():
        first = parts[0]
        expected_count = first.get("chunkCount")
        if not isinstance(expected_count, int) or not 1 <= expected_count <= MAX_CHUNKS_PER_EVENT:
            raise InvalidExport("Invalid chunk count")
        if len(parts) != expected_count or {part.get("chunkIndex") for part in parts} != set(range(expected_count)):
            raise InvalidExport("Incomplete or duplicated raw event chunks")
        if any(
            part.get("chunkCount") != expected_count
            or any(part.get(key) != first.get(key) for key in ("threadId", "turnId", "eventType"))
            for part in parts
        ):
            raise InvalidExport("Inconsistent raw event chunks")
        try:
            body = b"".join(
                base64.b64decode(part["chunkData"], validate=True)
                for part in sorted(parts, key=lambda part: part["chunkIndex"])
            )
            data = json.loads(body)
        except (KeyError, ValueError, TypeError) as error:
            raise InvalidExport("Could not decode raw event chunks") from error
        ordinary.append((event_id, {**first, "data": data}))
    return ordinary


def triage(document, review_index=None):
    events = _raw_events(document)
    by_turn = defaultdict(list)
    for event_id, payload in events:
        if payload["threadId"] == "app-lifecycle":
            continue
        by_turn[(payload["threadId"], payload["turnId"])].append((event_id, payload))

    salt = secrets.token_bytes(32)
    candidates = []
    for (thread_id, turn_id), turn_events in by_turn.items():
        if any(
            payload["eventType"] == "sia.action_result"
            and _is_object(payload.get("data"))
            and isinstance(payload["data"].get("name"), str)
            and payload["data"]["name"].startswith(("mail_", "drive_", "docs_", "sheets_", "slides_"))
            for _, payload in turn_events
        ):
            continue  # Defense in depth if an ineligible Workspace turn reaches an export.
        started = next((p["data"] for _, p in turn_events if p["eventType"] == "episode.started"), None)
        finished = next((p["data"] for _, p in turn_events if p["eventType"] == "turn.capture_finished"), None)
        if not _is_object(started) or not _is_object(finished):
            continue
        route = started.get("route")
        if route not in ("mac_foreground_native", "mac_background_cua", "connected_apps"):
            continue
        tool_events = sum(p["eventType"] == "provider.tool" for _, p in turn_events)
        computer_actions = 0
        computer_observations = 0
        for _, payload in turn_events:
            if payload["eventType"] != "sia.action_result" or not _is_object(payload.get("data")):
                continue
            name = payload["data"].get("name")
            if name == "computer_snapshot":
                computer_observations += 1
            elif name == "computer_action":
                computer_actions += 1
                computer_observations += 1  # background actions return a fresh observation
        has_observations = computer_observations > 0 or tool_events > 0
        archetype = (
            "background_computer"
            if route == "mac_background_cua"
            else "foreground_computer"
            if route == "mac_foreground_native"
            else "connected_app"
        )
        episode_key = hashlib.sha256(salt + thread_id.encode() + b"\0" + turn_id.encode()).hexdigest()[:20]
        if review_index is not None:
            review_index[episode_key] = {"thread_id": thread_id, "turn_id": turn_id}
        candidates.append(
            {
                "episode_key": episode_key,
                "route": route,
                "archetype": archetype,
                "capture_outcome": finished.get("outcome") if finished.get("outcome") in ("completed", "discarded") else "unknown",
                "provider_tool_events": tool_events,
                "computer_actions": computer_actions,
                "computer_observations": computer_observations,
                "candidate_for_review": has_observations,
                "independent_reward_available": False,
                "replayable_environment_available": False,
            }
        )
    return {
        "schema_version": 1,
        "policy": "metadata-only research triage; no model training or publication authorization",
        "episodes": sorted(candidates, key=lambda item: item["episode_key"]),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path, help="Sia local research export JSON; keep it outside Git")
    parser.add_argument("--output", required=True, type=Path, help="New metadata-only JSON output path")
    parser.add_argument("--review-index", type=Path, help="Optional private key-to-turn mapping; keep it outside Git")
    args = parser.parse_args()
    paths = [args.export.resolve(), args.output.resolve()]
    if args.review_index:
        paths.append(args.review_index.resolve())
    if len(set(paths)) != len(paths):
        parser.error("Input and output paths must differ")
    if args.export.stat().st_size > MAX_EXPORT_BYTES:
        parser.error("Export exceeds the 64 MiB local triage limit; split it offline first")
    try:
        review_index = {}
        result = triage(json.loads(args.export.read_text(encoding="utf-8")), review_index)
    except (OSError, UnicodeError, json.JSONDecodeError, InvalidExport) as error:
        parser.error(f"Could not triage export: {error}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as file:
        json.dump(result, file, indent=2, sort_keys=True)
        file.write("\n")
    if args.review_index:
        args.review_index.parent.mkdir(parents=True, exist_ok=True)
        descriptor = os.open(args.review_index, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            json.dump(review_index, file, indent=2, sort_keys=True)
            file.write("\n")
    print(f"Wrote {len(result['episodes'])} metadata-only candidates to {args.output}")


if __name__ == "__main__":
    main()
