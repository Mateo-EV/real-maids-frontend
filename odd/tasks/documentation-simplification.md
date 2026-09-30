# Documentation simplification

## Objective and approved scope
Consolidate project documentation into README.md (Spanish), AGENTS.md (English), and docs/README.md (English). Describe project purpose, internal operations and the customer portal, planned modules and journeys, business states, and a concise implemented/planned distinction. Preserve useful existing requirement/module/screen identifiers and essential accepted technical constraints. Remove superseded documentation and ADRs after incorporating their relevant constraints. Keep MCP guidance agent-agnostic with availability-based fallback.

## Constraints
No source or configuration edits, new product scope, invented API contracts, staging, or commits without human approval. Leave existing untracked .codegraph/ unchanged. Documentation has no meaningful RED/GREEN test; use structural and source/configuration consistency checks instead.

## Tasks
- [x] T1 Consolidate the three approved documents and remove superseded docs. Implementation verified. Delegated writer consolidated the documents; parent removed the exact 22 approved superseded files because the writer role prohibited deletion.
- [x] T2 Independently verify links, scope preservation, language, and consistency with source/configuration. Verified by independent read-only verifier; no findings.
- [ ] T3 Obtain human staging and explicit staged snapshot/message approval before committing. Pending human decision; parent owned. Work-unit delivery remains open until an approved commit exists.

## Acceptance criteria
README.md is Spanish; AGENTS.md and docs/README.md are English. Product scope retains internal operations and customer portal. Essential architecture/security rules remain accessible once. MCP instructions do not assume Codex configuration exists. Superseded files have no remaining broken references. Demo functionality is not described as production-ready. Open product questions remain open.

## Delivery
One documentation work unit; no PR or publishing authorized. Estimated changed lines exceed 400 mainly due to retiring legacy documentation; the user explicitly approved consolidation and deletion as one coherent scope. Reassess review workload before any proposed delivery. Commit and native review: pending.

## Evidence and next step
Initial git status: only untracked .codegraph/. No pre-existing tracked edits. Angular MCP list_projects is unavailable in this session. Engram tools are not currently exposed; memory mirror pending. Writer checks passed: git diff --check, relative links, language/constraints and source consistency; no builds/tests required for passive docs. Parent removed 22 superseded tracked documents, leaving docs/README.md. Independent final verification passed: git diff --check (only line-ending warnings), zero broken relative links, no remaining deleted-document or Codex-config references, source/config and original-scope comparison with no actionable findings. Builds/tests skipped because the change is passive documentation. No staging or commit performed. Next: human review and optional staging/commit authorization.
