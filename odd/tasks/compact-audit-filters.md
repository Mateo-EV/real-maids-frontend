# Progressive audit filters

## Objective

Give audit results more space through progressive disclosure without changing audit filter or CSV semantics. Existing T6 / RNF06/RNF08/RNF09/RNF10/RNF12 apply; audit-specific RF/HU traceability remains documented as missing.

## Scope

Audit filter presentation, component-local state, tests and T6 product documentation. Generated Helm combobox uses existing dependencies. Results/table/cards, endpoints and store lifetimes are unchanged.

## Tasks

- [x] T1 — Implement actor combobox, compact toolbar, advanced disclosure, secondary counts, persistent chips, independent removal and conditional clear. Delegated writer; committed in `5fc1c49b8d2505ed82963d54e222a2742e870fe0`.
- [x] T2 — Observe focused RED/GREEN, format touched files, run full tests/build and inspect diff. Evidence below.
- [x] T3 — Human staging, exact snapshot/message approval, HEAD/index recheck and source commit completed.
- [ ] T4 — Browser responsive, long-name overlay, keyboard/focus and download acceptance remains pending.

## Acceptance

Search is local; only actor selection supplies identity. Todos los actores clears actor. Historic/deleted selected actors remain preserved across catalog gaps. Advanced UTC dates/entity/action use two desktop columns and mobile stacking. Toggling does not reload or clear filters. Chips remain visible when collapsed and remove fields independently. Limpiar todo appears only for applied filters. Secondary counts exclude actor/search/defaults. CSV uses applied filters; cancellation, page reset and export guards remain intact.

## Verification

- Initial progressive behavior RED observed; focused integration GREEN 47/47 and full suite 748/748 across 67 files.
- User manually changed header styles; focused verification caught a stale title-outside-form assertion (46 passed/1 failed). User authorized only structural test correction, preserving styles. Focused tests then passed 47/47 and full suite 748/748 again.
- Exact touched-file Prettier checks and diff whitespace checks passed; line-ending notices only.
- Production build/prerender passed before the manual header styles; initial bundle 515.66 kB exceeds 500 kB warning budget by 15.66 kB. Build was not rerun after those manual styles.
- Native review `review-cf0fde7ed85f6f7d` approved and acknowledgement consumed for corrected final candidate `sha256:3c50f4a5d448ec1db79e154bfe7b91c5bc10e9744ac9ac391a464e320670a9fd`.
- Browser acceptance was not run; automated checks do not establish rendered layout acceptance.

## Delivery

Human staged all 28 paths, including the corrected spec, and explicitly approved snapshot SHA-256 `bfe13ae5ddb7dc44be753dac125d15c2e4c40a138a74b05d54b12b9cad3c731b` at HEAD `648bc17a26d34946abb6ada55b81d3fd58301bf8`, with message `feat(audit): add progressive disclosure filters`. Both identities were rechecked immediately before commit.

Source commit: `5fc1c49b8d2505ed82963d54e222a2742e870fe0`, 28 files, 1167 insertions and 145 deletions (includes 22 generated Helm files). Working tree was clean immediately afterward. No push performed. This task-document update is separate from the source commit.

## Next step

Validate browser responsiveness/keyboard/overlays/downloads. Push remains a separate user decision.
