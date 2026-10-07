# Read-only audit queries with shared offset pagination

## Objective and scope
Implement reusable plain TypeScript offset pagination in `src/app/shared/pagination` and read-only audit queries in users application/in-memory infrastructure. The user authorized latest N queries and delegated pagination design: default offset 0, limit 20, maximum 100, response `{ items, total, offset, limit }`. Sort by date descending then ID descending. Reject invalid pagination; return an empty page beyond the source length.

Shared is appropriate for reusable contracts/functions; core is reserved for cross-cutting services/configuration. No other feature migration, UI, sessions, audit writes, HTTP contracts, persistence or production security claims. Preserve existing user-created entities. Use `getAuditLogs` for the paginated query and a distinct `AUDIT_LOG_REPOSITORY` token. Root repository implementations delegate to root sources and bind with `useExisting`.

## Tasks
- [ ] T1: Implement shared pagination, audit query contract/use case/source/repository/DI and deterministic tests. Route: delegated writer (multiple non-trivial files).
- [ ] T2: Verify focused tests, full configured suite and build. Route: delegated verification; record exact outcomes.
- [ ] T3: Document implemented boundary and missing audit-specific product traceability; inspect final diff and report delivery state. No staging or commit without explicit human approval.

## Acceptance checks
- Safe-integer nonnegative offset; integer limit 1–100; defaults only for omitted fields; reject nonfinite/fractional/null/string/invalid values.
- Correct total-before-slice, deterministic descending order and tie-break, last partial and beyond-end pages.
- Defensive entity/date copies, fresh subscriptions, delayed query and cancellation before emission.
- Use case/repository delegation preserves observable/results; distinct token and `useExisting` root composition.
- Fictitious source-owned data, no audit creation or session behavior; disabled audit UI stays disabled.
- Document contextual M02/RF02/HU02/P03 and RNF09/RNF10 without inventing audit-specific traceability.

## Verification plan
Test-first: add focused shared/audit specs and observe RED, then implement and observe GREEN. Run focused existing delegation/config/cancellation specs, `npm test -- --watch=false`, and `npm run build`. Angular MCP unavailable in mapping; use workspace-local npm scripts. No browser validation needed for this non-UI change.

## Progress and delivery
Mapping complete; implementation starting. Forecast approximately 300–400 authored lines; keep one cohesive additive work unit and surface any overage, without reducing useful tests. Delivery strategy: ask-on-risk. No implementation commit exists. Memory mirror unavailable: Engram reported server ownership mismatch; local progress remains authoritative until resynchronization.

## Next step
One bounded writer implements T1 and documentation within the mapped edit surfaces, returning exact test-first and verification evidence. Parent reviews the diff and reports pending staging/commit separately.
