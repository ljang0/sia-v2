import importlib.util
import json
import os
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import urlopen


TASK = Path(__file__).resolve().parents[1] / "tasks" / "semester-instructors"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


portal = load_module("semester_portal", TASK / "environment" / "portal" / "app.py")
grader = load_module("semester_grader", TASK / "tests" / "grade.py")


class SemesterInstructorsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = portal.ThreadingHTTPServer(("127.0.0.1", 0), portal.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def test_reference_solution_navigates_portal_and_passes_independent_oracle(self):
        with tempfile.TemporaryDirectory() as directory:
            answer = Path(directory) / "answer.json"
            subprocess.run(
                ["node", str(TASK / "solution" / "solve.mjs")],
                env={**os.environ, "SIA_RL_PORTAL_ORIGIN": self.origin, "SIA_RL_ANSWER_PATH": str(answer)},
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertTrue(grader.grade(answer))
            data = json.loads(answer.read_text())
            self.assertEqual(len(data["courses"]), 3)
            with urlopen(self.origin + "/calendar") as response:
                self.assertIn("Dr. Dana Moss", response.read().decode())

    def test_noop_and_shortcut_answers_score_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            answer = Path(directory) / "answer.json"
            self.assertFalse(grader.grade(answer))
            base = {
                "term": "Fall 2026",
                "courses": [
                    {"code": "CS-122", "instructors": ["Dr. Mira Solis"], "source_path": "/courses/cs-122/people"},
                    {"code": "MATH-241", "instructors": ["Dr. Elias Rowan"], "source_path": "/courses/math-241/syllabus"},
                    {"code": "STAT-219", "instructors": ["Dr. Priya Nair", "Dr. Theo Mercer"], "source_path": "/courses/stat-219/people"},
                ],
            }
            for mutated in (
                {**base, "courses": base["courses"][:2]},
                {**base, "courses": [*base["courses"][:2], {**base["courses"][2], "instructors": ["Dr. Priya Nair"]}]},
                {**base, "courses": [base["courses"][0], {**base["courses"][1], "instructors": ["Dr. Dana Moss"]}, base["courses"][2]]},
                {**base, "courses": [{**base["courses"][0], "source_path": "/calendar"}, *base["courses"][1:]]},
            ):
                answer.write_text(json.dumps(mutated))
                self.assertFalse(grader.grade(answer))


if __name__ == "__main__":
    unittest.main()
