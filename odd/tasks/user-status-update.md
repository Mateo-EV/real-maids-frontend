# Dedicated user status update

## Objective and scope
M02/RF02/HU02/P03: provide `updateUserStatusById(id, isActive)` through repository, shared in-memory source, stateless use case and store; route the confirmed status action through it. Preserve generic profile updates, dialog confirmation/errors/pending guards/cancellation, current profile fields and creation/access metadata. No backend, ACL or authentication changes.

## Tasks and routing
- [x] T1: Dedicated status operation and dialog wiring with test-first tests. Delegated writer (multi-file trigger).
- [x] T2: Focused/full tests, production build and independent verification. Delegated verification.
- [x] T3: Human-staged snapshot approval and work-unit commit.

## Evidence
- RED: five new source tests failed because the status operation was absent.
- GREEN: `npm test -- --watch=false --include='src/app/features/users/**/*.spec.ts' --include='src/app/core/config/app.config.spec.ts'`: 178 tests/16 files passed, independently repeated with no findings.
- Full `npm test -- --watch=false`: 323 tests/37 files passed (writer).
- `npm run build`: production browser/server build passed, one prerendered route (writer).
- `git diff --check`: passed; line-ending advisories only.
- Source looks up the latest user inside cancellable 250 ms latency, changes only isActive and updatedAt, returns defensive copies, handles missing records and preserves concurrent profile edits.
- Catalog revision rejects stale loads; retry sends the same desired boolean. Existing UI confirmation remains mandatory.
- Browser visual/responsive/keyboard checks remain unrun.

## Review and delivery
Native review was declined through the interactive host for candidate `sha256:8bf3934f3bbd910383320810e417af2832184e9a58b7ae5d6d674e511567ee9c`; no lineage or approval exists. Assessment was unavailable due to untracked-file scope; independent verification fulfilled its conservative plan.

Human approved one cohesive 17-file snapshot (+538/-14) and message `feat(users): add confirmed status updates by user id`; over-400-line size disclosed before approval. Approved HEAD `380b0ee4f12954c96b70369735a5c1d3ce86e702` and staged-diff SHA-256 `455d256fb9acf9ab5fa8615c22800a37ce19f09aa257a9fdff483f232a7cd229` were rechecked immediately before commit.

Work-unit commit: `033603604896e41b0a5d648d7b47e334c837c372` on main. Post-commit Git status was clean before this tracking update. No parent staging, push or PR performed. Separate earlier docs commits do not substitute for this implementation commit.

## Next step
Optional browser validation; push/PR require separate human authorization. No further implementation pending. Rollback boundary: the status action and dedicated pipeline/tests/docs in this work-unit commit, retaining unrelated users functionality.
