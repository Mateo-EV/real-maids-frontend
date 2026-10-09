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
- [ ] T1 Implement shell/sidebar and temporary child redirect, remove obsolete page, update route/component regression tests. Delegated writer: multi-file scope.
- [ ] T2 Configure development/production public environment labels and enum-backed visual language select. Same single writer, no parallel writes.
- [ ] T3 Run focused/full tests, build SSR/prerender and diff check; update product and agent documentation. Native review as offered; delivery remains separate human approval.

## Evidence
- User reports previous visual work validated, committed and pushed. Current observed HEAD `4c1e851`, clean git state.
- Scout confirmed login and guest guard navigate to `/admin`, both preserved through redirect.
- `Lang.EN = en`, `Lang.ES = es`; select installed.
- `npx ng generate @spartan-ng/cli:info --json` passed: sidebar available, not installed; generation root `libs/ui`, alias `@spartan-ng/helm`, nova style.
- Angular 22 targets build/serve/test, official Vitest builder supports include. Environment placeholders empty; no file replacements configured.

## Verification
Use test-first for redirect, disabled navigation and environment/select semantics: observe failing applicable tests before implementation, then focused green. Pure styling has no meaningful RED; no pixel/contrast claims without browser execution. Run `npm test -- --watch=false`, `npm run build`, `git diff --check` after implementation; focused tests via local Angular CLI include as needed.

## Delivery
One cohesive admin-shell work unit; estimate 400–700 authored diff lines plus generated Helm sidebar. Avoid unrelated refactors. No staging, commit or push authorized by this implementation request. Browser checks must be reported honestly if unavailable.
