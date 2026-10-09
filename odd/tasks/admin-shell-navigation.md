# Admin shell and navigation

## Goal
Replace the admin landing page with a reusable responsive admin shell. Preserve auth and users behavior; `/admin` temporarily redirects to `/admin/users`.

## Authorized scope
- Navy status header with requested static Spanish copy `Sistema seguro y activo`.
- Public build-time environment label (`Desarrollo` or `Producción`) without parenthetical details; no secrets or runtime health/security claims.
- Top-right custom Spartan select using users-domain `Lang`, Spanish default; visual only, no translation, storage or session mutation.
- Sidebar: IAM is the only enabled navigation destination. Landing, CRM, RRHH, Cotizaciones and Programaciones are disabled placeholders.
- Remove obsolete admin home page, retain guards/lazy feature routes, session/logout and users CRUD/loading/error/mobile behavior.
- Reuse installed select and generate available Helm sidebar through workspace-local CLI; no guessed implementations.

## Tasks
- [x] T1 Implemented shell/sidebar, temporary child redirect and route/component tests; parent removed the three obsolete admin home files. Delegated writer: multi-file scope.
- [x] T2 Configured public development/production labels and enum-backed local visual language select. Same single writer.
- [x] T3 Independently verified final tests, production/development SSR builds and diff check; updated project/product/agent documentation. Browser validation and source delivery remain pending.

## Requested visual correction
User reported header mismatch with reference, poorly visible language select and pale sidebar. Read-only comparison confirms reference compact inline status/environment/language strip, navy RM mark and constrained white brand/session row. Refine scoped shell/side navigation styling; add registered module icons, stronger IAM active marker and legible but truly disabled placeholders. Preserve public environment, Lang visual-only state, auth/session/logout and responsive navigation. No global theme or unrelated dialog changes. Source-only inspection cannot certify rendered contrast.

- [ ] T4 Header/sidebar/select refinement implemented and verified; source commit and browser validation pending. Delegated writer plus independent verifier. Compact inline strip, navy RM mark, constrained brand/session row, inner select button/value/chevron colors, scoped navy sidebar surfaces, registered decorative icons and gold/coral IAM marker. Pure styling has no meaningful behavioral RED; two missing-icon semantic assertions observed RED before focused GREEN.

## Screenshot-based sidebar refinement
- [ ] T5 Modern minimalist sidebar matching supplied screenshot hierarchy: compact RM gold mark/brand, General and Administración groups, consistent line icons and vertical spacing, IAM with subtle lighter navy surface/white text and small gold marker rather than full yellow background. In progress, delegated writer for sidebar TS/CSS and semantic route regressions. Preserve five disabled modules, IAM only destination and mobile dismissal. Do not add configuration/help destinations or functionality from screenshot. Reference: supplied screenshot `Captura de pantalla 2026-10-09 000138.png`. Pure styling requires structural/regression checks, not invented pixel evidence.

## Evidence
- User reports previous visual work validated, committed and pushed. Current observed HEAD `4c1e851`, clean git state.
- Scout confirmed login and guest guard navigate to `/admin`, both preserved through redirect.
- `Lang.EN = en`, `Lang.ES = es`; select installed.
- `npx ng generate @spartan-ng/cli:info --json` passed: sidebar available, not installed; generation root `libs/ui`, alias `@spartan-ng/helm`, nova style.
- Angular 22 targets build/serve/test, official Vitest builder supports include. Environment placeholders empty; no file replacements configured.

## Verification
Use test-first for redirect, disabled navigation and environment/select semantics: observe failing applicable tests before implementation, then focused green. Pure styling has no meaningful RED; no pixel/contrast claims without browser execution. Run `npm test -- --watch=false`, `npm run build`, `git diff --check` after implementation; focused tests via local Angular CLI include as needed.

## Results and remaining checks
- Writer observed four intended RED failures (redirect/navigation/environment/Spanish default) before implementation; focused GREEN: 44 tests across 7 files.
- Official sidebar generator passed; 41 Helm files generated including required sheet/skeleton/tooltip, no dependency changes. Added mobile sheet title/description.
- Final independent `npm test -- --watch=false`: 337 tests / 38 files passed after obsolete page/spec deletion.
- `npm run build`: passed browser/server/prerender; initial bundle 508.51 kB, 8.51 kB above the 500 kB warning budget. Budget unchanged.
- `npx ng build --configuration=development`: passed including SSR/prerender.
- `git diff --check`: passed with LF/CRLF normalization warnings only.
- No live AdminHomePage references or severe introduced issue found. Shared session/logout, guards, users catalog and disabled navigation preserved.
- Real-browser geometry, hydration and keyboard/focus checks remain unperformed; source/jsdom evidence is not rendered verification.
- Additional necessary test migration: src/app/core/config/app.config.spec.ts. Generator dependency paths authorized narrowly by parent.

## T4 verification and disposition
- Writer full `npm test -- --watch=false`: 337 tests / 38 files passed; focused admin tests 10/10 passed.
- Independent Angular MCP focused admin route/shell test target: 10 tests / 2 files passed.
- Writer and independent `npm run build`: passed browser/server/prerender. Latest initial bundle 508.83 kB exceeds unchanged 500 kB warning budget by 8.83 kB; causality of this warning not established.
- Writer and independent `git diff --check`: passed with CRLF conversion warnings only.
- Source review confirms explicit inner Helm select styling and sidebar surface overrides, real disabled modules, current IAM, session/logout and mobile toggle. No rendered contrast or browser geometry/focus evidence available.
- Exact source candidate `sha256:6d570f82d14e73aec0704c9dfa8ddc8b1cc178753c072b40a4522b7433b13d82` native review declined in eligible host; no new lineage created. Do not re-request review for that exact target.
- Native assessment unassessable (untracked declaration), independent high-risk fallback completed. No native approval claimed; subsequent tracking-only edits do not alter source behavior.

## Delivery
Tracking-only commit `070058d96696acc6c6cc1012ecb59df69a2a55e3` reviewed/acknowledged as low-risk non-executable content, lineage `review-15a6eff70666539f`; this is not code review approval.
Tracking update committed as `cb1727dfa6eb92333995de38e9fe85960a0f9e19` by runtime; not a code commit.
Source changes are unstaged/uncommitted. No code staging, commit or push authorized. Prior source native lineage `review-465dfc05dc11b322` is reviewing but capture failed because `review-reliability` has no configured model; no native approval. T4 edits will differ from its frozen target; do not submit new bytes as that old candidate or silently reset/recover authority. Final native inspect must determine the offered continuation.
