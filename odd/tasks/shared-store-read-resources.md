# Shared store read resources

Extract reusable read coordination and migrate the IAM stores without changing their behavior.
Branch: `refactor/shared-store-read-resources`; delivery: feature-branch-chain (no publishing); runner: Angular test target / Vitest.

## Specs

- S1: "quiero replicar la refactorizacion que hemos hecho para roles store en los demás stores"
- S2: "y tamb es necesario mover esta refactorizacion fuera del feature users, porque se usará para más stores después."
- S3: "Al final de todo el trabajo explicame el codigo de los store para entenderlo bien"
- S4: "ok perfecto hazlo" — approval of the conversation's technical plan: neutral shared read coordination; auth-owned session scope; Roles/RBAC/Audit/User/UserSessions migration with unchanged contracts, TTL, mutation and observer policies; AuthStore/CustomersStore unchanged; tests, documentation and final explanation.

## Tasks

- T1 [S2,S4] delegated + parent integration — done (independent recheck PASS37; native review tracked in T5) — Extract helpers, add policy tests and preserve Roles behavior. Risk: item 4 (flight coordination). Commit: `9597a0915fac1aa3ba4edb6cb1b90d0ad357dcf0` (native approved/acknowledged).
- T2 [S1,S4] delegated — done (independent PASS27+22TTL; full seam PASS1083; native routing tracked in T5) — Migrate RBAC/Audit read resources and session scope, preserving domain/retention/result policies. Risk: item 2 (session fencing), item 4 (concurrency). Commit: pending.
- T3 [S1,S4] delegated + parent verification — done (independent PASS42; full seam PASS1083; native routing tracked in T5) — Migrate User read resources and session scope, preserving keyed admission/observers/statistics. Risk: item 2 (session fencing), item 4 (concurrency). Commit: `be8b3a80e231a921a7548c387d831b5e6694c772` (native medium, reviewDue false).
- T4 [S1,S4] delegated + parent seam — done (independent PASS47; full seam PASS1083; native routing tracked in T5) — Migrate UserSessions read resources and scope, preserving owner/count/detail invalidation. Risk: item 2 (session fencing), item 4 (concurrency). Commit: `1706b7984857beed1b6b466c59690af4409b25bf` (native medium, reviewDue false).
- T5 [S1-S4] inline — pending — Integrate documentation, run full tests/build/formatting, independent verification and applicable native reviews; explain the code. Commit: pending.

## Log

- L17 Sessions unit `1706b7984857beed1b6b466c59690af4409b25bf`,795 authored lines; native medium reviewDue=false/under_budget, independent PASS47 already satisfies escalation. RBAC/Audit unit next; source implementation of all migrations complete and independent proof PASS. Parent docs now explain ownership and read path; no component/endpoints/provider/store-lifetime changes.

- L16 User unit `be8b3a80e231a921a7548c387d831b5e6694c772`,452 authored lines. Native assessment medium; concurrency escalation retains independent proof requirement (already PASS42), reviewDue=false/under_budget so no native START for this unit. Session unit next, keeping its tests/docs with behavior.

- L15 Foundation9597a09 native high review-b2a0a7a0199a42a2 passed4 lenses; exact acknowledgement completed, authority burned. T2 independent PASS27 focused+22TTL tests. Parent full seam `npx --no-install ng test --watch=false` PASS79files/1083tests; `npx --no-install ng build` PASS, prerendered1route, existing initial620.53kB exceeds warning500kB. `git diff --check` PASS. No browser/live-backend acceptance claimed (no UI/transport changes). Unit native routing still pending for migrations.

- L14 Original T1 blocker resolved: targeted independent recheck PASS3files/37tests in isolated candidate, no stale delivery/dispatch during init/replacement/destruction; legitimate replacement reads resume. T1 source/checks complete. Foundation work-unit commit comes first; native review takes only that committed range, ignoring parallel worktree edits.

- L13 T3 independent isolated verification PASS:3 files/42 tests with exact target. No T3 blockers; verified keyed admission,force joins/refcount,caller settlement,effective pagination,mutation fan-out/stale freshness,session/SSR. Shared scope blocker stays separate. Parent holds documentation migration statements with each corresponding commit so earlier work units remain truthful on their own.

