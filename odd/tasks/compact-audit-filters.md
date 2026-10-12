# Compact audit filters

## Objective
Reduce the audit filter area's height without changing queries, actor identity, CSV export or accessibility (T6 / RNF06).

## Scope and constraints
Change only the audit viewer template and focused structural tests. Preserve existing Spanish labels, controls, errors and help associations. Do not change shared Helm or global catalog styles, state, contracts or dependencies.

## Tasks
- [ ] T1 — Implement a full-width responsive filter grid below the title with compact actions; add focused structural regression coverage. Route: delegated worker (template and test changes).
- [ ] T2 — Verify formatting, focused tests and production build; inspect the exact diff. Browser responsive/keyboard acceptance requires a browser and must be reported separately.
- [ ] T3 — Human staging and approved work-unit commit; review remains pending until the work unit exists.

## Acceptance
Dates remain adjacent where space permits; actor search/selection retain usable widths; entity/action remain visible. Phones use one column without horizontal overflow. All existing filtering and export semantics remain intact.

## Progress and verification
Repository initially clean. Exploration identified full-width Helm fields inside a wrapping form beside the title as the stacking cause. No shared changes required.
T1 in progress. Visual spacing has no meaningful behavioral RED; add structural regression before changing the template where feasible and run existing behavior tests.

## Delivery
Forecast: approximately 100–180 authored diff lines. Strategy: single reviewable work unit; no commits or staging authorized.

## Next step
Bounded worker implements T1 and runs formatting, focused test and build commands. Record observed results, not inherited counts.
