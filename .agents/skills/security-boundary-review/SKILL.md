---
name: security-boundary-review
description: Review authentication, authorization, secrets, sensitive data, external writes and command-execution trust boundaries.
---

# Security Boundary Review

Trace each protected action from user/agent input to the actual enforcing server/database/OS/external-system boundary.

Check:
- actor and allowed resource/action,
- where authorization is truly enforced,
- tenant/user ownership checks,
- authentication/session/token lifecycle (creation, rotation/revocation, cookie/storage settings and logout/invalidation where applicable),
- public ingress such as APIs/webhooks: authentication/signatures, replay resistance, rate/abuse limits and idempotency for sensitive writes,
- untrusted browser/web input and output boundaries: validation, output encoding/XSS, CSRF/CORS/origin rules and security headers when relevant,
- untrusted URLs/redirects/server-side fetches for SSRF/open-redirect risk,
- file uploads/downloads: content/type/size/path handling, malware/untrusted active content and authorization,
- public vs secret configuration,
- command construction and shell/process boundaries,
- repository URL/branch/write permissions,
- provider prompts/context for secret leakage,
- logs/events/error output for credentials or sensitive data,
- sensitive-data classification/minimization, retention/deletion/export requirements and auditability where applicable,
- encryption/transport expectations for sensitive data and provider-managed storage,
- storage/file permissions,
- least privilege on external connectors,
- destructive/reversible nature of writes.

Browser UI restrictions are not server authorization.

For auth/authorization/worker privilege/secrets/payments/data/public-ingress/upload/webhook changes:
- run independent security review,
- include denied/negative-path tests where practical,
- report unresolved risk rather than assuming safety.