- L12 T4 independent isolated verification PASS: exact approved sessions/store+owners+TTL+selector target passed4 files/47 tests. No candidate-caused blockers. Checked zero/empty verification, stale feedback, refcount/force joins, lazy batch dedup,20inactive pins,effective paging/clamp, mutation revision and session fencing/SSR. T1 shared reentry blocker remains separate and targeted. T4 ready for work-unit commit after foundation closure; final seam/build/native review still pending.

- L11 T1 correction completed: actual RED reproduced old-role delivery during replacement, nested admission and teardown NG0205; checking/transition-depth/closed guards added without public API change. GREEN37 tests (3files), post-format GREEN37 and Prettier pass. Bugfix observation376 saved by worker. Original verifier resumed for original blocker only; no new sweep. Foundation not marked complete until targeted proof returns.

- L10 T3 completed source migration;42 tests in3 files pass, Prettier write/check pass. Added6 query contracts plus caller-visible statistics settlement regression; caught/fixed settlement and synchronous failure batch duplication while refactoring. Shared adapters keep only root writable state. Parent assess escalates concurrency, independent T3 verifier launched on baseline+foundation+T3 overlay. Angular MCP unavailable to writer, local official target used. No commit yet.

- L9 T1 correction tests added but original RED run blocked by foreign RBAC compile errors, implementation unchanged; RBAC worker subsequently restored defined public success typing. Resume the same correction to obtain actual RED/GREEN. T4 independent verifier launched on isolated baseline+foundation+T4 overlay to avoid cross-writer compilation interference. No migration task closed yet.

- L8 T4 writer returned partial: migrated owners/count/details, 16 regression cases added (22 total); intermediate 17 passed, final22 blocked by concurrent RBAC return-type compile errors, not own diagnostics. Formatting/diff checks pass. Parent will run stabilized sessions+owners+TTL suite and independent verification. API regression notification sent to T2; no consumer edits authorized. Worker memory unavailable, parent records evidence here.

- L7 Independent T1 verifier passed isolated 34-test command but found a session-fencing blocker: session key/generation changes before cancel notifications and reset; synchronous completion can reenter a read and obtain the previous session's fresh cache. Destruction has the same cancel-before-reset exposure. Reopen T1; one bounded correction must reproduce this publicly, prevent reads during transition/destruction and preserve reset/cancel semantics; targeted recheck only afterward. This is within approved session-isolation scope, not a product change.

- L6 Parent focused check passed (3 files/34 tests) plus Prettier write/check. Source extraction complete; independent foundation verifier mvwn1ftz-3-tnls remains in flight and its proof belongs to T5. T2/T3/T4 are disjoint migrations launched together after the shared API stabilized; visible todo groups them into one active stage to preserve one active item. No unit will be committed/reviewed before its required verification.

- L1 User request: "quiero replicar la refactorizacion que hemos hecho para roles store en los demás stores, y tamb es necesario mover esta refactorizacion fuera del feature users, porque se usará para más stores después. Al final de todo el trabajo explicame el codigo de los store para entenderlo bien"
- L2 User approval: "ok perfecto hazlo".
- L3 Read-only findings: shared coordinator must not import feature code. Session scope belongs to Auth. Roles replaces forced reads; User joins them. Roles invalidation detaches; User invalidation cancels. Keep those policies explicit rather than standardizing behavior. Keyed retention/admission and mutations stay local. Existing project guidance links RNF09/RNF10/RNF12 and M02/RF02/HU02/P03 to these boundaries.
- L5 T1 writer returned partial only because deleting obsolete originals is forbidden to the worker. Focused RED observed for three policy cases, final GREEN 3 files/34 tests; prettier write/check passed. Parent removed the four originals after confirming no remaining imports. Independent verification pending. Shared API adds join/replace force policy, cancelOnInvalidate, obsoleteResult, per-read factory, pendingReads/isPending. Native assessment requires explicit untracked selection; no review started.
- L4 Base: c554486781f7f640e117ca84e4438b26e7eb38fd. Working tree clean at implementation start (earlier AGENTS modification no longer present). Native review mode on globally. Forecast: approximately 2000-3500 authored changed lines, coherent migration commits rather than artificial size splitting. User selected feature/tracker branch chain in the delivery questionnaire; no push/PR authorized.
