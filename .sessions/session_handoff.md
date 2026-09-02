skill: agent
CFP_COUNT: (unchanged this session)
task: T-018 P1 follow-up — create-path honours roleRequiresSiteReview
objective: Make the initial CREATE status path skip Site for งานระบบ (ME/SN, requiresSiteReview:false) for ALL rfa types, matching the revision path fixed in P1 (policy single-source = roleRegistry).
outcome: DONE + user-confirmed in emulator.
changes:
  - src/app/api/rfa/create/route.ts: Case 1 predicate `rfaType==='RFA-SHOP' && isEngineer` → `!roleRequiresSiteReview(userRole as Role)`; added import from '@/lib/config/roleRegistry'; removed unused isEngineer. Case 2 + reachedCmStatus untouched.
validation:
  - npx tsc --noEmit → exit 0 (clean)
  - scrutinize 4-pass: outsider clean · trace holds (ME→PENDING_EXTERNAL_APPROVAL; BIM→Site) · verify holds · simpler-way = predicate swap is simplest in-scope, full resolveInitialStatus() consolidation deferred to P2
  - USER emulator re-test 2026-09-02: ME creates RFA-GEN → enters CM line (not Site). Green.
resume_at: P2 (fresh Phase 1+2) — runtime follows configured line template; fold both initial-status doors into one shared resolveInitialStatus(ctx).
mece_plan_hash: (P1 follow-up plan, S1 [X] — to be cleared via PATH A)
open_items:
  - User to commit+push: app-code change + 41 staged harness brain files.
  - Latent (deferred by user): RFADetailModal.tsx:1260 unguarded document.category.categoryCode → Small-Tasks Pool candidate.
