# Keyed read registry — shared coordination for query-keyed store reads

Objective: extract the coordination currently duplicated across the query-keyed stores (per-key read resources, entry history, pinning, admission, observation fan-out and mutation refresh) into one shared registry over the existing `createReadResource`, leaving each store responsible only for its domain data, key identity and writes.
Branch: `feature/keyed-reads-registry`. Delivery: local reviewable work-unit commits on the feature branch only; no push/PR. Runner: Angular `test` target with Vitest. CI and Playwright stay untouched.

## Specs

### S1 — Extract the coordination, keep the domain in the consumer

The user said: “tu ves viable poder crear una forma asi como tankstack query, de poder sacar toda la logica compleja de cancelaciones, validaciones, scopes, etc, y poder abstraerla de forma que nos centremos en los datos que se guardan en keys, y en las modificaciones”.

Add one shared registry that owns, per cache key: read-resource coordination, success-only freshness, entry history bounds with active-view pinning, admission, shared in-flight requests, observation fan-out and mutation refresh batches. Keep outside it, owned by each consuming store: key identity and normalization, request factories (including any out-of-range clamp), DTO and owner validation, write orchestration, `PARTIAL_UPDATE` semantics, cross-store invalidation and the public selector surface. Do not change HTTP contracts, backend calls, auth, storage, dependencies or route composition.

### S2 — Authorize the paper design as the boundary

The user said: “ok sigamos con la opcion 1”, accepting the design-only option: the registry API is agreed before any code, and implementation proceeds in stages. This delivery is stage 1 only: the shared registry plus exactly one migrated store. Do not migrate the remaining stores, do not delete the old duplicated logic elsewhere, and stop after the single proof-of-concept consumer with its evidence.

### S3 — Unified admission semantics

The user said: “ok perfecot unificamos la admisión”. The registry has exactly one admission behavior: when the entry cap is reached and no entry can be evicted, it returns a failed `Result` carrying the store-supplied `overflow()` error. It never throws and has no compatibility throw option. The proof-of-concept consumer already returns a `Result` conflict, so no existing spec expectation changes in stage 1.

### S4 — Preserve observable behavior of the migrated store

The migrated store must keep its existing public read API, TTLs, entry caps, pinning, admission outcomes, cancellation, session fencing, refresh targeting and shared-flight behavior. Its existing specs must keep passing without weakening assertions; a spec may change only for an assertion that pins the internal mechanism this task replaces, and that change must be reported with its reason. Do not add tests that reference `read-resource` internals the consumer does not own.

### S5 — Verify honestly and report

Run workspace-local Prettier on changed files, the focused registry and consumer specs, and the full unit suite. Report exact commands and observed outcomes, including any failure. Do not claim live backend, CORS, browser or native review evidence.

### S6 — Close the registry's own test gaps

The user said: “ok vamos con c y b”, accepting option (c) as the first step. Add registry specs for: isolated `reset()`, `initialData` placeholder versus verified data, a filter-targeted `markMutated` that invalidates an inactive entry without refreshing it, static `select()`, `selectReactive` without `state.source`, and `keys`. Additive only: no production change to `keyed-reads.ts` unless a test proves the current behavior wrong, in which case the deviation is reported instead of silently fixed.

### S7 — Migrate the three clone stores

The user said: “ok vamos con c y b”, accepting option (b) as the second step. Migrate `service-requests.store.ts`, `service-orders.store.ts` and `field-staff.store.ts` to the registry, each with its existing spec byte-identical and its TTL, entry cap, admission outcome, no-session outcome, shared flights, session fencing and mutation targeting preserved. `agenda.store.ts` stays out of scope as page-owned. An additive registry hook is allowed only if a migrated store's no-session outcome differs from its admission error; the single admission semantic of S3 does not change.

### S8 — Local merge to main

The user said: “mergeas al main”. Merge the feature branch into `main` locally once S6 and S7 are committed and verified. No push, no pull request, no tag.

### S9 — Then the IAM group

The user said: “y luego vamos por b y a”. After the merge, continue with the four IAM stores: `user.store.ts`, `user-sessions.store.ts`, `rbac.store.ts` and `audit-logs.store.ts`. `roles.store.ts` and `agenda.store.ts` remain out of scope.

