# Customer in-memory CRUD

## Objective

Add create, update, and delete operations to the existing customer repository contract and in-memory adapter without adding application use cases or UI.

## Problem and rationale

The customer repository and demo source currently support only list and lookup. The user wants a small, testable in-memory mutation seam before backend integration.

## Scope and constraints

- Authorized: customer domain repository contract, customer infrastructure repository/source, focused tests, and status/traceability documentation.
- Excluded: new application use cases, routes, pages, HTTP integration, persistence, and backend DTO assumptions.
- The in-memory source generates IDs for created customers and returns the created record.
- Preserve existing `Observable<Result<..., CustomerError>>` conventions. For the temporary demo, update replaces an existing customer by ID; update/delete of a missing ID return `CUSTOMER_NOT_FOUND`. No email uniqueness rule is introduced without a product contract.
- Effective TDD: no explicit enabled mode found in project/session configuration; use ordinary tests. Runner: `npm test -- --watch=false` (Angular unit-test target with Vitest).
- Route: delegated writer because the contract, adapter, source, tests, and docs are multiple non-trivial files. The mapping was delegated before writing.
- Delivery: one local work-unit commit on `codex/customer-memory-crud`; push and PR are separate user decisions. Forecast: approximately 200-300 authored changed lines, advisory only.

## Task

- [ ] T1 — Add repository CRUD methods, source-owned ID generation and isolated mutable in-memory state, focused success/missing-ID tests, and accurate M03 documentation. Acceptance: create returns an ID-bearing customer; subsequent reads reflect create/update/delete; missing update/delete return the established not-found error; no new application layer; full tests/build pass. Evidence: pending.

## Verification and progress

- Planned checks: focused customer tests, full `npm test -- --watch=false`, `npm run build`, `git diff --check`, and a search for accidental application-layer additions.
- Runtime scenario: N/A for UI; direct repository/source tests exercise the in-memory boundary.
- RDD status reported off with a local authority-path ownership warning; no review receipt is claimed.
- Existing untracked `.atl/` is outside this task and must remain untouched.
- Next step: implement T1.
