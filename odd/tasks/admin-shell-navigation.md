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

## Delivery
Tracking-only commit `070058d96696acc6c6cc1012ecb59df69a2a55e3` reviewed/acknowledged as low-risk non-executable content, lineage `review-15a6eff70666539f`; this is not code review approval.
Source changes are unstaged/uncommitted. No code staging, commit or push authorized by this implementation request. Native candidate preflight follows separately; documentation updates do not authorize code delivery.
