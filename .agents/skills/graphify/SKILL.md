---
name: graphify
description: Build and query a local Graphify code graph to inspect imports, callers and change impact before loading broad repository context.
---

# Local Graphify

Use [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify), distributed on PyPI as `graphifyy`.

Graphify is a developer/agent navigation tool, not an application dependency and not an authoritative runtime model.

## Setup

From repository root:

### Windows PowerShell

```powershell
python -m venv .venv-graphify
.\.venv-graphify\Scripts\python.exe -m pip install -r .agents/skills/graphify/requirements.txt
.\.venv-graphify\Scripts\graphify.exe --version
```

### macOS/Linux

```bash
python3 -m venv .venv-graphify
.venv-graphify/bin/python -m pip install -r .agents/skills/graphify/requirements.txt
.venv-graphify/bin/graphify --version
```

## Build and query

```powershell
.\.venv-graphify\Scripts\graphify.exe extract . --code-only --output .graphify
.\.venv-graphify\Scripts\graphify.exe query "YOUR_SYMBOL_OR_TERM" --graph .graphify/graphify-out/graph.json
```

Use equivalent paths on macOS/Linux.

## Rules

- Rebuild after relevant source changes or revision switches.
- Verify graph findings against current source.
- Static analysis can miss dynamic imports, HTML wiring, runtime configuration and external services.
- Keep generated graphs and virtualenv out of Git/deploy artifacts.
- Review `.graphifyignore` before broad scans.
- Do not include secrets, dependency trees or generated artifacts.
- Use Graphify to narrow context; it does not replace tests, source inspection, browser verification or database policy review.
