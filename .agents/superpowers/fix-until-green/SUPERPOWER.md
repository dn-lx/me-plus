---
name: fix-until-green
description: Diagnose and repair build, test or CI failures without wasteful repeated context or blind retry loops.
---

# Fix Until Green

1. Capture the exact failing command/check and a compact failure fingerprint.
2. Reproduce the smallest deterministic failure available.
3. Retrieve only the source/config/tests implicated by that failure.
4. Form one evidence-based repair hypothesis and make the smallest change.
5. Rerun the narrow check; only then rerun the broader required gate.
6. If the same fingerprint repeats, do not keep retrying the same approach.
7. After three materially different repair attempts, stop the automatic loop and record evidence/blocker rather than burning context.
8. When green, inspect the diff for accidental test weakening or unrelated changes.

Use `context7` only when current external API/library behavior is material. Use `security-boundary-review` only if the repair touches a sensitive boundary.
