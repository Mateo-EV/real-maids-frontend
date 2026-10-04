# Temporary demo session restoration

## Intent and boundaries

M01/RF01/HU01/P01: `GetCurrentUserUseCase` delegates to `AuthRepository.me()`, `AuthStore.restoreSession()` updates session, and auth/guest guards wait before redirecting. User approved existing localStorage demo flag, not real auth/permanent persistence. DEMO_AUTH remains internal to auth-in-memory.source.ts; specs use local fixtures. Preserve original auth.demo.ts deletion and moved credentials. Core config spec authorized for obsolete import/fixture correction only. No HTTP/JWT/roles/UI/framework changes; retain root store lifetime, login/logout and safe returnUrl behavior. Browser storage fails closed on server/unavailability.

## Tasks

- [x] T1 (committed 274a6e2; delegated multi-file writer): Current-user/store/guards and tests; delayed restoration invalidated by logout/new successful login.
- [x] T2 (committed 274a6e2; delegated writer): README.md, docs/README.md, AGENTS.md current-status alignment and tests/build.
- [x] T3 (committed 274a6e2; parent/independent verifier): Checks complete, native review declined; human staged and approved the exact snapshot/message. HEAD and staged-diff identity matched immediately before commit.

## Work unit and delivery

One coherent behavior/tests/docs unit. Forecast 250–400 lines; native final behavior candidate 561 lines/15 files including original user edits. Strategy ask-on-risk; future PR slicing decision needed if publishing. No code-golf/scope reductions. Rollback restoration additions/tests/docs without undoing unrelated changes. Baseline/current HEAD: 773789a4ffbae8ba49a5b99994e68ae4c337485b, branch main. Implementation commit: 274a6e20e64242189e434cc0b68ef7f0787bef06, `feat(auth): restore temporary demo session before guard decisions` (16 files, 490 additions/98 deletions).

## Acceptance and evidence

Fresh demo session allows protected route; absent/error/empty lookup fails closed; guest guard waits too. Late restoration cannot resurrect logout or replace a newer login. Server/unavailable storage safe. Angular MCP unavailable; configured local npm scripts used.

Initial TS2307 obsolete-import compilation failure was not behavioral RED. After approved corrections: source RED 3 failures; guards RED 8 failures; focused GREEN 43 then 46; full 73/17 and build passed. Independent verifier reproduced full tests/build and found logout race.

Correction RED 7 failures/46 passes; GREEN 53 then 54 focused tests. Writer `npm test -- --watch=false`: 81 tests/17 files passed. Writer `npm run build`: browser/server passed, one route prerendered. Independent correction verifier `npm test -- --watch=false --include=src/app/features/auth/**/*.spec.ts`: 54 tests/8 files passed; `npm run build`: passed; no blocker. Full post-correction 81 count is writer evidence, not independently rerun. `git diff --check`: passed; CRLF warnings only. RED history not independently reproduced. Manual Chrome/Edge/Firefox and live hydration checks unrun. Writer model/effort unknown.

## Review and pending controls

Native preflight included new use-case/spec, excluded task log. High-risk 15 files/561 lines. User declined this candidate; confirmed declined_this_candidate, no lineage/receipt; future review enabled. ASSESS unavailable due untracked declaration limitation; high-equivalent plan required independent verification, satisfied above. No native approval claimed. Child Engram saves failed due multiple matching sessions; parent maintains mirror.

Human staged all 16 intended paths and explicitly approved their exact displayed diff and message. Approved base HEAD: 773789a4ffbae8ba49a5b99994e68ae4c337485b; approved staged binary-diff SHA-256: 6532aa3092758405eafb50497fa906e28fe16c81bedb032f41fbe15beaf08943. Both rechecked unchanged immediately before commit. Working tree was clean after commit. This post-commit task closure record remains an unstaged documentation update; no additional commit approved. No push/PR/merge authorized.

## Next step

Implementation complete and committed. Post-commit task closure document awaits human staging/approval if a follow-up documentation commit is desired. Manual browser/hydration validation remains an explicit follow-up; no push performed.
