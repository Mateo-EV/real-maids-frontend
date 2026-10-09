# Users RBAC matrix and audit viewer

## Goal and approved scope
Deliver functional in-memory RBAC and read-only audit sections inside the existing users feature, following the local Auth/IAM HTML reference. The user selected functional demo scope: retain the five current roles, use only explicitly illustrated matrix grants, leave other roles unconfigured, keep UTC, provide audit filters/pagination, export all filtered results as CSV, and show per-record changes only when before/after values exist.

This is not backend authorization, security monitoring, durable persistence, or cryptographic integrity verification. No additional role CRUD UI, endpoints, authentication changes, or invented privilege defaults. The HTML's seven illustrated matrix rows are design labels, not a replacement for product M01–M12 identifiers. Traceability: M02/RF02/HU02/P03 and RNF06/RNF08/RNF09/RNF10/RNF12; audit-specific RF/HU remains missing and must be documented.

## Architecture and constraints
Preserve domain tokens, stateless execute use cases, root repository implementations using useExisting, root in-memory sources, SignalStore presentation state, local Signal Forms, cancellable latency before effects and DestroyRef component cancellation. Use installed Spartan Helm, semantic theme tokens, shared catalog filters/dialog headers, mobile-friendly layouts, accessible actions, and Spanish existing UI conventions.

## Visual refinement accepted
User supplied screenshots `Captura de pantalla 2026-10-09 155940.png` and `160013.png` and explicitly requested consistent section styling using the refactored shared styles. Follow compact white bordered cards, navy hierarchy, warm compact table headers, aligned controls and labeled action badges; reuse existing catalog filters and Helm theme/dialog contracts. Preserve approved navy primary and UTC rather than screenshot coral save/UTC-5. Source inspection does not certify rendered fidelity.

## Work units
- [ ] T1 — RBAC domain/query/save boundary, in-memory source and matrix presentation integrated with Users navigation. Status: implemented and independently verified; human-approved commit pending. Route: delegated worker; multi-file behavior.
- [ ] T2 — Audit filter/detail/export contracts and use cases, in-memory data, state and responsive viewer integrated with Users navigation. Status: in progress. Route: delegated worker; multi-file behavior.
- [ ] T3 — Documentation, independent verification and final integration checks. Status: pending. Route: delegated verification and bounded documentation writer.
- [ ] T4 — Harmonize RBAC/audit visual styling with supplied screenshots and existing shared styles without duplicating feature overrides. Status: mapping in progress; writes follow T2 to preserve single-writer execution. Route: read-only scout then bounded writer.

## Acceptance and checks
Use test-first RED/GREEN for applicable deterministic behaviors. Verify query/save cloning, invalid role/action/module input, cancellation before mutations, unconfigured roles, confirmation/pending/error flows, audit UTC filtering before pagination, distinct log details, stable ordering, all-filtered CSV export and formula/quote/newline safety, SSR-safe browser downloads, and regressions in Users/Sessions. Run workspace-local Prettier write/check on exact touched paths, Angular focused tests, full tests and production build. Browser visual/keyboard/responsive checks must be reported separately and never inferred from unit tests.

## Delivery and evidence
Initial repository clean on main at db23f28. Implementation authorized; no staging, commit, push or PR authorized. Tasks remain unchecked until verification and explicitly approved commits exist. Native review pending for the integrated candidate under the user-owned switch. Forecast: substantial multi-layer change likely exceeds 400 authored changed lines; keep RBAC and audit as separate coherent work units rather than compressing tests or code. Delivery strategy: ask-on-risk before commit/PR preparation.

## T1 observed evidence
Worker completed 20 scoped source/test files: typed RBAC query/save boundary, source with 19 Operations role-2 grants across seven reference rows, other roles unconfigured, root state, responsive matrix, confirmation and UsersPage wiring. Audit remains disabled. RED observed for missing implementations and navigation; GREEN focused40 and boundary10 tests. Users-feature suite230 tests across27files passed. Production browser/server build passed with one prerendered route and initial515.45kB/500kB budget warning. Exact touched-file Prettier write/check passed after a second formatting pass. git diff --check passed. Browser visual/responsive/keyboard acceptance and full repository suite unrun.

Native assessment failed closed because new untracked implementation paths were not declared; candidate treated as high for independent verification. Independent verifier completed:230 tests across27files passed, git diff --check had no whitespace errors, and no concrete severe RBAC findings were found. Build remains worker-verified; full suite and browser acceptance still pending. The completed documentation-only native review concerned target a4f0bd957c116ba855a7989e6470ffafebd1cf9222ce125b254a8bac9b40a086, not this source candidate.

## Next step
Implement T2 with one bounded writer, then reconcile documentation and final independent checks. No code staging or commit authorized. Keep T1 unchecked until committed.
