# Users visual mock and dynamic roles

## Goal
Deliver a screenshot-inspired responsive P03 demo using UserStore, with dynamic roles under users. User authorized a new branch; active branch is feat/users-management-ui. Preserve manual user.store.ts.

## Accepted scope
Full visual mock with Spanish screenshot copy, clearly labeled fictitious data. Roles are real in-memory demo state, not ACL: Role has numeric id, name, description, isActive and createdAt. Exactly one roleId per user; lastAccess is Date|null (never accessed). Prevent deletion of assigned roles; allow deactivation preserving assignments. Sessions, Roles/RBAC and Audit tabs are disabled. No backend, secure credentials, real sessions/audit/IP/entity integrations or production/security claims.

Mark all outside-store fixtures with FICTITIOUS DEMO DATA / TODO integration comments, isolated from stores. Use seeded demo fixtures deliberately via a demo initialization boundary, without changing repositories' empty defaults or claiming real login activity. Use actual role store data for assigned role display/filter/selection. Unsupported credential actions disabled. No permissions editing.

## Tasks
- [ ] UI1: Role domain/repository, five use cases, in-memory CRUD, RolesStore, user roleId/lastAccess and defensive copies, safe role-reference deletion, composition and regression tests. In progress, delegated multi-file writer.
- [ ] UI2: Screenshot visual page and route/navigation, mock fixtures and bootstrap, filters/pagination/forms/actions and responsive/a11y states. Pending, delegated UI writer after UI1 checks. Disabled future tabs; optional compact role catalog editor outside disabled RBAC tab.
- [ ] UI3: Independent verification, docs/current delivery boundaries and human staging/approved work-unit commits. Pending. No staging/code commits authorized.

## Acceptance and verification
Use Signal Forms and installed/generated Helm + Tailwind semantic tokens; no manual Helm copies. Before UI run npx ng generate @spartan-ng/cli:info --json. Angular MCP unavailable; local ng target.
Behavior changes use observed RED then GREEN/refactor, exact focused tests; full npm test -- --watch=false and npm run build. Cover CRUD/results, assigned-role deletion refusal, inactive role preservation, never-accessed users and Date isolation, store load/error/mutations, fixture repeat-navigation safety, filters/pagination, submit/loading/errors, routing guards and disabled tabs. Browser responsive/keyboard and Chrome/Edge/Firefox checks must be observed or reported unavailable, not invented. No E2E tooling choice implied.

## Delivery and evidence
Estimated 1000–1800 authored lines; advisory, do not code-golf or omit tests. Separate coherent domain/role and UI slices; ask-on-risk PR chain decision before publication/commit, no PR now. Human stages all code/tests/config and approves precise staged snapshot/message; eligible primary docs may be auto-committed separately. Source work remains open until verified and committed. Rollback boundaries: UI1 role/user extensions and tests; UI2 page/fixtures/routes/navigation and tests; preserve unrelated auth/customers.

Initial source: manual untracked user.store.ts; parent confirmed loadUsers loading/error flow exists (scout report incorrectly denied it); no tests/UI. Domain has no roleId/lastAccess. Main base ccfd9e4. No new checks observed yet.

## Next step
Delegate UI1 with narrow users/config/test surfaces and read task file first. Then generate only required missing Helm via official CLI during bounded UI writer. No push or PR authorized.