## Tasks

- [x] T1 — Add the shared keyed read registry and its state adapter helper with their own focused specs. Linked: S1, S3. Route: bounded writer. Surfaces: `src/app/shared/state/keyed-reads.ts`, `src/app/shared/state/keyed-reads.spec.ts`. Commit `d4c2075`; registry 309 lines, 14/14 specs reproduced by the parent (L10).
- [x] T2 — Migrate `customer-acquisition.store.ts` to the registry, preserving its public API and behavior; keep its existing spec green. Linked: S1, S2, S4. Route: bounded writer, after T1. Surfaces: `src/app/features/customers/presentation/state/customer-acquisition.store.ts`, `src/app/features/customers/presentation/state/customer-acquisition.store.spec.ts`. Commit `cb7f572`; store 493 -> 329 lines with a byte-identical spec (L11).
- [x] T3 — Run formatting, focused and full verification; record exact evidence and any deviation. Linked: S5. Route: parent with re-run of reported commands, plus independent verifier because the Risk line names high-risk items. Partial by environment: the full suite is unreachable (L12); directed verification passed (L10, L11, L13).
- [x] T4 — Commit the work units and report the stage-1 outcome with the explicit list of stores not yet migrated. Linked: S2, S5. Route: parent. Stage-2/3 stores remain explicitly unmigrated (L13).
- [x] T5 — Add the missing registry specs. Linked: S6. Route: bounded writer that died mid-flight; the parent finished and corrected two of its assertions (L17). Commit `c4e6549`; 23/23.
- [x] T6 — Map the three clone stores' read contracts before handoff. Linked: S7. Route: bounded explorer, read-only.
- [x] T7 — Migrate `service-requests.store.ts`. Linked: S7. Route: bounded writer that died after editing; the parent fixed the mangled rxjs import and verified (L18). Commit `5c2f04d`; 437 → 339, spec 16/16 untouched.
- [x] T8 — Migrate `service-orders.store.ts`. Linked: S7. Route: parent inline after two writers died untouched. Commit `1888313`; 475 → 352, spec 25/25 and manual 44/44 untouched.
- [x] T9 — Migrate `field-staff.store.ts`. Linked: S7. Route: parent inline after the writer died. Commit `7fef925`; 213 → 139, spec 21/21 untouched.
- [x] T10 — Format, focused and full verification for S6 and S7. Linked: S5, S6, S7. Route: parent with command re-run. Focused and consumer specs green; the full suite and the operations group run are unreachable (L12, L18).
- [ ] T11 — Merge the feature branch into `main` locally, without push. Linked: S8. Route: parent, after T10.
- [ ] T12 — Map and migrate the four IAM stores. Linked: S9. Route: explorer, then bounded writers.

## Log

### L1 — Original user request (verbatim)

“quiero entender la logica de los stores por favor me gustaría que me la epliques para entender cada linea de código”

### L2 — Scope narrowing (verbatim)

“quiero primero users”

### L3 — Diagram request (verbatim)

“me puedes hacer un diagrama de como se ve el codigo para aprenderlo más fácil?”

### L4 — Abstraction proposal (verbatim)

“tu ves viable poder crear una forma asi como tankstack query, de poder sacar toda la logica compleja de cancelaciones, validaciones, scopes, etc, y poder abstraerla de forma que nos centremos en los datos que se guardan en keys, y en las modificaciones”

### L5 — Design option accepted (verbatim)

“ok sigamos con la opcion 1”

### L6 — Admission decision (verbatim)

“ok perfecot unificamos la admisión”

### L7 — Evidence gathered before the design

Read-only survey of the eight query-keyed stores confirmed what is genuinely shared and what diverges.

