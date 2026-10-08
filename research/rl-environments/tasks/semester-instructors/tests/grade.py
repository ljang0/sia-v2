"""Independent, exact-state verifier. This file is absent from the agent image."""

import json
import os
from pathlib import Path


EXPECTED = {
    "CS-122": ("/courses/cs-122/people", {"Dr. Mira Solis"}),
    "MATH-241": ("/courses/math-241/syllabus", {"Dr. Elias Rowan"}),
    "STAT-219": ("/courses/stat-219/people", {"Dr. Priya Nair", "Dr. Theo Mercer"}),
}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


def grade(path: Path) -> bool:
    try:
        if path.stat().st_size > 16_384:
            return False
        answer = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_object)
    except (OSError, UnicodeError, ValueError):
        return False
    if not isinstance(answer, dict) or set(answer) != {"term", "courses"}:
        return False
    if answer["term"] != "Fall 2026" or not isinstance(answer["courses"], list):
        return False
    if len(answer["courses"]) != len(EXPECTED):
        return False
    seen = set()
    for course in answer["courses"]:
        if not isinstance(course, dict) or set(course) != {"code", "instructors", "source_path"}:
            return False
        code = course["code"]
        if not isinstance(code, str) or code not in EXPECTED or code in seen:
            return False
        seen.add(code)
        source, names = EXPECTED[code]
        submitted = course["instructors"]
        if (
            course["source_path"] != source
            or not isinstance(submitted, list)
            or not all(isinstance(name, str) for name in submitted)
            or len(submitted) != len(names)
            or set(submitted) != names
        ):
            return False
    return seen == set(EXPECTED)


if __name__ == "__main__":
    answer_path = Path(os.environ.get("SIA_RL_ANSWER_PATH", "/workspace/answer.json"))
    if grade(answer_path):
        print("verified")
    else:
        print("incorrect or incomplete")
        raise SystemExit(1)
