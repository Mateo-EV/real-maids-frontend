# Capability and experience structure

## Objective and scope

User-approved recommendations 1/2: separate auth/customers from admin and remove pure forwarding repository classes (RNF09/RNF10). Preserve M01/P01 and M03 delivery boundaries, /login and /admin URLs/guards/redirects, SSR, source behavior, templates, demo filenames, root providers/stores and intentional Angular/RxJS domain coupling. No speculative roles, backend integration or historical-task rewrites.

## Work unit and delivery

One coherent refactor with tests/docs. Parent performed explicitly authorized mechanical moves/deletions; gentle-ai-worker completed bounded edits and gentle-ai-verify independently checked. Rollback: capability/admin moves, routes, source interfaces/bindings, tests and AGENTS.md together. Delivery strategy ask-on-risk; no PR. Human staged and explicitly approved the precise snapshot and message; parent verified HEAD and staged SHA256 immediately before commit. No push performed.

## Tasks

- [x] T1: Features moved to src/app/features/{auth,customers}; existing admin page/route to src/app/experiences/admin. Pure forwarding repositories removed, sources implement unchanged contracts, root useExisting aliases; eight regression tests and AGENTS.md updated. Commit below.
- [x] T2: Independent tests/build, route/DI checks, original-versus-moved source/template comparisons and docs checks passed. Commit below.
- [x] T3: Human staging, precise snapshot/message approval and commit completed. Native review declined for the exact candidate; RDD remains on, verification fallback satisfied.

## Evidence

- Baseline: npm test -- --watch=false passed 40 tests / 14 files; npm run build passed, one prerendered route.
- Writer and independent final: npm test -- --watch=false passed 48 tests / 16 files; npm run build passed, one prerendered route.
- git diff --check passed; LF/CRLF normalization warnings only. All moved HTML byte-identical; source methods, guards/stores, SSR and root lifetimes unchanged. No active obsolete imports. Docs links checked.
- Route focused RED two intended failures, GREEN four tests. DI RED four failures against temporary useClass bindings (not original baseline), GREEN four tests. Path moves have no behavioral RED.
- Angular MCP unavailable; local npm scripts used. No browser/E2E execution; templates unchanged and no E2E target. CodeGraph not refreshed; source verified directly.
- Native START consent declined via host for sha256:8ad4d1fcd8ade8b7bb274c04fad8f8a107aa76835d7eb46d73287ab385c90ada; no lineage or review approval. Post-decline assessment high required separate verifier, already passed. RDD not disabled.
- Approved parent HEAD: 9fa1736ee37f864b761054382ee2809bb93a831e. Approved raw staged-diff SHA256: 2d191268abf0b2af52d81aa06018a9a6234c3e1283640cb9e0bf034f6b50cda1; both rechecked before commit.
- Commit: 3d50284b0a91696d62aae4e8e61cc4c2e64122b5 on main, refactor(architecture): separate capabilities from admin experience. 51 files, 228 additions / 117 deletions; post-commit source tree clean before this task-record update.

## Next step

Implementation committed; no push requested. This post-commit task-record update is unstaged bookkeeping and requires human staging/approval separately if it should be committed. No source work remains.
