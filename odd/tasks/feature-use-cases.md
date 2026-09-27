# Feature use cases and domain errors

## Objective

Make application operations explicit use cases and keep feature error types in domain, for the existing auth and customers features and for future features.

## Problem and rationale

`AuthService` and `CustomerService` each group multiple operations, while domain repository ports import error types from application. This obscures application intents and reverses the intended domain dependency direction.

## Scope and constraints

- Authorized scope: auth and customers feature code, their tests, architecture/contributor documentation, and related ADRs.
- Preserve demo behavior, repository contracts, routes, and the in-memory session model; do not invent backend DTOs or endpoints.
- Use one `*UseCase` with `execute()` per operation; define feature errors under `domain/errors`.
- Effective TDD mode: not configured/enabled in this repository or session; use ordinary focused and full checks. Runner: `npm test -- --watch=false` (Angular test target with Vitest).
- Route: delegated writer for multi-file implementation; graph/document mapping was delegated before writing.
- Delivery strategy: `ask-on-risk`; user chose `stacked-to-main` (PRs merge to main in order).
- Forecast: approximately 450 authored changed lines across renames, tests, and documentation; this is advisory, not a code-size target.

## Tasks

- [x] T1 — Refactor auth errors and login/logout application services into separate use cases; update consumers, tests, and the durable convention in contributor docs and ADRs. Route: delegated; multi-file logic, test, and documentation updates. Acceptance: no auth domain import from application; login/logout behavior and auth tests pass; future feature rule is documented. Evidence: `fbe0db6`; 25/25 Vitest tests passed, production build passed, `git diff --check` passed, independent read-only behavior review passed. Runtime boundary: N/A, pure refactor of the existing in-memory demo. Rollback boundary: auth feature refactor and matching documentation in `fbe0db6`.
- [x] T2 — Refactor customers errors and list/get application services into separate use cases; update imports, tests, and project status/traceability debt notes. Route: delegated; multi-file logic, test, and documentation updates. Acceptance: no customers domain import from application; customer tests pass; docs agree with the completed refactor. Evidence: `126d3e9`; 25/25 Vitest tests passed in 10 files, production build passed, `git diff --check` passed, independent read-only behavior review passed. Runtime boundary: N/A, pure refactor of existing in-memory customer queries. Rollback boundary: customers feature refactor and matching documentation in `126d3e9`.

## Verification and progress

- Baseline: Angular build and 25 Vitest tests in 8 files passed before the refactor.
- T1: 231 authored changed lines (158 additions + 73 deletions), plus task-evidence commit `9548333`; PR 1 contains `fbe0db6` and `9548333`. Native RDD remained off, so no receipt was requested.
- T2: 151 authored changed lines (96 additions + 55 deletions), PR 2 work-unit commit `126d3e9`. Native assessment was unavailable because the sandbox denied its temporary Git-index file; no risk tier or receipt is claimed.
- Required at closure: focused feature tests, full Angular test target, production build, import/path search, and `git diff --check`.
- Native review mode: clone-local status reported off; authority-path ownership warning was also reported, so no review receipt may be claimed.
- PR slices: PR 1 = T1 (auth and convention) on `codex/feature-use-cases`; PR 2 = T2 (customers and status) on `codex/customers-use-cases`. PR 2 must be rebased onto `main` after PR 1 merges so that each PR targets `main` with only its own work-unit diff. No PR creation or merge is authorized yet.
- Next step: review local branches, then create and merge PR 1 before preparing PR 2. Push, PR creation, rebase, and merge remain user-owned decisions.
