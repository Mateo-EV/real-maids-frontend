# IAM reusable catalog UI

User request: refactor shared presentation patterns from Users/IAM for reuse in other modules.
Branch: `refactor/iam-reusable-ui` (local only; no push requested).

## Specs

1. S1 — User request: “quiero refactorizar algunos componentes de users page o el modulo de iam, para poder utilizarlo en otros modulos del sistema.”
2. S2 — User request: “Quiero refactorizar el boton con el +, los filtros y como se ven, la tabla con sus estilos, los tabs, los card.”
3. S3 — User request: “Primero hazme un análisis de ecomponentes que se´ria bueno factorizar aqui, porque entre estilos de css que se han usado aqui, todo está con un scope que es dificil de transporta a otro lado a menos que copie y pegue”
4. S4 — User authorized implementation: “me parece muy bien, hazlo en otra rama y como te indica el harness utiliza subagentes para realizacion de esta tarea”
5. S5 — Analysis constraint: retain IAM-only meaning and behavior in Users; only extract proven presentation patterns. Preserve existing `CatalogFrame`, shared filter classes and responsive breakpoint behavior where practical. Do not change business behavior, IAM state, or navigation semantics. Tabs and KPI cards remain feature-owned unless a shared pattern can be safely extracted without imposing IAM-specific meaning.

## Tasks

- T1 (S1-S5): Extract an opt-in catalog action-with-plus presentation contract and adopt it in Users and Customers. Route: completed by bounded subagent; commit: `a011a50` (`feat(ui): share catalog create action styling).
- T2 (S1-S5): Assess whether responsive table/mobile-card structure needs another abstraction. Route: completed by bounded read-only subagent; recommendation is no additional component because CatalogFrame, global table styles, responsive markers and 64rem container query already share the stable presentation while row/card semantics differ per feature. No code commit.
- T3 (S1-S5): Document the reusable patterns and their ownership boundaries; format, verify, and close tracking while preserving the pre-existing local diff. Route: parent. README documentation is in `a011a50`; this task record is included in the closing tracking commit.

## Log

### L1 — Original user request

quiero refactorizar algunos componentes de users page o el modulo de iam, para poder utilizarlo en otros modulos del sistema. Quiero refactorizar el boton con el +, los filtros y como se ven, la tabla con sus estilos, los tabs, los card. Primero hazme un análisis de ecomponentes que se´ria bueno factorizar aqui, porque entre estilos de css que se han usado aqui, todo está con un scope que es dificil de transporta a otro lado a menos que copie y pegue

### L2 — User authorization

me parece muy bien, hazlo en otra rama y como te indica el harness utiliza subagentes para realizacion de esta tarea

### L3 — Initial evidence and constraints

The existing `CatalogFrame` is in `src/app/shared/components/catalog-frame/catalog-frame.ts`. Filter classes and responsive table/card rules are global opt-in rules in `src/styles.css`. `users-page.css` contains IAM-specific tabs/KPI/avatar/role/status decoration. A pre-existing user diff in `users-page.html` changes only Tailwind class syntax for the Sessions badge; preserve it and do not claim it as part of this feature.

### L4 — T1 implementation evidence

The bounded `gentle-ai-worker` implemented `.catalog-action-with-plus` in `src/styles.css` and adopted it on Users and Customers create actions. The class is opt-in and accents only the direct plus icon; label, button variant, disabled state, and action remain consumer-owned. Focused tests observed RED (72 passed, 2 failed) then GREEN (75/75 passed across both page specs); Prettier check and `git diff --check` passed. Parent reviewed the exact diff and confirmed the unrelated Sessions badge hunk remains intact. No visual browser verification was performed.

### L5 — T2 read-only evidence and decision

The bounded sample found the shared container/projection in `src/app/shared/components/catalog-frame/catalog-frame.ts:5-25,32-37` and shared table rhythm, visibility markers, and 64rem container query in `src/styles.css:269-307`. Users, Customers, Operations requests, and Staff have materially different columns, mobile fields, labels, links, badges, and actions. The explorer recommends no generic table/card component because it would require template-slot complexity and risks obscuring semantic table/list markup; sample is not exhaustive. T2 is complete as an assessment, not a code implementation. README usage guidance records this boundary.

### L6 — Final verification and review assessment

The worker's exact focused Vitest run passed 75/75 tests across Users and Customers page specs. Parent formatting checks passed for README, task record, global stylesheet and both page templates/specs; `git diff --check` passed. Native ASSESS over the committed range `main..a011a50` returned risk medium, nativeRisk medium, `reviewDue: false` (`under_budget`); no native review was started. Browser-computed styling/responsive acceptance was not run. The pre-existing Users Sessions badge formatting change remains unstaged and is excluded from the feature commit.
