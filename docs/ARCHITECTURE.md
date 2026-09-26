# Me+ Architecture

## System shape

Me+ is a single product implemented as a monorepo with two first-class clients and shared platform-neutral packages.

```text
apps/
  web/        # dashboard, analysis, configuration, administration
  mobile/     # daily interaction, notifications, capture, device integrations
packages/
  domain/     # business rules and domain services
  contracts/  # shared types, schemas and service contracts
  ui/         # reusable presentation primitives where genuinely portable
  reasoning/  # provider-neutral reasoning interfaces, policies and orchestration
supabase/
  migrations/ # canonical schema evolution
  functions/  # server-side functions only where justified
tests/        # cross-cutting integration/e2e fixtures and suites
```

## Ownership rules

### `apps/web`
Owns browser-specific routing, rendering, accessibility, browser integrations and web deployment configuration. It may consume shared packages but must not become the home for canonical business rules.

### `apps/mobile`
Owns native/mobile navigation, notifications, permission flows, offline/client lifecycle and device/platform integrations. Native capabilities such as health/sensor access must be wrapped behind typed adapters before data enters shared services.

### `packages/domain`
Owns platform-neutral business rules and application/domain services. It must not import browser APIs, native modules, UI frameworks or deployment-specific code.

### `packages/contracts`
Owns shared schemas, DTOs, event shapes and service boundaries. Contracts should remain small, explicit and versionable.

### `packages/ui`
Contains only components/tokens that are genuinely reusable across clients. Do not force cross-platform UI sharing when it harms native or web ergonomics.

### `packages/reasoning`
Owns provider-neutral reasoning interfaces, domain-policy evaluation, structured reasoning inputs/outputs and orchestration contracts. Model providers are replaceable dependencies and never canonical storage.

### `supabase`
Owns database migrations and server-side database/auth/storage configuration. Supabase Postgres is the canonical structured state. RLS and explicit user ownership are mandatory for exposed user data.

## Data flow

```text
web/mobile interaction
        ↓
client adapter
        ↓
shared domain service
        ↓
Supabase canonical state
        ↓
retrieval + domain policy
        ↓
reasoning provider
        ↓
structured insight/action proposal
        ↓
user review or authorized automation
        ↓
auditable write back to canonical state
```

## Invariants

1. Web and mobile are clients of one Me+ product, not separate systems.
2. Canonical user state lives in Supabase, not model memory or device-local state.
3. Platform-native APIs do not leak into shared domain packages.
4. Raw observations and derived AI insights remain distinguishable.
5. External side effects are explicit, auditable and constrained by domain policies.
6. Sensitive data collection is minimized; access to a device capability does not imply permission to persist everything it exposes.
7. Shared code is preferred only where the abstraction is real; duplication is acceptable when forced sharing would couple unrelated platform concerns.

## Framework decisions

The repository structure is intentionally framework-neutral at this stage. Choose the actual web framework, mobile framework, workspace/package manager and deployment providers only after checking current ecosystem documentation and validating support for Supabase, testing, accessibility, native permissions and long-term maintenance.
