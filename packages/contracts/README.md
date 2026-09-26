# @me-plus/contracts

Shared schemas, DTOs, event shapes and service contracts used across web, mobile, backend and reasoning layers live here.

## Rules

- Keep contracts explicit and versionable.
- Prefer runtime-validatable schemas for external/system boundaries.
- Do not place business logic or platform-specific code here.
- Treat contract changes as cross-client changes that require compatibility review.
