# Request lifecycle and repository boundaries

## Goal and authorized scope
Implement component-owned request cancellation using DestroyRef; user dialogs close via guarded Cancel on outside clicks when idle and block all user dismissal while requesting; icon-only users actions with accessible names; remove role management modal and launch button, preserving roles and user selection. Introduce infrastructure repository implementations injecting in-memory sources for auth, customers, users and roles, explicitly replacing the previous direct-source repository convention by user request. Add cancellable latency before in-memory effects (users/roles250ms; preserve existing auth/customer latency). No HTTP, backend, ACL, credential integration, new roles screen, global UI redesign, production persistence decision, push or PR.

## Evidence and architecture
Read-only scout inspected guides/configuration and mapped four capabilities. Customers mutations and auth login currently write before delay, so unsubscription only cancels delivery; move effects behind a cancellable timing boundary. Root stores stay root-provided; consumer cancellation must not destroy shared stores or other requests. Page initialization cancellation must stop subsequent seed operations; no component-state feedback after destruction. Auth guard restoration preserves session behavior. Installed Brain1.4.1 dialog dismissal options fixed at open time; use public CDK overlay events with native dismissal disabled and guarded cancel handler, no private API mutation. Verify actual injection and events before using.

## Tasks and routing
- [ ] R1: Infrastructure repository classes and DI for auth/customers/users/roles; remove repository implements from sources; cancellable memory latency and no early side effects; adapter/source/composition tests. Delegated writer (multi-file trigger). In progress.
- [ ] R2: DestroyRef lifecycle in component-owned requests including login, users dialogs/page initialization; idle outside cancellation/pending dismissal lock; icon-only accessible actions; remove role management UI and obsolete specs; retain role contracts/store/selector. Delegated writer, sequential after R1 checks. Pending.
- [ ] R3: Independent/final regression assessment, build, documentation/AGENTS convention update, checks and human staging/exact snapshot-message approval. Delegated verification and primary documentation. Pending.

Tasks remain unchecked until checks and human-approved work-unit commits exist. No staging or commits authorized by implementation request. Track implementation-ready separately.

## Verification plan
Applicable deterministic behavior tests use observed RED then GREEN/refactor with Angular Vitest, including unsubscribe-before-mutation and no ID allocation, adapter mapping/shared source state, role deletion integrity, destruction while pending without writes/success/error feedback, outside-click idle and pending, keyboard dismissal lock, disabled cancel, icon-only names/no role management. Run focused tests per unit, final `npm test -- --watch=false` and `npm run build`. Official Angular MCP unavailable; use local scripts/CLI. Browser tools unavailable: rendered responsive/contrast/keyboard/ChromeEdgeFirefox and SSR runtime checks cannot be claimed. Passive documentation has no meaningful RED; use structural readback/link/claims checks.

## Delivery and rollback
Branch feat/request-lifecycle-repositories from main c66b76a; prior users commits contained in main by fast-forward. Forecast700–1200 authored additions+deletions, advisory only (no compression/omitted tests). Strategy ask-on-risk: decide delivery slicing before commit/publication, not from TODO checkboxes. Rollback R1 removes adapters and reverts DI/source timing/tests together; R2 reverts consumers/UI/tests without touching contracts. No parallel writers. No PR/push authorized.

## Current evidence and next step
Mapping complete, worktree initially clean, task file observed absent before creation. Start R1 bounded writer; keep existing demo provenance internal and production-like Spanish UI copy unchanged. RDD outcome pending per final candidate; never reuse previous code decline or documentation receipt for these changes.
