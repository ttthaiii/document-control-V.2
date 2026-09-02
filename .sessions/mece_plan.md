# MECE Plan — T-018 P1 follow-up: create-path honours roleRequiresSiteReview

task: P1 follow-up — initial CREATE path uses roleRequiresSiteReview (parity with revision path)
phase: in_progress
status: awaiting-user-confirm
date: 2026-09-02

## Phase 0 · Context (kept across compacts)
- Parent: T-018. This closes the P1 scope gap found in the emulator test (ME first-create still went to Site).
- Design source: docs/design/line-approve-redesign.md §2.2 · gather: .sessions/gather_complete.md (2026-09-02).
- Decision (locked): Option B — ME/SN (requiresSiteReview:false) skip Site for ALL rfa types, on BOTH create and revision. P1 did the revision door; this does the create door.
- Constraint: touch ONLY the create route. No behaviour change for other roles (BIM etc. keep requiresSiteReview:true → Site). Reviewer branch stays identical (parity).
- Deferred to P2 (NOT this task): fold both doors into one shared resolveInitialStatus(ctx).

## Cycle grouping
- Cycle 1: S1 (single section, run inline in main context)

## Phase 3 · Sections

- [X] S1 · Rewire create-path Case 1 to the flag  (done 2026-09-02 · tsc clean · scrutinized · [✓ written])
  Context: create/route.ts sets a new RFA's first status outside RFA_TRANSITIONS; Case 1 still hardcodes RFA-SHOP&&ME/SN so ME on RFA-GEN goes to Site. Swap to the P1 flag so งานระบบ skips Site on first create too.
  File: src/app/api/rfa/create/route.ts
  Skill: agent · Model: model_high @ med · MAIN (delicate state-machine routing — same class as P1 S3)
  Tool: Edit
  Input_From: none
  Constraints: only the initial-status block (~204-220) + imports; do not touch reachedCmStatus, Case 2, seedChainFromTemplate, or the firestore write.
  Steps:
    [A] add import `roleRequiresSiteReview` from '@/lib/config/roleRegistry'
    [B] replace Case 1 condition `rfaType === 'RFA-SHOP' && isEngineer` → `!roleRequiresSiteReview(userRole as Role)` (keep initialStatus=reachedCmStatus + action label)
    [C] remove now-unused `const isEngineer = ...`
  Verify:
    [1] `npx tsc --noEmit` clean (exit 0)
    [2] grep create/route.ts: Case 1 predicate === `!roleRequiresSiteReview` (parity with workflow.ts); Case 2 + reachedCmStatus unchanged
  Rollback: git checkout src/app/api/rfa/create/route.ts
  Expected_Traces: [pre-read] [pre-edit] [✓ written] [scrutinized S1]
  Refusal_Path: [skill-refused] → halt

## Phase 3 Close Checklist
- [ ] S1 marked [X] with proof
- [ ] Verify-N passed (tsc clean + parity + scope)
- [ ] active_thread phase:done · next = P2
- [ ] user re-tests emulator (ME creates RFA-GEN → CM, not Site) — user-side confirm
- [ ] scope-creep clean (only src/app/api/rfa/create/route.ts)