- Shared without exception: `forcePolicy: "join"`, `cancelOnInvalidate: true`, entry cap of 20 per family, active/pending pinning, and per-key mutation refresh batches shared with `shareReplay({ refCount: true })`. These are hardcoded in the registry, not options.
- Divergent: admission outcome (`throw` in users/customers, `CONFLICT` in acquisition, `UNAVAILABLE` in operations/staff); behavior with no session (`EMPTY` in users, failed `Result` in operations); selector shape (signal projection vs snapshot); TTL (none / 30000 / 120000, mixed inside one store); `initialData` (none / `0` / empty page / empty array); post-success handling (effective paging adoption, one-clamp recovery, owner validation, or none).
- Stores compose several independent read families: users (queries + statistics singleton), sessions (owners + count + per-user details), acquisition (two catalogs + leads + lead + follow-ups), staff (directory + ID profile + own profile), orders and requests (list + detail).
- `agenda.store.ts` is deliberately page-owned with no TTL or shared cache; it is out of scope and stays as is.
- Runtime evidence: the six largest query-keyed stores total ~2800 lines, and the estimated reduction from adopting the registry is ~1700 lines, at the cost of ~470 new centralized lines.

### L8 — Registered threat to the abstraction

Three divergences were identified as the real risk to a single registry: admission semantics, refresh coordination (broad vs targeted vs cross-store), and result lifecycle beyond caching (effective pagination, clamp, owner validation, and the distinction between a placeholder `initialData` and verified data). The design keeps the first and third partly in the consumer: `overflow()` supplies the admission error, `request()` keeps the clamp and validation, `adopt()` records effective paging without changing cache identity, and `loaded` semantics stay in each store's state adapter.

### L9 — Decision recorded before implementation

Stage 1 is the registry plus one migrated store (`customer-acquisition.store.ts`, the largest consumer with three keyed families and mixed TTLs). Remaining stores are stage 2 (IAM) and stage 3 (operations) and are explicitly not authorized here. `docs/architecture/keyed-reads.md` was offered and not authorized; no documentation file is created by this delivery.

### L10 — T1 delivered and reproduced by the parent

Registry: `src/app/shared/state/keyed-reads.ts` (309 lines) plus 14 focused specs. The writer observed RED as a build failure before the module existed, then 14/14. The parent re-ran `npx --no-install ng test --watch=false --include=src/app/shared/state/keyed-reads.spec.ts` and reproduced 1 file / 14 tests passed, exit 0, 29s.

Three deviations from the paper design were accepted: an optional `source()` on `keyedState` so `selectReactive` can track entry changes; `noSession: "failure"` reusing `overflow()` for lack of a better hook; and a failed refresh retaining the previous `expires` rather than zeroing it, which matches this store's pre-migration behavior.

### L11 — T2 delivered with a byte-identical spec

Migration captured a baseline before editing (15/15) and finished with the same 15/15 plus 160/160 across the five consumer specs. `git diff` on `customer-acquisition.store.spec.ts` is empty, so every pre-existing expectation is proof of preserved behavior rather than a rewritten assertion. `tsc -p tsconfig.app.json --noEmit` exited 0, proving consumers outside the allowed surfaces still type-check. The parent re-ran the store spec and reproduced 15/15.

The writer did not use `selectReactive`/`keyedState`'s `source`: consumers read `data`/`loaded`/`pendingReads`, and the registry exposes `result`, so selectors stay direct reactive projections of the store. Accepted, with the consequence recorded in L13.

### L12 — The full suite is unreachable in this environment

Four attempts failed with OS-level allocation errors, not test failures:

| Attempt                                                   | Result                                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `ng test --watch=false`                                   | `Fatal process out of memory: Worklist::Segment::Create`                                                         |
| same with `--max-old-space-size=8192`                     | `Committing semi space failed`, exit 134                                                                         |
| `--include=src/app/features/customers/**/*.spec.ts`, 6 GB | `NewArray Allocation failed` at 48 MB of a 6144 MB heap, exit 134                                                |
| eight sequential groups, 2 GB each                        | `Zone Allocation failed` in users, customers and operations; auth 8/11 and field-operations 7/10 aborted mid-run |

The failing heap never grew. Host state at the time: 17.1 GB total, 2.7 GB free, and 11 `node.exe` processes totalling about 1.9 GB. Process inspection showed all of them belong to the editor's language servers and the agent harness, not to abandoned test runs, so no orphan could be freed. Trimming the heap from 6 GB to 2 GB changed nothing, which rules out a JS-side leak in this candidate and points to the host denying the process memory.

Consequence: file counts from an aborted group are not failures. `8/11` means three files never executed, and it is recorded as unexecuted, never as green or red.

