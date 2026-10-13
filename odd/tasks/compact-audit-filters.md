# Progressive audit filters

## Objective
Give audit results more space through progressive disclosure without changing audit filter or CSV semantics. Existing T6 / RNF06/RNF08/RNF09/RNF10/RNF12 apply; audit-specific RF/HU traceability remains documented as missing.

## Scope
Only audit filter presentation, component-local state, tests and the existing T6 product description. Generate missing Helm combobox through the installed Spartan CLI; no new dependencies. Do not redesign results/table/cards, change endpoints, store lifetimes or transport contracts.

## Tasks
- [ ] T1 — Implement actor combobox, compact main toolbar, advanced disclosure, secondary-field count, applied chips/removal and conditional clear. Delegated writer; multi-file trigger. Implementation in progress, commit pending.
- [ ] T2 — Observe focused test RED/GREEN, format touched files, run full tests and build, inspect diff. Browser responsiveness/keyboard acceptance must be reported independently.
- [ ] T3 — Human staging and precise snapshot/message approval before a source commit. Source work unit remains open until committed.

## Acceptance
Main toolbar shows only responsible actor combobox, Más filtros with icon and secondary active count, Exportar CSV. Search never changes query; only selection supplies identity; Todos los actores clears actor. Preserve selected historic/deleted actors and catalog loading/error states. Advanced UTC dates/entity/action use two desktop columns and mobile stacking. Toggling never reloads or loses filters. Chips stay visible when collapsed, remove fields independently, and Limpiar todo only appears with applied filters. Count each secondary applied field, excluding actor/search/defaults. Export uses applied filters. Preserve cancellation, query/page reset, export guards and accessibility.

## Evidence
Previous compact-grid baseline: worker structural RED then 9/9 GREEN; independent verifier confirmed 9/9, formatting and whitespace checks. Build succeeded including prerender with initial-budget warning 511.98 kB against 500 kB. Browser acceptance was not run.
Native source review review-6be70c14bf4c662d was approved and acknowledged for the previous grid candidate, not this forthcoming redesign. No source commit exists.
CLI discovery and combobox dry-run confirmed 22 generated files under libs/ui/combobox plus tsconfig.json/tsconfig.app.json aliases; no package changes. Existing Brain is installed. Use native disclosure if no Helm collapsible is needed.

## Delivery
Single writer, no staging/committing by agent. Forecast approximately 300–450 authored non-generated diff lines; protect focus and report if scope grows. Generated component files are mechanical CLI assets.

## Latest verification
Progressive toolbar, actor combobox, advanced disclosure, secondary counts, persistent chips/individual removal and conditional clear implemented. User explicitly approved adding users-page.spec.ts to migrate its retained-audit integration interaction; assertions preserved. Focused RED reproduced 46 passed/1 failed; focused GREEN 47/47. Full suite: 748/748 across 67 files. Production build passed including one prerendered route; initial bundle 515.66 kB exceeds 500 kB warning budget by 15.66 kB. Exact touched-file Prettier write/check and git diff whitespace checks passed (CRLF notices only).
Native final-candidate review review-b90db52e509952a7 approved and acknowledgement consumed successfully, including 22 generated combobox files. ASSESS could not determine risk because of untracked declarations, but returned closed-review plan: writer verification stands, no additional independent verifier required. Final independent focused spot check passed 13/13 audit tests; diff whitespace check passed with line-ending notices only. Changed T6 documentation adds no relative links.
Browser responsive/long-name overlay/focus/download acceptance remains pending. Source files have not been staged or committed; implementation tasks remain unchecked pending their work-unit commit. Changed product documentation was child-written and requires manual staging.

## Next step
Browser acceptance and source commit remain pending. Human stages exact intended source/generated/config/test/docs paths before any explicit commit approval.
