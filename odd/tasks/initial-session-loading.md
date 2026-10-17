# Neutral initial session screen

## Objective

Keep login prerendering while preventing login markup from flashing before browser session restoration selects login or admin (M01/RF01/HU01/P01; RNF06/RNF08/RNF09).

## Scope and decision

User approved a neutral loading screen and explicitly retained prerendering. Gate initial routed presentation in the root component; preserve authentication, storage, API contracts, route guards and render modes. Use installed Helm feedback primitives and semantic tokens. Do not hide a constructed login with CSS. Reveal the selected route only after the initial browser navigation succeeds; keep it revealed on subsequent navigation. Handle redirect cancellation without revealing login or hanging. Terminal navigation failures must not leave a silent indefinite spinner.

## Tasks

- [ ] T1 — Implement and deterministically test the hydration-safe initial presentation gate. Status: implementation, writer verification, independent verification and native review passed; awaiting human staging and approved commit. Mapping trigger: root, guards, routes, prerender and tests span more than four files; writer covers component/tests/docs.
- [ ] T2 — Verify production prerender output and regression tests, update product documentation and prepare human review. Status: verification and documentation complete; commit pending explicit human approval.

- [ ] T3 — Polish the initial loading presentation using existing RM branding, navy/gold semantic tokens, clearer Spanish text hierarchy and the installed reduced-motion-aware Helm spinner. Status: in progress; delegated writer (component and meaningful test changes). Keep hydration/navigation logic unchanged; preserve the human-staged snapshot and leave visual refinements unstaged. No new assets/dependencies, fake progress, timers or global style changes. Forecast: 40–80 additional diff lines, advisory only.

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
- Build warning: initial bundle 617.49 kB exceeds 500 kB warning threshold. Browser hydration/responsive/keyboard and authenticated backend timing acceptance remain pending.
- Independent verification: Angular MCP focused tests 26/26, Prettier check and git diff --check passed; no concrete candidate-caused defect found. Independent production build passed, one route prerendered; dist/real-maids-frontend/browser/login/index.html contains role=status and Cargando, no input/form/app-login-form/router-outlet.
- Native review: review-0267cf32591e1cad, medium tier, review-reliability approved; exact acknowledgement closed successfully and burned authority. Frozen scope is the four implementation/test/product-doc paths, excluding this task document. Initial assessment unavailable due untracked declarations triggered independent verification; explicit new-test selection resolved preflight.
- Documentation auto-staging previously refused with provenance drift; no blind retries. Human subsequently staged the five intended paths; no agent staging or commits.
- The human reported the initial result looks good and requested loading UI polish. Read-only visual mapping found existing text-based RM branding, no standalone logo asset; Helm spinner already uses motion-safe animation. New visuals remain neutral, do not claim authentication success, and retain reduced-motion support.
- The subsequent staged candidate (including the task document) was separately approved and acknowledged as review-33bd0497441d84bd before visual refinements. That approval does not cover the upcoming T3 changes.

## Next step

Implement T3 in src/app/app.ts and src/app/app.spec.ts, retaining previous behavior. Verify focused tests, production prerender and formatting, then review the new candidate independently of prior approved snapshots. Human must stage new hunks and approve the exact staged snapshot/message before commit. Tasks remain unchecked until commit. Do not retry refused documentation automation.
