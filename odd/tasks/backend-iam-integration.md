# Connect the documented backend IAM operations

## Objective and authorization

Integrate the updated backend contracts through feature HTTP sources and repository implementations, preserving `useExisting` bindings and existing consumers. The user also authorized renaming auth's identity model to `AuthSession`, removing age from users, and adapting permissions to the backend's dynamic catalog.

The user explicitly approved temporary localStorage persistence for both access and refresh tokens. This supersedes the prior memory-only decision: reload may restore a session. localStorage is JavaScript-readable persistence and exposes both credentials to XSS; no cookies are documented or implicitly selected. Never put real credentials in commands, tests, logs, documentation or task records.

Traceability: M01/RF01/HU01/P01; M02/RF02/HU02/P03; RNF01/RNF03/RNF09/RNF10/RNF12. Backend contract and outstanding issues: [IAM handoff](../../docs/backend-users-iam-gaps.md).

## Evidence and boundaries

- Public OpenAPI retrieved from `http://localhost:8080/v3/api-docs`: OpenAPI 3.1.0, version 0.1, 21 paths, raw SHA-256 `7cd6f155d85513215dfaecdbd7beb8dfa335899dc8a6c29f15b7bb92fd28bc28`. Only contract retrieval was performed; authenticated backend execution is not verified.
- Login now returns nested `usuario` plus access/refresh credentials and lifetimes. Refresh uses a required JSON body, rotates tokens and does not extend the original session. Concurrent refresh calls are forbidden.
- Users now expose stable role/profile data but no age. Permissions use dynamic IDs/codes, not demo module/action unions. Sessions and audit provide real operations and pagination.
- Response fields lack formal required/nullability declarations; validate runtime data and reject malformed responses rather than fabricating fields. Logout prose describes 204/access-token use while its response/security declarations differ; document and handle successful empty responses safely.
- Auth's current identity model and IAM's administrative session record have distinct responsibilities. Rename auth only; keep the IAM model and behavior unchanged in T1.
- Keep sources behind infrastructure repository implementations; preserve store lifetimes, cancellation, SSR safety, secure production API configuration and safe status-based errors. Backend authorization is authoritative.
- Do not add role-management UI, customer integration, undocumented endpoints or speculative role-name permissions. UI changes are limited to authorized age removal, dynamic permission consumption and necessary existing-consumer integration.

## Tasks and route

- [ ] T0 — Restore Engram write continuity through the supported runtime mapping, then mirror this full document. Route: read-only diagnostic scout; approved removal of obsolete package pin only. Status: pending; reload confirmed but native save still rejects the ended session; reads and core 2.2.1 health work. Do not block safe work with this local recovery copy.
- [ ] T1 — Rename auth `UserSession` and its file to `AuthSession` / `auth-session.entity.ts`, update imports/references and verify behavior remains unchanged. Route: delegated writer; multiple source/test files. Status: in progress; bounded mechanical rename authorized and delegated before behavioral integration.
- [ ] T2 — Adapt login/profile, guarded localStorage lifecycle, restoration, logout, serialized refresh/rotation and origin-scoped Bearer transport with regression tests. Route: delegated writer. Status: pending T1 verification.
- [ ] T3 — Integrate users and role catalog; remove age from domain/forms/fixtures, map pagination/errors and documented password operations where required by existing consumers. Route: delegated writer. Status: pending auth transport.
- [ ] T4 — Replace demo permission modeling/matrix with real dynamic catalog IDs and atomic assignments; preserve backend authorization and loading/error states. Route: delegated writer. Status: pending auth/catalog.
- [ ] T5 — Integrate session listing/revocation and real caller-relative current-session metadata. Route: delegated writer. Status: pending auth transport.
- [ ] T6 — Integrate audit queries/detail/pagination/totals and filtered CSV export with documented limits. Route: delegated writer. Status: pending auth transport.
- [ ] T7 — Run focused checks per unit, full suite/build at closure, update implemented/planned documentation and present human-staged work-unit snapshots for approval/native review. Route: writer self-checks and independent verifier as required by native assessment. Status: pending; no commit approval granted.

## Acceptance and checks

- T1 is a mechanical rename, with no meaningful behavioral RED. Existing tests, import/reference checks, formatting and production build establish unchanged behavior; do not invent a red test or alter runtime behavior.
- Behavior-changing units use observed RED, then GREEN and refactor checks. Use official Angular test target with Vitest and build; configured project is `real-maids-frontend`, Angular 22.
- Run workspace-local Prettier write/check on exactly touched files before final checks; `git diff --check` must pass.
- Never access browser storage or establish shared credentials during SSR. Reject malformed/expired storage. Never leak credentials to unrelated origins, retries or error messages. Prevent late responses after logout/newer login and parallel refresh reuse.
- Preserve repository/source separation, `useExisting`, accessible consumers and explicit implemented/demo boundaries. Do not claim endpoints tested from OpenAPI alone.
- No staging of code/tests/configuration, commit, push or PR without separate human snapshot/message approval. Keep checkboxes open until outcome, checks and work-unit commit exist.

## Progress, delivery and recovery

Baseline HEAD: `b1c3b758ce893ad6f8740c5fefa1fb8b0811db73`; initial Git status clean. Chosen route: delegated direct, one writer at a time. Provisional forecast: 800–1,600 authored changed lines including tests/docs across separate units; not a cap and not permission to compress or omit tests. Delivery strategy: ask-on-risk; no PR or chain decision requested yet. T1 will be isolated from behavioral integration.

Engram mirror is pending: both native save and registration of the actual runtime session returned `session has already ended`. With approval, only the obsolete `npm:gentle-engram@0.1.16` declaration was removed from global Pi settings; `npm:gentle-engram` and all other settings were retained. The user confirmed reload, but a new native save still failed. Core `/health` reports 2.2.1 and memory reads remain available. Installed adapter 0.2.0 supports a server-selected continuation; the exact failed runtime mapping remains under diagnosis. Session summaries do not close sessions, and package duplication is not proven causal. Do not modify stored rows, invent IDs or claim persistence succeeded. Continue safe implementation with this local recovery copy while the incident is diagnosed separately.

Verification and commits: none for this feature yet. Production HTTPS origin, authenticated live contract behavior and exhaustive browser acceptance remain unverified.

## Next step

Delegate the bounded auth model/file rename, then read its checks and diff before proceeding to auth behavior changes. Rollback T1 by restoring only the auth model name/file and its imports; IAM session records and behavior are unaffected.
