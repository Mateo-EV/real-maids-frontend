# Reduce the initial bundle with Users-owned Hot Toast

## Goal and scope

Reduce the production initial bundle below the existing 500 kB warning threshold by removing Users-only Hot Toast JavaScript from root composition. Preserve toast notifications, body-overlay styling, SSR safety and the current 500 kB / 1 MB budgets. User authorized this optimization separately from the retained-tab fix committed as `9d2305d1ec84d2335a387fb2157ec95fe83fc55c`.

Baseline: production build succeeded at 521.35 kB initial. Earlier stats attributed 46,801 B of main JS and 18,865 B of global CSS to Hot Toast. These contributions are evidence for a candidate optimization, not promised savings.

## Approach and constraints

First move both HotToastService and its configuration to the lazy Users route. The service is root-provided; moving configuration alone is insufficient. Keep global toast CSS initially: overlays attach to document.body. Only consider lazy CSS if measured JavaScript savings do not meet the target; avoid a speculative hashed-asset loader.

- No budget increases, toast library replacement, domain/store lifetime changes or unrelated formatting.
- Test first for provider ownership and real lazy-route consumers. Verify overlays receive the route-owned service, not an unconfigured root instance.
- Preserve existing SSR/hydration safety and all toast success/error behavior.
- No staging or implementation commit without explicit approval of the exact staged snapshot and message.
- Traceability: RNF04/RNF09/RNF10/RNF12; Users context M02/RF02/HU02/P03.

## Tasks

- [x] T1 — Implement scoped toast composition with regression tests and narrow docs updates. Verified and committed in `d0f1db9d4f96edab7b6bca457b52ccc505bc2f22`. Route: gentle-ai-worker; multiple nontrivial files and preparation require delegation. Route-local HotToastService, ViewService and configuration keep consumers and the body container in the same injector.
- [x] T2 — Verify formatting, focused/full tests and production stats, confirming initial <500 kB with unchanged budgets. Writer checks and independent spot check passed; committed in `d0f1db9d4f96edab7b6bca457b52ccc505bc2f22`. Route: writer self-check then gentle-ai-verify as required.
- [ ] T3 — Review the stable candidate and obtain human staging/snapshot/message approval for its separate commit. Native review blocked: no model configured for review-reliability. Open lineage review-e6cb091169e67162 remains reviewing, without a verdict or receipt. Independent checks do not replace native review. User explicitly approved committing with the disclosed review blocker; commit `d0f1db9d4f96edab7b6bca457b52ccc505bc2f22` exists, but RDD remains open. Route: parent native facade and human decision. Leave implementation tasks open until commit exists.

## Acceptance and evidence

- First-visit Users notifications and dialog notifications use the configured service.
- Root composition no longer eagerly imports toast JS; global styling remains functional.
- Production output measures below 500 kB with unchanged budgets.
- Applicable tests and formatting pass; browser checks are reported honestly.
- No browser visual/keyboard acceptance has been run for this task yet.
- Test-first RED covered root configuration, missing route service and real routed root-instance resolution. Final focused composition suite: 13 passed; existing toast consumers: 65 passed; full suite: 443 tests across 55 files passed.
- `npx ng build --configuration production --stats-json`: succeeded, initial 478,795 bytes (478.80 kB), estimated transfer 113.03 kB, no budget warning. Baseline 521.35 kB. `angular.json` unchanged.
- Stats confirm no Hot Toast input in initial main JS and its presence in lazy Users route chunks. Global toast CSS stays unchanged; no lazy CSS loader needed.
- Touched-file Prettier write/check and `git diff --check` passed (docs/ is ignored by existing Prettier configuration). SSR construction/internal initialization tested; calling package success() on server is not supported and Users remains client-rendered.
- Reported index.lock was absent during read-only inspection; no locks removed or Git writes retried. Two app-config files are staged externally; other implementation files remain unstaged. Preserve human index choices.
- Independent verifier: 13 composition tests across 2 files passed; touched-file and task-document Prettier check passed; `git diff HEAD --check` passed. Existing stats independently confirm 341,910 B main JS + 136,885 B CSS = 478,795 B initial and lazy Hot Toast reachability. No build/full-suite/browser rerun claimed.
- Native reviewer failed with reviewer-config-invalid before execution. Fresh bound STATUS retained the same collect slot. ASSESS with unavailable outcome failed on untracked declaration and required independent verification, now passed. No review acknowledgement, receipt or authority recovery performed.

Forecast: approximately 120–250 authored diff lines, one coherent work unit. Observed implementation diff: 157 additions / 5 deletions, excluding this task document. Delivery strategy: ask-on-risk. Commit: `d0f1db9d4f96edab7b6bca457b52ccc505bc2f22` (`perf(users): defer hot toast to the lazy users route`). RDD: blocked for the stable candidate; human configuration decision pending.

## Next step

Configure a model for review-reliability before resuming the open native review through fresh bound STATUS. Do not substitute the independent verification as a native verdict. The human approved the exact staged snapshot and message, including the disclosed blocker, and requested ending the session. Implementation commit is complete; do not start a new review or alter the open authority. Browser visual/keyboard smoke and native review remain pending.
