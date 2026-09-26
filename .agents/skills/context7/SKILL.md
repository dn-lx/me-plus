---
name: context7
description: Use current, version-aware third-party library/API documentation before changing code that depends on external SDKs or frameworks.
---

# Context7 Usage

Context7 is an agent-host documentation capability, not an application dependency.

When a task touches an external library, SDK, framework or API:

1. identify the exact package/provider and installed/targeted version,
2. query current documentation,
3. compare the intended API with the repository version/config,
4. implement the smallest compatible change,
5. verify with the project's actual tests/build/source.

Do not rely on remembered APIs when current documentation is available. External docs do not override project-specific architecture/security contracts already captured in source, tests or ADRs.
