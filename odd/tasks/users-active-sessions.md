# Users active sessions

## Objective and authorized scope
Deliver the M02/RF02/HU02/P03 in-memory Sessions section in `/admin/users`, following RNF06/RNF08/RNF09/RNF10/RNF12. One expandable row per catalog user, including zero sessions; details device/IP/start/expiry; filters All/With sessions/Without sessions; individual revoke confirmation; live active-session count in four-section navigation. No duplicated email/role/permission fields, no bulk close-other action.

User approved fictitious source-owned data and simulated revocation. Active means nonexpired; current demo session is identified and cannot be revoked. This registry is separate from auth and never changes login/logout, permissions, persistence or backend contracts. Display UTC consistently with existing demo dates, without choosing the future operational timezone. Normal Spanish product copy, provenance in code/docs only.

## Constraints and existing work
Preserve user-owned changes to `.gitignore`, `package.json`, `package-lock.json`, `.github/`, `playwright.config.ts`, `tests/`, `permission.entity.ts`. Extend existing user-owned users-domain `user-session.entity.ts` and empty `user-session.repository.ts` without erasing their intent. No E2E tool adoption, dependency installs, staging, commits, push or PR authorized. Keep auth's different UserSession unchanged.

Use stateless execute use cases, domain typed Results/errors, infrastructure repository implementing contract and injecting root in-memory source, token bound useExisting, focused NgRx SignalStore. Component requests cancelled through DestroyRef; latency precedes effects; defensive copies; current-session protection enforced below UI. Reuse installed Helm; generate missing components only through local Spartan CLI after info.

## Tasks and route
- [ ] T1 — Session query/revoke behavior, fixtures, repository/provider/use cases/store and deterministic tests. Delegated writer: multi-file write trigger. Status: in progress; commit pending.
- [ ] T2 — Connect grouped Sessions UI, filters, expansion, confirmation, async states and live counters; preserve Users behavior and disabled RBAC/Audit; component tests. Delegated same single writer: multi-file write trigger. Status: pending.
- [ ] T3 — Update delivery docs, format touched files, focused/full Vitest and production SSR build; independent spot check and browser acceptance when available. Delegated writer checks, verifier as required. Status: pending.

## Acceptance and verification
Test-first RED/GREEN for applicable session/source/use-case/store/UI behavior; record exact evidence. Cover zero/multiple sessions, expiry exclusion, all users, filters/counts, current-session protected revoke, unknown IDs, successful/failed revoke, pending duplicate prevention, cancellation without mutation, defensive dates, navigation and existing user regressions. Revocation confirms affected user/device and reports success only after operation succeeds. Do not invent real security controls.

Discover Angular MCP targets and practices before Angular edits (parent completed). Run `npx ng generate @spartan-ng/cli:info --json`; use official Angular test/build targets where available, workspace-local CLI fallback with limitation recorded. Format only changed paths with `npx --no-install prettier --write <paths>` and `--check`. Focused users specs then full `npm test -- --watch=false`, `npm run build`, `git diff --check`. No E2E installation. Browser visual/keyboard/viewport acceptance is separately pending until observed.

## Delivery and review workload
Forecast: roughly 800–1200 authored additions/deletions including tests; new generated Helm excluded. Strategy: ask-on-risk, defer chain choice until any commit/PR preparation. Keep cohesive backend-demo behavior and grouped UI as reviewable boundaries; do not drop tests or minify for line budget. No commit authorized; tasks stay open until verified outcomes and human-approved work-unit commit exist. RDD pending normalized candidate; no committedOnly review of uncommitted work.

## Progress and evidence
Read-only scout confirmed Sessions currently disabled, session metrics decorative, existing repository empty; no backend contract. Parent discovered Angular22 build/serve/test targets, consulted best practices and reviewed image. Git existing changes listed above preserved. No tests/build yet run for this feature.

## Next step
Single bounded writer implements T1 then T2 and T3 checks, reports evidence and actual changed paths. Parent reconciles tasks/mirror and native review/verification before delivery; human staging and explicit snapshot/message approval remain separate.
