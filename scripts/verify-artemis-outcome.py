"""Require actual Artemis Pro verification evidence; process exit alone is insufficient."""
import json
from pathlib import Path
import sys

outcomes = list(Path(sys.argv[1]).rglob("run_outcome.json"))
if len(outcomes) != 1:
    raise SystemExit(f"Expected exactly one Artemis run outcome, found {len(outcomes)}")
outcome = json.loads(outcomes[0].read_text(encoding="utf-8"))
tests = outcome.get("tests") or {}
print(json.dumps({"task_status": outcome.get("task_status"), "tests": tests}, indent=2))
if outcome.get("task_status") != "completed":
    raise SystemExit("Artemis task did not complete")
if int(tests.get("passed", 0)) < 4:
    raise SystemExit("Four verified acceptance checks are required")
if any(int(tests.get(key, 0)) for key in ("failed", "inconclusive", "unchecked")):
    raise SystemExit("Artemis reported failed, inconclusive or unchecked acceptance checks")
