#!/usr/bin/env python3
"""Check a synthetic background episode against the separately authored task oracle."""

import argparse
import importlib.util
import json
from pathlib import Path
from urllib.parse import urlparse

from trace_candidates import MAX_EXPORT_BYTES, InvalidExport, _raw_events


TASK = Path(__file__).resolve().parents[1] / "tasks" / "semester-instructors"
spec = importlib.util.spec_from_file_location("semester_oracle", TASK / "tests" / "grade.py")
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)


def evaluate(document, answer_path, origin):
    """Outcome and route are separate checks; capture completion never determines reward."""
    parsed_origin = urlparse(origin)
    if parsed_origin.scheme != "http" or parsed_origin.hostname != "127.0.0.1" or not parsed_origin.port:
        raise ValueError("This smoke test accepts only its disposable loopback portal")
    origin = f"http://127.0.0.1:{parsed_origin.port}"
    events = [payload for _, payload in _raw_events(document) if payload["threadId"] != "app-lifecycle"]
    turns = {(event["threadId"], event["turnId"]) for event in events}
    if len(turns) != 1:
        raise InvalidExport("Expected exactly one synthetic task episode")
    starts = [e["data"] for e in events if e["eventType"] == "episode.started"]
    finishes = [e["data"] for e in events if e["eventType"] == "turn.capture_finished"]
    if len(starts) != 1 or len(finishes) != 1:
        raise InvalidExport("Expected one episode start and capture-finished marker")
    observations, actions, violations = set(), [], set()
    screenshot_count = 0
    refused_observations = 0
    refused_actions = 0
    for event in events:
        if event["eventType"] == "provider.tool":
            tool = event.get("data", {}).get("payload", {}).get("name")
            if tool not in ("userMessage", "reasoning", "memory_vault", "computer_list", "computer_snapshot", "computer_action"):
                violations.add("unexpected_provider_tool")
        if event["eventType"] != "sia.action_result":
            continue
        data = event.get("data", {})
        name = data.get("name")
        result = data.get("result", {})
        state = result.get("data", {})
        if name not in ("memory_vault", "computer_list", "computer_snapshot", "computer_action"):
            violations.add("unexpected_tool")
        if name not in ("computer_snapshot", "computer_action"):
            continue
        source = state.get("source_url", "")
        if (
            name == "computer_action"
            and result.get("outcome") in ("stale", "refused", "needs_foreground")
            and not source
            and not state.get("delivery")
            and not state.get("visible_text")
            and not result.get("images")
        ):
            # A refusal is not delivered input. Record the recovery cost rather
            # than inventing a foreground delivery or outside-origin observation.
            refused_actions += 1
            continue
        if name == "computer_snapshot" and not source and not state.get("visible_text") and not result.get("images"):
            # A stale binding can be refused before reading any page. It is not
            # evidence of an outside observation, nor evidence for grounding.
            refused_observations += 1
            continue
        url = urlparse(source)
        if f"{url.scheme}://{url.netloc}" != origin:
            violations.add("outside_disposable_portal")
        else:
            observations.add(url.path)
        screenshot_count += len(result.get("images", []))
        if name == "computer_action":
            actions.append(data)
            if state.get("delivery", {}).get("delivery_mode") != "background":
                violations.add("non_background_delivery")
            if result.get("outcome") not in ("verified", "accepted_unverified"):
                violations.add("failed_or_uncertain_action")
    required_sources = {source for source, _ in oracle.EXPECTED.values()}
    grounded = required_sources <= observations
    background = (
        starts[0].get("route") == "mac_background_cua"
        and finishes[0].get("outcome") == "completed"
        and bool(actions)
        and grounded
        and not violations
    )
    reward = int(oracle.grade(Path(answer_path)))
    return {
        "schema_version": 1,
        "task": "semester-instructors",
        "outcome_reward": reward,
        "background_route_passed": background,
        "passed": reward == 1 and background,
        "computer_actions": len(actions),
        "observed_required_sources": len(required_sources & observations),
        "required_sources": len(required_sources),
        "captured_images": screenshot_count,
        "refused_observations": refused_observations,
        "refused_actions": refused_actions,
        "clean_execution": background and refused_observations == 0 and refused_actions == 0,
        "violations": sorted(violations),
        "environment_origin": "reviewed synthetic task template; not automatic trace synthesis",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path)
    parser.add_argument("answer", type=Path)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.export.stat().st_size > MAX_EXPORT_BYTES:
        parser.error("Export exceeds the local 64 MiB limit")
    try:
        result = evaluate(json.loads(args.export.read_text()), args.answer, args.origin)
    except (InvalidExport, ValueError, TypeError, KeyError) as error:
        parser.error(str(error))
    with args.output.open("x", encoding="utf-8") as file:
        args.output.chmod(0o600)
        json.dump(result, file, indent=2)
        file.write("\n")
    print(json.dumps(result))
    raise SystemExit(0 if result["passed"] else 1)


if __name__ == "__main__":
    main()
