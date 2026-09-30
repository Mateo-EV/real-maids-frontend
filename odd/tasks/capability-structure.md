# Capability and experience structure

## Objective and scope

User-approved recommendations 1/2: separate auth/customers from admin and remove pure forwarding repository classes (RNF09/RNF10). Preserve M01/P01 and M03 delivery boundaries, /login and /admin URLs/guards/redirects, SSR, source behavior, templates, demo filenames, root providers/stores and intentional Angular/RxJS domain coupling. No speculative roles, backend integration or historical-task rewrites.

## Work unit

One coherent refactor with tests/docs. After explicit user authorization, parent performed mechanical moves/deletions; gentle-ai-worker handled bounded edits, gentle-ai-verify independently checked. Rollback: capability/admin moves, routes, source interfaces/bindings, new tests and AGENTS.md together. About 100–200 substantive diff lines excluding pure renames. Delivery strategy ask-on-risk; no PR. Human stages and approves precise snapshot/message before commit. No staging/commit/branch/push authority granted.

## Tasks

- [ ] T1 (implemented and verified; commit pending): Features now under src/app/features/{auth,customers}; existing admin page/route under src/app/experiences/admin. Both forwarding repositories removed, sources implement unchanged contracts, root useExisting aliases. Eight regression tests; architecture guidance updated.
- [ ] T2 (verification passed; commit pending): Independent tests/build, route/DI checks, original-versus-moved source/template comparisons and docs checks passed.
- [ ] T3 (in progress): Await human review/staging, precise snapshot/message approval and work-unit commit. Native review pending eligible boundary.

## Acceptance evidence

- Initial source tree clean on main. No unrelated changes introduced.
- Angular CLI MCP unavailable; local npm scripts used.
- Writer baseline: npm test -- --watch=false passed 40 tests / 14 files; npm run build passed, one prerendered route.
- Writer and independent final: npm test -- --watch=false passed 48 tests / 16 files; npm run build passed, one prerendered route.
- Independent git diff --check passed; LF/CRLF normalization warnings only.
- All moved HTML byte-identical; source methods, guard/store behavior, SSR and root lifetimes unchanged. No active old-path/removed-class references. Eight tests cover route composition and shared source/store identity; docs links checked.
- Route RED two intended failures, GREEN four tests. DI RED four failures against temporary useClass bindings (not original baseline), GREEN four tests. Path-only moves have no behavioral RED; no fabricated baseline failure claimed.
- Native assess unassessable due to undeclared untracked files; independent verification required and completed. Inspect reached intended-untracked selection; no START, lineage or review approval. Native review remains pending.
- Parent confirmed nothing staged: modified AGENTS.md/app.routes.ts/app.config.ts, old tracked feature paths deleted, new feature/experience paths and two specs plus task document untracked. Ordinary unstaged diff omits moved untracked contents; verified directly against Git originals.
- No browser/E2E execution (templates unchanged; no E2E target). CodeGraph index not refreshed; source is verification authority.
- Commit: none. Tasks remain unchecked pending approved work-unit commit.

## Next step

Human review and staging of the complete refactor, including old-path deletions and new paths/tests/docs. Then inspect exact staged diff and obtain explicit snapshot/Conventional Commit message approval before any commit. No push/PR implied.
