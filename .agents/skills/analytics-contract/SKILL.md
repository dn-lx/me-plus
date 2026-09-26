---
name: analytics-contract
description: Define privacy-safe, provider-neutral product analytics events and verify their wiring without making analytics authoritative.
---

# Analytics Contract

Use when adding/changing product analytics events, funnels, flags, experiments or instrumentation.

This skill owns the **event contract and wiring discipline**. The analytics provider (for example PostHog) is an implementation detail.

## Event contract first

Before wiring an event, define:
- event name,
- exact trigger,
- business question/use case,
- allowed properties and types,
- identity model if needed,
- forbidden/sensitive properties,
- deduplication/idempotency expectations,
- versioning or migration needs.

Use `docs/templates/ANALYTICS-EVENT-CONTRACT-TEMPLATE.md` when the project needs a durable taxonomy.

Prefer explicit business events such as `quotation_created` over generic events such as `button_clicked`.

## Privacy and authority rules

- Do not send passwords, payment details, message bodies, precise addresses or unnecessary personal data.
- Minimize identifiers and document consent/privacy requirements.
- Analytics must never be authoritative for pricing, authentication, authorization, payment, booking, entitlement or other transactional decisions.
- Feature flags/experiments must have safe defaults and rollback behavior.
- Treat analytics writes as external/shared-system writes under MCP policy.

## Verification

For changed instrumentation:
1. verify the event fires only at the intended trigger,
2. verify property names/types and absence of forbidden data,
3. check duplicate/retry behavior,
4. confirm failed analytics delivery does not break the product flow,
5. verify the intended environment/project before external writes,
6. record evidence without pasting sensitive event payloads.

Keep the taxonomy stable; rename/remove events deliberately and document downstream migration where consumers depend on them.
