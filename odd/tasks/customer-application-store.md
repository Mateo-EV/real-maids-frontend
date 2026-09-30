# Customer application and presentation store

## Objective

Complete the in-memory customer application actions and expose their presentation state through an NgRx SignalStore, without adding a page, route, or REST integration.

## Scope and constraints

- Extend M03 with create, update, and delete use cases using the existing repository contract.
- Add a customers feature store consuming the five customer use cases.
- Include focused tests and reconcile status, architecture, and traceability documentation.
- Keep P04 classified as a skeleton until it has a routed screen and real integration.
- Do not modify authentication or establish backend DTO, authorization, or persistence rules.
- Effective TDD: not enabled in the existing project task context; ordinary verification with Angular's Vitest target.
- Route: delegated direct because application and presentation logic plus tests/docs require multiple non-trivial files.
- Delivery: stay on the current branch for this STANDARD task; no remote operation is authorized.

## Tasks

- [x] T1 — Implement the three missing customer mutation use cases and their focused tests. Each delegates to the matching repository operation and preserves Result/Observable semantics.
- [x] T2 — Implement CustomersStore with list, selection, mutation, and explicit asynchronous state; add focused tests. The store consumes use cases and represents loading, empty, error, and success without a UI route. It defers work until subscription, clears loading on cancellation, and rejects stale catalog responses after mutations.
- [x] T3 — Reconcile M03 documentation and verify relevant tests, build, and diff integrity. Documentation distinguishes the new internal capability from a completed P04 screen or REST integration.

## Progress

- Baseline: customer repository and in-memory source support five operations; application has list and lookup use cases only; there is no customers presentation layer.
- Verification: focused store spec 6/6; full `npm test -- --watch=false` 14 files/40 tests passed; `npm run build` passed; `git diff --check` passed (worker and parent spot check). Independent read-only verification found observable timing and overlap bugs; one bounded correction fixed them before final checks.
- RDD: clone-local mode is off; native assessment was unassessable because untracked files require an inventory declaration, so no review receipt is claimed.
- No commit, push, or PR was created; work remains local on `main` under this STANDARD task's current-branch policy.
- Runtime scenario: no customer route or page exists; store and in-memory boundary are exercised by unit tests.
- Rollback boundary: new customer mutation use cases and tests, the customers presentation store and test, M03 documentation changes, and this task record.
- Next step: connect a customer page and backend only under a separate authorized scope with real API evidence.
