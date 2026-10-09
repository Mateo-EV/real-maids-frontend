# Users RBAC matrix and audit viewer

## Goal and approved scope
Deliver functional in-memory RBAC and read-only audit sections inside the existing users feature, following the local Auth/IAM HTML reference. The user selected functional demo scope: retain the five current roles, use only explicitly illustrated matrix grants, leave other roles unconfigured, keep UTC, provide audit filters/pagination, export all filtered results as CSV, and show per-record changes only when before/after values exist.

This is not backend authorization, security monitoring, durable persistence, or cryptographic integrity verification. No additional role CRUD UI, endpoints, authentication changes, or invented privilege defaults. The HTML's seven illustrated matrix rows are design labels, not a replacement for product M01–M12 identifiers. Traceability: M02/RF02/HU02/P03 and RNF06/RNF08/RNF09/RNF10/RNF12; audit-specific RF/HU remains missing and must be documented.

## Architecture and constraints
Preserve domain tokens, stateless execute use cases, root repository implementations using useExisting, root in-memory sources, SignalStore presentation state, local Signal Forms, cancellable latency before effects and DestroyRef component cancellation. Use installed Spartan Helm, semantic theme tokens, shared catalog filters/dialog headers, mobile-friendly layouts, accessible actions, and Spanish existing UI conventions.

## Work units
- [ ] T1 — RBAC domain/query/save boundary, in-memory source and matrix presentation integrated with Users navigation. Status: in progress. Route: delegated worker; multi-file behavior.
- [ ] T2 — Audit filter/detail/export contracts and use cases, in-memory data, state and responsive viewer integrated with Users navigation. Status: pending. Route: delegated worker; multi-file behavior.
- [ ] T3 — Documentation, independent verification and final integration checks. Status: pending. Route: delegated verification and bounded documentation writer.

## Acceptance and checks
Use test-first RED/GREEN for applicable deterministic behaviors. Verify query/save cloning, invalid role/action/module input, cancellation before mutations, unconfigured roles, confirmation/pending/error flows, audit UTC filtering before pagination, distinct log details, stable ordering, all-filtered CSV export and formula/quote/newline safety, SSR-safe browser downloads, and regressions in Users/Sessions. Run workspace-local Prettier write/check on exact touched paths, Angular focused tests, full tests and production build. Browser visual/keyboard/responsive checks must be reported separately and never inferred from unit tests.

## Delivery and evidence
Initial repository clean on main at db23f28. Implementation authorized; no staging, commit, push or PR authorized. Tasks remain unchecked until verification and explicitly approved commits exist. Native review pending for the integrated candidate under the user-owned switch. Forecast: substantial multi-layer change likely exceeds 400 authored changed lines; keep RBAC and audit as separate coherent work units rather than compressing tests or code. Delivery strategy: ask-on-risk before commit/PR preparation.

## Next step
Implement T1 only; then reconcile evidence before T2. No checks have been run for this feature yet.
