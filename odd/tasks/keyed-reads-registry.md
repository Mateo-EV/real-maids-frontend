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

## Tasks

- [x] T1 — Add the shared keyed read registry and its state adapter helper with their own focused specs. Linked: S1, S3. Route: bounded writer. Surfaces: `src/app/shared/state/keyed-reads.ts`, `src/app/shared/state/keyed-reads.spec.ts`. Commit `d4c2075`; registry 309 lines, 14/14 specs reproduced by the parent (L10).
- [x] T2 — Migrate `customer-acquisition.store.ts` to the registry, preserving its public API and behavior; keep its existing spec green. Linked: S1, S2, S4. Route: bounded writer, after T1. Surfaces: `src/app/features/customers/presentation/state/customer-acquisition.store.ts`, `src/app/features/customers/presentation/state/customer-acquisition.store.spec.ts`. Commit `cb7f572`; store 493 -> 329 lines with a byte-identical spec (L11).
- [x] T3 — Run formatting, focused and full verification; record exact evidence and any deviation. Linked: S5. Route: parent with re-run of reported commands, plus independent verifier because the Risk line names high-risk items. Partial by environment: the full suite is unreachable (L12); directed verification passed (L10, L11, L13).
- [x] T4 — Commit the work units and report the stage-1 outcome with the explicit list of stores not yet migrated. Linked: S2, S5. Route: parent. Stage-2/3 stores remain explicitly unmigrated (L13).

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