### L13 — Directed verification and stage-1 outcome

Reproduced by the parent: registry 14/14; migrated store 15/15; consumers 160/160 (`leads-page` 21, `lead-detail-page` 60, `lead-follow-ups` 19, `lead-conversion` 28, `lead-editor` 32); `tsc --noEmit` exit 0; Prettier clean on all three files. Groups that completed green: `shared` 9/9 files, `service-catalog` 5/5, `experiences` 3/3, plus the five consumer files above.

`invalidateLead` was diffed against `HEAD` and is equivalent: the previous code invalidated every page but only the written lead and follow-up key, refreshing active keys only, which is exactly `pages.markMutated()` plus a filtered `markMutated(entry => entry.query === id)`.

Outcome against the estimates: the store shrank by 164 lines rather than the projected 293, so the realistic saving is about 35% per store, not 60%, because adapters, catalog fallbacks and direct selectors consume the difference.

Open items carried forward, none of them blocking this stage: `selectReactive` and `keyedState`'s `source` have no production consumer yet; `noSession: "failure"` reuses the admission error, which needs a dedicated hook before stage 3; entry object identity changes for sibling keys on write, which is bounded recomputation and not a data defect; and the remaining six query-keyed stores are explicitly unmigrated.

Stage 1 is the registry plus one migrated store (`customer-acquisition.store.ts`, the largest consumer with three keyed families and mixed TTLs). Remaining stores are stage 2 (IAM) and stage 3 (operations) and are explicitly not authorized here. `docs/architecture/keyed-reads.md` was offered and not authorized; no documentation file is created by this delivery.

### L14 — Scope extended to (c), (b), the local merge and then (a)

“ok vamos con c y b, mergeas al main, y luego vamos por b y a”

Sequencing taken: (c) the registry test gaps, then (b) the three clone stores, then the local merge into `main`, then (a) the IAM group. The repeated “b” in the last clause is read as redundant, and the merge boundary sits after S6 and S7 so `main` receives the registry with four consumers instead of a half-migrated state. Push and pull request are not authorized. The stage-1-only restriction of S2 is superseded for S6–S9; the rest of S2 (no HTTP, auth, storage, dependency or route change) still holds.

### L15 — Stop after (b); the merge and (a) are deferred

“despues de que hagas b detente”

This supersedes the merge and IAM ordering of L14 for this cycle. Executed here: S6 (c) and S7 (b), committed as work units on `feature/keyed-reads-registry`. Not executed: S8 (local merge into `main`) and S9 (IAM), both requiring a new explicit request. The feature branch stays where it is, with no push.

### L16 — Incident: the field-staff writer died on host memory, and two additive hooks were required

The T9 writer (`field-staff.store.ts`) exited with code 134 before `agent_settled`. `git status` and `git diff --stat` on `src/app/features/field-operations` showed no modification at all, so the crash landed before its first edit and lost no work. Cause is the L12 host allocation failure, amplified by four concurrent heavy processes (one spec writer plus three store writers each building and running Angular tests). No orphaned process was left behind. Mitigation: field-staff is migrated inline by the parent and every focused test run is serialized from here; the remaining writers were not relaunched.

Migrating the three clone stores required two additive registry options, each forced by evidence rather than preference:

- No-session outcome is not uniform. `service-requests.store.ts:175` and `field-staff.store.ts:114` fail `UNAUTHENTICATED` on a direct read while their observation completes empty (`:246` and `:165`), and `service-orders.store.ts` completes empty on both (`:184`, `:257`). The single `noSession` value could not express that, so the registry gained `noSessionObserve` and `noSessionError`. The single admission semantic of S3 is unchanged.
- Freshness on failure is not uniform either. These three stores zero `expires` when a read fails (`field-staff.store.ts:130`), and `field-staff.store.spec.ts:171` pins `expires: 0` after a failed forced revalidation, while the migrated acquisition store retains the previous expiry. Without a hook that assertion would fail, so the registry gained `expireOnError`.

Both options are opt-in and default to the previous behavior, so the acquisition consumer and its untouched spec are unaffected.

### L17 — (c) closed at 23/23, with two writer tests corrected

The T5 writer was killed with the parent process after writing eight specs. Two of them asserted behavior the registry does not have, so both were corrected rather than forced green (S6: report, never silently fix):

