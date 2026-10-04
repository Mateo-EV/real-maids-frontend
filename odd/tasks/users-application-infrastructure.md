# Users application and demo infrastructure

## Objective and scope
Implement the five existing UserRepository actions for M02 / RF02 / HU02 with stateless use cases and a root-provided in-memory source. Add age to create/update parameters and rename auth.error.ts to user.error.ts as approved by the user. Preserve existing manual domain work.

No P03 screen, route, ACL, HTTP contract, credential persistence or production user management is included. The demo starts empty, assigns sequential numeric IDs and operation-time dates, and never stores passwords. Age validation and email uniqueness policy remain undefined: do not invent validation or enforce EMAIL_ALREADY_EXISTS solely because the error code exists.

## Tasks
- [ ] U1: Implement domain alignment, five use cases, demo source, DI binding and behavior tests. Implementation and writer checks verified; pending human-approved code commit. Delegated writer used for multiple non-trivial files.
- [ ] U2: Update delivery documentation and verify build, tests and structural consistency. In progress; parent updated README/product delivery boundaries; independent command verification running.
- [ ] U3: Obtain human staging and precise snapshot/message approval for a work-unit commit; native review pending. No commit authorization exists.

## Acceptance and checks
Observe RED before behavior implementation, GREEN after implementation, and run focused users/composition tests, full `npm test -- --watch=false`, and `npm run build`. Cover delegation/results, empty list, CRUD, missing users, timestamps/IDs, lazy observable mutation, defensive copies and shared DI instance. No new UI means browser interaction checks are not applicable. Test failures/unavailable runners must be recorded, not weakened.

## Delivery and progress
One cohesive repository capability plus tests; estimated 400–650 authored lines, advisory only. Delivery strategy: ask-on-risk before any code commit/PR; no delivery requested yet. Rollback boundary: users application/infrastructure and users-only domain/DI additions, with their tests/docs; preserve unrelated features.

Source review: five untracked users domain files, no tracked changes. Angular MCP unavailable; use workspace-local CLI. CodeGraph does not index the untracked users files. Writer observed RED compilation failure on missing APIs/age (zero tests executed), then GREEN 32 focused tests across 3 files, full suite 109 tests across 19 files, successful build (one prerendered route) and git diff --check. No runtime RED assertion claimed. Native assess returned unassessable because untracked scope is undeclared; independent verifier launched. Code remains untracked/unstaged.

## Next step
Await independent verifier results, then report verification and request human staging if a code commit is desired. Task-document-only commit: 7a77e23258cb5bdb22dc8677982035aab180269b; it does not approve or close implementation. Do not stage or commit code. Tasks remain open until their checks and authorized commit exist.
