task: T-018 P1 follow-up — create-path honours roleRequiresSiteReview
phase: done
next: START P2 — runtime follows the configured line template (not hardcoded RFA_TRANSITIONS). Includes folding the two initial-status doors (create/route.ts + workflow.ts resolveSubmitRevisionStatus) into one shared resolveInitialStatus(ctx). Fresh Phase 1+2 required.

## P1 follow-up RESULT (2026-09-02) — DONE ✅
- Fixed src/app/api/rfa/create/route.ts Case 1: `!roleRequiresSiteReview(userRole as Role)` (was hardcoded `RFA-SHOP && isEngineer`). ME/SN now skip Site on first create for ALL rfa types. isEngineer removed (unused). tsc clean, scrutinized.
- USER EMULATOR RE-TEST CONFIRMED 2026-09-02: ME creates RFA-GEN → enters CM line (PENDING_EXTERNAL_APPROVAL on INTERNAL site), NOT Site. Green.
- create-path Case1 predicate now === workflow.ts resolveSubmitRevisionStatus first line → policy single-source = roleRegistry. Function-shell duplication (two doors) still deferred to P2.
- User to commit+push app-code change + the 41 staged brain files (chore: carry harness work-brain via git for cross-machine handoff).

## Latent bug noted (NOT fixed — user chose to defer)
- src/components/rfa/RFADetailModal.tsx:1260 `document.category.categoryCode` has no guard (line 1264 site?.name does). White-screens when GET /api/rfa/[id] fails and modal falls back to initialDoc (list doc, no category object). Emulator-only trigger today (stale token after Auth-emulator restart); production-rare but possible on any GET failure. Fix = `document.category?.categoryCode || document.categoryName || 'N/A'`. User opted to leave it (not urgent). Candidate for Small-Tasks Pool if it recurs.

## What changed this session (2026-09-02)
1. Cross-machine handoff: .gitignore now lets the WORK BRAIN travel via git (.sessions/{active_thread,session_handoff,mece_plan,reflections}.md, docs/, knowledge/*.md, CODING_FAILURE_PATTERNS.md, REPO_MAP.md, INVARIANTS.md). Churny scratch stays ignored. 41 brain files staged; user to commit+push.
2. P1 follow-up create-path fix (above) — DONE + user-confirmed.

## P1 result (2026-09-01) — reference
- src/lib/config/roleRegistry.ts = leaf: ROLES + Role + ROLE_REGISTRY (role->behaviour groups + requiresSiteReview) + accessors rolesInGroup/isInGroup/roleRequiresSiteReview.
- workflow.ts re-exports ROLES/Role; CREATOR/REVIEWER/APPROVER/EXTERNAL_APPROVER_ROLES derived via rolesInGroup(). resolveSubmitRevisionStatus routes on roleRequiresSiteReview (Option B: ME/SN skip Site all types).
- SE/FM/PD groups:[] (approved-doc observers). tsc clean; scripts/test-role-registry.ts green.