- The `initialData` placeholder test failed because the registry accepts `initialData` but never surfaces it: `createReadResource` uses `initialData()` only inside `reset()` (`read-resource.ts:151`), while the registry exposes its own entry state, so `select()` can only ever return request-owned data. No consumer passes `initialData` today (acquisition omits it, field-staff and the operations clones pass `() => undefined`). The test was deleted instead of pinned, and the option is recorded here as dead surface: either remove it, or implement a verified-versus-placeholder distinction if a consumer ever needs a visible placeholder. Making `result` hold the placeholder would flip `loaded` for an unverified entry and change `refreshing` versus `loading`, so it is not a one-line fix and was not attempted under S6.
- The `selectReactive`-without-`source` test failed because the fallback projection reads `state.get()`, which is reactive whenever the consumer's state is signal-backed, so it tracks entry writes too. The documented contract is that only the query is followed when there is no source, so the test was rewritten over an inert state: entry writes do not invalidate the projection, and a query change resolves the already-stored entry.

Final focused evidence after the corrections: `npx --no-install ng test --watch=false --include=src/app/shared/state/keyed-reads.spec.ts` → 1 file, **23/23 passed**, exit 0. Prettier `--check` clean on the three touched source files. field-staff: **21/21 passed** with its spec file untouched, and `npx --no-install tsc -p tsconfig.app.json --noEmit` exit 0.

### L18 — (b) delivered: three stores migrated with every consumer spec untouched

Two more writer launches ended with “parent process terminated while task was in flight”, and the human reported blocking the harness by accident, which is consistent with the parent dying rather than with a test or code failure. One of them had already migrated `service-requests.store.ts` before dying but never compiled it: it had dropped `map` from the rxjs import while rewriting the registry region, which surfaced as `Cannot find name 'map'` and a cascade of `unknown` results in the write paths. The parent caught it with `tsc --noEmit` before running any test and restored the import; the store then type-checked and its spec passed. The second writer never touched `service-orders.store.ts`, so that migration was done inline by the parent.

Result of (b), measured against `c4e6549`:

| Store | Before | After | Consumer spec |
| --- | ---: | ---: | --- |
| `field-staff.store.ts` | 213 | 139 | 21/21, untouched |
| `service-requests.store.ts` | 437 | 339 | 16/16, untouched |
| `service-orders.store.ts` | 475 | 352 | 25/25, untouched |

Totals: 1125 → 830 lines (+219/−517), and `git diff --name-only c4e6549..HEAD -- "*store.spec.ts"` is empty, so all three consumer suites are byte-identical rather than rewritten. `service-orders-manual.store.spec.ts`, which pins the refresh batch that the registry replaced, also passes 44/44 untouched. `tsc --noEmit` exits 0 and Prettier `--check` is clean on all three stores.

One behavioral asymmetry worth recording: the local order registry did not run `admit` inside its `read`, only inside `observe`, because the public API exposes only observers. The shared registry admits in both paths. Nothing observable changes for the current public API, since only `observeOrders`/`observeOrder` reach it and they admit first, but a future direct read would now admit or refuse rather than reading a missing entry.

Consumer-level evidence, run one file per invocation because a folder-level group dies with the host allocation failure: `service-requests-order-invalidation` 11/11, `service-requests-update.store` 21/21, `service-orders-create.store` 24/24, `service-order-detail-page` 31/31, `service-requests-page` 21/21 and `staff-page` 24/24, all untouched and all green (132 tests). These cover the write targeting, the cross-store request invalidation and two consumer pages, which is where an extra `query` field on an entry or a changed invalidation seam would surface.

Still unverified, and not claimed: `ng test --include='src/app/features/operations/presentation/**/*.spec.ts'` died with the L12 memory failure and is recorded as unexecuted, not green or red; ten of the twenty specs that reference these stores were not run at all (`app.config`, `admin.routes`, both feature route specs, `staff-detail-page`, `service-request-editor`, `service-orders-page`, `service-request-detail-page`, `service-requests-cancel.store`, `service-requests-create.store`); the full unit suite remains unreachable on this host; and there is no native review, live backend, CORS or browser evidence for this stage.
