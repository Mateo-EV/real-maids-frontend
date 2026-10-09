# Users visual refinement

## Objective and scope
Match the Auth/IAM reference in typography, width, header, metrics, filters/table and dialogs, preserving behavior. User chose local Plus Jakarta Sans. Reuse Helm and semantic palette, without speculative wrappers. Preserve session identity, mobile cards, disabled tabs, validation and guarded dismissal. No entity links, credential features, RBAC/sessions/audit functionality or new claims.

## Accepted correction
User reported inset navy header, low-contrast subtitle and missing orange title dot. Make navy edge-to-edge across the dialog header, readable subtitle and decorative orange dot the shared default for all modal headers, not a users-named style. Preserve body/footer padding, overlay corners, scrolling and dismissal. Root evidence: Helm dialog content has `p-4`/`rounded-xl`; existing `.user-dialog-heading` is inset and its components-layer subtitle color can lose to utilities. Inspect actual cascade before fixing.

## Tasks
- [ ] T1 — Six visual refinements and local font implemented/verified; approved commit pending. Delegated writer, multi-file trigger.
- [ ] T2 — Initial technical verification passed; browser checks not performed; approved commit pending. Independent verifier.
- [ ] T3 — Human staging and snapshot/message approval pending. Prior exact source candidate RDD declined; no lineage or source commit.
- [ ] T4 — Correct shared modal headers, contrast and decorative dot. In progress. Delegated writer: global styles, three consumers and regression checks. New source candidate requires its own review disposition.

## Checks and acceptance
Pure styling has no meaningful behavioral RED; preserve behavior tests and add meaningful structural/style checks. Run focused dialogs, full tests, production build and diff check. Use browser computed/layout checks if available; never claim pixel/keyboard/WCAG verification without execution. All checkboxes stay open until approved commit exists. No agent staging/commit.

## Evidence
- Initial clean HEAD `f89032f00d7c365a2d5f88c6f15d4886e68459ba`; tracking-only commit `edac7d0834f1c8e3e5074db84bf49931502c74f2` approved/acknowledged, later doc auto-commit blocked, manual staging required.
- Angular22 discovery/best practices loaded. Spartan inventory passed. Initial focused tests 55/4 files; independent full tests 324/37 files, build browser/server + one prerendered route and diff check passed, LF/CRLF warnings.
- Font public/package/dist license exact SHA-256 `e07fd1167c2aaaa6fb965dd66e1e73b13c9c95b76b2d648b6e938780f30b37af`; two WOFF2 subsets 49,076 bytes, license 4,534 bytes. Existing public copy rule sufficient, angular.json unchanged.
- Independent source review found no severe candidate-caused issue; functionality retained. Global font affects login/admin/overlays.
- Audit exit 1 reported high router advisory GHSA-ff3f-86qr-9cv3; router 22.1.7 unchanged from HEAD, advisory metadata not independently verified; remediation not authorized.
- Native assessment unassessable due untracked declaration; independent high-risk fallback verification performed. Source candidate `sha256:18895c4d6d4e004faaeec7f5639fa6bf0efed996d1af7e2c8505b04b13931e5b` medium, host consent declined, no lineage.
- Previous writer 391 additions/39 deletions including 93 copied license lines, excluding task doc. Advisory size forecast not a hard cap.
- Current resume: human staged all previous changed paths, HEAD still edac7d0. New corrections will be unstaged atop that staged snapshot; no staging or commit approval given.

## Next step
Finish T4 with narrow shared CSS/consumer/test changes, verify and review new candidate; human inspects rendered result and stages corrections before exact snapshot/message approval.
