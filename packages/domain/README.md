# @me-plus/domain

Platform-neutral Me+ business rules and application/domain services live here.

## Rules

- No browser APIs.
- No native/mobile modules.
- No UI framework dependencies.
- Depend on contracts and injected ports/adapters for persistence, reasoning and integrations.
- Keep domain decisions testable without a running client.
