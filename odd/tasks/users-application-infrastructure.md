# Users application and demo infrastructure

## Objective and scope
Implement the five existing UserRepository actions for M02 / RF02 / HU02 with stateless use cases and a root-provided in-memory source. Add age to create/update parameters and rename auth.error.ts to user.error.ts as approved by the user. Preserve existing manual domain work.

No P03 screen, route, ACL, HTTP contract, credential persistence or production user management is included. The demo starts empty, assigns sequential numeric IDs and operation-time dates, and never stores passwords. Age validation and email uniqueness policy remain undefined: do not invent validation or enforce EMAIL_ALREADY_EXISTS solely because the error code exists.

## Tasks
- [ ] U1: Implement domain alignment, five use cases, demo source, DI binding and behavior tests. In progress; delegated writer required for multiple non-trivial files.
- [ ] U2: Update delivery documentation and verify build, tests and structural consistency. Pending; parent documentation and delegated command verification.
- [ ] U3: Obtain human staging and precise snapshot/message approval for a work-unit commit; native review pending. No commit authorization exists.

## Acceptance and checks
Observe RED before behavior implementation, GREEN after implementation, and run focused users/composition tests, full `npm test -- --watch=false`, and `npm run build`. Cover delegation/results, empty list, CRUD, missing users, timestamps/IDs, lazy observable mutation, defensive copies and shared DI instance. No new UI means browser interaction checks are not applicable. Test failures/unavailable runners must be recorded, not weakened.

## Delivery and progress
One cohesive repository capability plus tests; estimated 400–650 authored lines, advisory only. Delivery strategy: ask-on-risk before any code commit/PR; no delivery requested yet. Rollback boundary: users application/infrastructure and users-only domain/DI additions, with their tests/docs; preserve unrelated features.

Source review: five untracked users domain files, no tracked changes. Angular MCP unavailable; use workspace-local CLI. CodeGraph does not index the untracked users files. No tests or build observed yet.

## Next step
Delegate U1 within users feature and the two composition-root files. Do not stage or commit code. Tasks remain open until their checks and authorized commit exist.
