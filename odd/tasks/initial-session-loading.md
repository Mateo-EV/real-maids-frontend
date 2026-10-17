# Neutral initial session screen

## Objective

Keep login prerendering while preventing login markup from flashing before browser session restoration selects login or admin (M01/RF01/HU01/P01; RNF06/RNF08/RNF09).

## Scope and decision

User approved a neutral loading screen and explicitly retained prerendering. Gate initial routed presentation in the root component; preserve authentication, storage, API contracts, route guards and render modes. Use installed Helm feedback primitives and semantic tokens. Do not hide a constructed login with CSS. Reveal the selected route only after the initial browser navigation succeeds; keep it revealed on subsequent navigation. Handle redirect cancellation without revealing login or hanging. Terminal navigation failures must not leave a silent indefinite spinner.

## Tasks

- [x] T1 — Implement and deterministically test the hydration-safe initial presentation gate. Implementation, writer/independent verification and native review passed; committed in 5054653. Mapping and multi-file writing were delegated.
- [x] T2 — Verify production prerender output and regression tests, update product documentation and prepare human review. Verification and documentation passed; committed in 5054653.
- [x] T3 — Polish loading with RM branding, navy/gold semantic tokens, Spanish hierarchy and the reduced-motion-aware Helm spinner. Template/assertion changes only; navigation and hydration logic unchanged. Committed in 5054653 after user validation and exact staged-snapshot/message approval.

## Acceptance and checks

- Server/prerender and initial browser render show an accessible neutral status without login fields or protected content.
- Pending restoration shows neutral UI; absent/invalid credentials permit login and valid restoration redirects to admin without revealing login.
- Redirect cancellations do not reveal content; later logout/navigation is not gated again.
- No server storage or authentication requests; render modes and root store lifetimes unchanged.
- Observe deterministic RED before implementation and GREEN afterward, retaining existing guard and route tests.
- Run local Prettier write/check on touched files, Angular focused/full tests and production build; inspect built login HTML for neutral content and absence of login form.
- Browser responsive/keyboard and real authenticated backend timing are not certified by unit tests/build. No E2E target exists.

## Work unit and delivery

One coherent fix, forecast approximately 150–300 authored diff lines plus task documentation (advisory estimate). Delivery strategy: ask-on-risk. No code staging/commit without explicit snapshot/message approval. Rollback removes only the root presentation gate and its tests/documentation; auth and render-mode behavior stay unchanged.

## Evidence

- Clean working tree on main before writes.
- Read-only mapper recommends root gating until first successful NavigationEnd; installed Helm spinner exists.
- Angular MCP discovery/best practices available to parent: Angular 22, build/serve/test, Vitest.
- Writer changed src/app/app.ts, added src/app/app.spec.ts and updated README.md/docs/README.md: initial post-render root gate, installed Helm loading feedback, sticky reveal after successful navigation and terminal failure/same-URL retry.
- Observed writer evidence: initial RED (seven intended assertion failures after correcting test compilation); GREEN 8/8 root tests; same-URL regression also independently RED then GREEN.
- Writer checks: focused router/guard/root tests 26/26; full Vitest suite 756/756 across 68 files; production build passed and one route prerendered. Built login HTML contains neutral status and no form/input/outlet markup. Prettier write/check and git diff --check passed; product docs follow existing ignore rules.
- Final build warning: initial bundle 618.48 kB exceeds the unchanged 500 kB warning threshold. User validated the result before commit; independent cross-browser hydration/responsive/keyboard and authenticated backend timing coverage remain unverified.
- Independent verification: Angular MCP focused tests 26/26, Prettier check and git diff --check passed; no concrete candidate-caused defect found. Independent production build passed, one route prerendered; dist/real-maids-frontend/browser/login/index.html contains role=status and Cargando, no input/form/app-login-form/router-outlet.
- Native review: review-0267cf32591e1cad, medium tier, review-reliability approved; exact acknowledgement closed successfully and burned authority. Frozen scope is the four implementation/test/product-doc paths, excluding this task document. Initial assessment unavailable due untracked declarations triggered independent verification; explicit new-test selection resolved preflight.
- Documentation auto-staging previously refused with provenance drift; no blind retries. Human subsequently staged the five intended paths; no agent staging or commits.
- The human reported the initial result looks good and requested loading UI polish. Read-only visual mapping found existing text-based RM branding, no standalone logo asset; Helm spinner already uses motion-safe animation. New visuals remain neutral, do not claim authentication success, and retain reduced-motion support.
- The subsequent staged candidate (including the task document) was separately approved and acknowledged as review-33bd0497441d84bd before visual refinements. That approval does not cover the upcoming T3 changes.

- Final polish checks: RED five expected brand assertions, GREEN eight root tests; focused 26/26 and full 756/756 across 68 files; Prettier, diff and production build passed. Independent focused checks and prerender inspection passed.
- Final native review review-4fa27028d364bfea approved the complete candidate and was acknowledged successfully before commit.
- Commit: 5054653c9ce1e9ac8c7aa1acc185d85d722313a1 — fix(auth): prevent login flash with branded startup loading. HEAD and raw staged-diff SHA-256 matched the approved snapshot immediately before commit. No push performed.

## Next step

Implementation is committed. This post-commit task closure is documentation bookkeeping only; it does not amend the approved implementation snapshot. Push and broader cross-browser acceptance remain separate decisions. Do not retry refused documentation automation.
