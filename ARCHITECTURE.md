# System and reliability brief

Node 24 + TypeScript, React, Vite for frontend compilation, built-in HTTP/fetch/test/crypto/fs. Local JSON journals. Single loopback process; no cloud infrastructure.

## Contract
Intent → external discovery → graph validation → risk preview → operator execution → preflight reads → ordered mutations → independent reads → at most one repair → final reconciliation → evidence receipt.

Each entity contains app, external ID, link, observed value, revision/fingerprint, prerequisites, owner, and risk. Actions carry before/expected state and dependency IDs. External values are data, never executable instructions. Model output is validated and has no tool privileges.

SUCCESS requires all planned postconditions verified by reads, no blockers, and no outstanding approval. FAILED means a known mismatch, conflict, or definitive action failure. INCONCLUSIVE means missing evidence, unreadable state, ambiguity, or pending approval. Receipt retains API acknowledgment separately from observations. Verification is point-in-time; cross-app atomicity is not promised.

## Recovery and concurrency
Preflight every entity before the first write. Recheck immediately before each mutation. Calendar uses If-Match; Docs uses requiredRevisionId. Sheets has no compare-and-swap: recheck row identity and fingerprint before writing one due-date cell; dedicated single-editor demo only. A changed value is a conflict, never an excuse to overwrite. A timeout triggers readback before any retry. Retry only if observed state still equals before; at most two mutation attempts. Do not roll back verified changes blindly. Stop dependent work and retain partial evidence.

Persist journal before mutations. A crashed execution is INCONCLUSIVE after restart and cannot silently replay. Repeated execute requests return the existing run. A process-wide execution lock prevents overlapping plans. Approval is tied to a server-owned plan; clients cannot submit arbitrary actions.

## Authentication and scope
Google Desktop OAuth with PKCE, random state, loopback callback, tokens under gitignored secrets/. Scopes: Calendar events, Sheets, Docs. Tokens never enter frontend or receipts. Only newly provisioned Mercury sandbox IDs can mutate. Calendar events with attendees require approval; external brief changes require approval. No email/Slack sending capability.

## Implementation plan
- [ ] Core: src/domain.ts + src/engine.ts; test A–F and missing evidence using Node test runner. Verify graph dates, no false success, bounded retries, dependency stopping.
- [ ] APIs: src/google.ts + src/auth.ts; raw documented Google requests, scope validation, revision checks, contract tests. Provision a sandbox and read it back.
- [ ] App: src/server.ts + web/App.tsx; server-owned plans, execution lock, receipts, readable graph and evidence; typecheck, production build, browser walkthrough.
- [ ] Submission: deterministic evaluation report, demo script, hostile review, Ponytail review/audit, live three-app run. Record exact gaps rather than claim readiness.

## API sources
- https://developers.google.com/calendar/api/guides/version-resources
- https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate
- https://developers.google.com/workspace/sheets/api/guides/values
- https://developers.google.com/identity/protocols/oauth2/native-app
