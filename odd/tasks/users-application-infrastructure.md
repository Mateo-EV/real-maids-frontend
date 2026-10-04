# Users application and demo infrastructure

## Objective and scope

Implement the five existing UserRepository actions for M02 / RF02 / HU02 with stateless use cases and a root-provided in-memory source. Add age to create/update parameters and rename auth.error.ts to user.error.ts as approved by the user. Preserve existing manual domain work.

No P03 screen, route, ACL, HTTP contract, credential persistence or production user management is included. The demo starts empty, assigns sequential numeric IDs and operation-time dates, and never stores passwords. Age validation and email uniqueness policy remain undefined: do not invent validation or enforce EMAIL_ALREADY_EXISTS solely because the error code exists.

## Tasks

- [x] U1: Implement domain alignment, five use cases, demo source, DI binding and behavior tests. Delegated writer; verified and committed in 9bf70787ebd92a6ca6992d5d357428d45d1fd420.
- [x] U2: Update delivery documentation and verify build, tests and structural consistency. Independent verifier confirmed 32 focused and 109 full tests, successful build and whitespace check; README/product guide committed in f389e3b.
- [x] U3: Obtain human staging and precise snapshot/message approval for a work-unit commit. User approved the exact staged diff and message; HEAD/index rechecked unchanged before commit. Native review explicitly declined for this candidate through the interactive host; no approved receipt claimed.

## Acceptance and checks

Observe RED before behavior implementation, GREEN after implementation, and run focused users/composition tests, full `npm test -- --watch=false`, and `npm run build`. Cover delegation/results, empty list, CRUD, missing users, timestamps/IDs, lazy observable mutation, defensive copies and shared DI instance. No new UI means browser interaction checks are not applicable. Test failures/unavailable runners must be recorded, not weakened.

## Delivery and progress

One cohesive repository capability plus tests; estimated 400–650 authored lines, advisory only. Committed as one cohesive 546-line work unit following exact human snapshot/message approval; no PR or push authorized. PR slicing remains a decision before publication. Rollback boundary: users application/infrastructure and users-only domain/DI additions, with their tests/docs; preserve unrelated features.

Source review: five untracked users domain files, no tracked changes. Angular MCP unavailable; use workspace-local CLI. CodeGraph does not index the untracked users files. Writer observed RED compilation failure on missing APIs/age (zero tests executed), then GREEN 32 focused tests across 3 files, full suite 109 tests across 19 files, successful build (one prerendered route) and git diff --check. No runtime RED assertion claimed. Initial native assess was unassessable due untracked scope; after human staging, assessment was high risk. Host declined native review for target sha256:e0bd6a2c0709d0131baad2b60f58a2ac4a2580ee2e623e50d17f9abda88a82ff without creating a lineage. Required independent verifier passed the same four commands. LF/CRLF warnings only. Code committed in 9bf70787ebd92a6ca6992d5d357428d45d1fd420; observed clean worktree immediately after code commit.

## Next step

No further implementation pending in this scope. Push/PR, P03, real credential/backend integration and validation rules require separate authorization. Documentation commits 7a77e23 and f389e3b do not substitute for the approved implementation commit.
