# MECE Plan — T-018-P2 · RFA line freeze + Acknowledge + unify initial-status (RFA-only)
task_id: T-018-P2
date: 2026-09-02
generated_at: 2026-09-02
task: P2 — RFA line freeze-after-send + Acknowledge (new) + unify initial-status door
skill: agent
status: awaiting-user-confirm

## Phase 0 — Boot (once per session · keep [X] on resume · reset on topic switch only)
- [X] B1: engine 1.37.0 resolved · SESSION_TOTAL tracked · CFP_COUNT=51
- [X] B2-B3: skill=agent · design closed in prior session
- [X] C0-C3: same-topic T-018, P1 follow-up complete → new task P2

---

## Phase 1 — Info Gather
- [X] G0: task clear (design fully agreed with user 2026-09-02)
- [X] G1: all touch-points scanned
- [X] G2: batch greps + targeted reads · verdicts emitted
- [X] G3: every section → file + Verify-N draft · [✓ gather]
- [X] gather_complete.md written 2026-09-02

### Files Read — Phase 1
| File | Why | Lines read |
|---|---|---|
| src/lib/config/workflow.ts | transitions + guards + resolvers | 755-844 |
| src/app/api/rfa/create/route.ts | initial-status dup | 195-264 |
| src/app/api/rfi/[id]/route.ts | ack + override handler pattern | 680-734 |

---

## Phase 2 — Plan
- [X] M1.5: dependency_map: [S1 → S2, S1 → S3, S1 → S4]  · risk_flags: [core workflow.ts edit]
       (permission-widening risk REMOVED — Acknowledge uses existing externalStepHolder guard, current holder only)
- [X] M2: sections 1:1 with concern · Model/Verify-N per section
- [X] M3: written using template · plan_lint passed
- [ ] M4: Skeptical Reviewer (auto at first Phase-3 edit) → [sr-done]
- [ ] M5: presented to user → confirm
- [X] M6: parent T-018 already on roadmap

### Files Read — Phase 2
| File | Why | Lines read |
|---|---|---|
| docs/session_templates/mece_plan_schema.md | template shape | 1-189 |

---

## SCOPE NOTE (user 2026-09-02)
- RFA ONLY this task. RFI EXT_OVERRIDE_LINE removal + dead-helper (applyLineOverride/OverrideStepInput/LineOverrideStepper) cleanup = SEPARATE follow-up task (do RFA first; if it breaks, only one breaks). Keep applyLineOverride helper in place — RFI still imports it.
- Acknowledge guard = externalStepHolder (whoever CURRENTLY holds the doc — e.g. doc under CM → only CM). NOT a new line-member guard.
- Acknowledge → REVISION_REQUIRED (same status as a site revision request) but DISTINGUISHABLE by the recorded workflow[] action (ACKNOWLEDGE vs REQUEST_REVISION) + its own audit event. No new status.
- Re-send after Acknowledge uses the existing SUBMIT_REVISION path (creatorOwner) → re-enters chain via resolveInitialStatus, NO rev bump (never routes through create_revision).

---

## Phase 3 — Execute

### Cycle grouping
Cycle 1 — serial   · agents: 1                    → S1  (core engine — everything depends on it)
Cycle 2 — parallel · agents: up to 3 · cap: 3     → S2, S3, S4  (different files · no shared write)
  Barrier: all cycle_2_*.json status:done → close

### Per-Section Invariants  (apply to EVERY S<N>)
- mece_plan.md dated today + T-018 roadmap [/] REQUIRED before any file edit
- [pre-edit] emit before every Edit · [✓ written] grep verify after every change
- Output Contracts: [post-read] ≤1 line · [✓ written] ≤1 line
- L4.5 PURGE after every tool result
- Keep ALL roles + statuses · EXTERNAL untouched · INTERNAL chain only · RFA ONLY (RFI unchanged this task)
- Marking rule — [X] ONLY when [✓ written] + Verify-N pass + [scrutinized S<N>]
TOKEN CHECK after every section · signal-box PRIMARY · real % = ceiling source

### S1 · T-018-P2 · workflow.ts engine (remove RFA override + add Acknowledge + extract resolveInitialStatus)   [Cycle 1 · serial · MAIN]
Context: Core RFA state engine — the single source everything else calls. Remove the RFA EXT_OVERRIDE_LINE transition row; add an ACKNOWLEDGE transition (guard externalStepHolder → REVISION_REQUIRED, INTERNAL, from PENDING_EXTERNAL_APPROVAL); extract the create-path initial-status logic into an exported resolveInitialStatus(ctx) that resolveSubmitRevisionStatus also calls.
Skill: agent
Model: model_high   (MAIN — core workflow engine = judgment; keep on main)
Input_From: none
File: src/lib/config/workflow.ts
Tool: Edit
Rollback: git checkout src/lib/config/workflow.ts
Data_Sent: remove L795-797 EXT_OVERRIDE_LINE row; add ACKNOWLEDGE row (guard externalStepHolder, to REVISION_REQUIRED); extract resolveInitialStatus(ctx) from resolveSubmitRevisionStatus + export it (leave applyLineOverride/OverrideStepInput in place — RFI still uses them)
Token: ~350 output
Constraints: → §Per-Section Invariants · PLUS: no new STATUS; no new guard (reuse externalStepHolder); existing transitions unchanged
Verify-N:
  Run: `grep -nE "EXT_OVERRIDE_LINE|ACKNOWLEDGE|resolveInitialStatus" src/lib/config/workflow.ts` && `npx tsc --noEmit 2>&1 | head`
  Expect: no RFA EXT_OVERRIDE_LINE row; ACKNOWLEDGE row present (externalStepHolder → REVISION_REQUIRED); resolveInitialStatus exported; tsc clean
- [ ] S1

### S2 · T-018-P2 · rfa/[id]/route.ts (remove override handler + add Acknowledge dispatch + audit)   [Cycle 2 · parallel]
Context: RFA action route. Delete the EXT_OVERRIDE_LINE side-effect handler + its applyLineOverride import; wire ACKNOWLEDGE through the table + record a distinct audit event + a workflow[] entry (action ACKNOWLEDGE); expose canAcknowledge (true only for the current external-step holder). Ack path must NOT touch create_revision.
Skill: agent
Model: model_medium
Input_From: cycle_1_S1.json
File: src/app/api/rfa/[id]/route.ts
Tool: Edit
Rollback: git checkout src/app/api/rfa/[id]/route.ts
Data_Sent: remove L386 EXT_OVERRIDE_LINE block + applyLineOverride/OverrideStepInput import; add canAcknowledge = canActExternalStep; ACKNOWLEDGE audit (logActivity) + workflow entry; no create_revision
Token: ~300 output
Constraints: → §Per-Section Invariants · PLUS: ack re-send reuses SUBMIT_REVISION path (no rev bump); ACKNOWLEDGE recorded distinctly from REQUEST_REVISION
Verify-N:
  Run: `grep -nE "EXT_OVERRIDE_LINE|ACKNOWLEDGE|canAcknowledge|create_revision" src/app/api/rfa/[id]/route.ts` && `npx tsc --noEmit 2>&1 | head`
  Expect: no EXT_OVERRIDE_LINE handler; ACKNOWLEDGE handled + audit + workflow entry; canAcknowledge present; no create_revision in ack path; tsc clean
- [ ] S2

### S3 · T-018-P2 · rfa/create/route.ts (call shared resolveInitialStatus)   [Cycle 2 · parallel]
Context: Replace the inline duplicated initial-status branch (L203,213-221) with a single call to the exported resolveInitialStatus() — behaviour identical, one source of truth.
Skill: agent
Model: model_low   (mechanical — swap dup for shared call)
Input_From: cycle_1_S1.json
File: src/app/api/rfa/create/route.ts
Tool: Edit
Rollback: git checkout src/app/api/rfa/create/route.ts
Data_Sent: replace inline reachedCmStatus/isReviewer branch with resolveInitialStatus(ctx)
Token: ~200 output
Constraints: → §Per-Section Invariants · PLUS: same status result for ME/SN (no-Site) + reviewer×MAT/GEN/SHOP cases
Verify-N:
  Run: `grep -n "resolveInitialStatus" src/app/api/rfa/create/route.ts` && `npx tsc --noEmit 2>&1 | head`
  Expect: create route calls resolveInitialStatus; inline dup gone; tsc clean; parity for the two case rows
- [ ] S3

### S4 · T-018-P2 · RFADetailModal.tsx (remove override button + add Acknowledge button)   [Cycle 2 · parallel]
Context: RFA detail UI. Remove the EXT_OVERRIDE_LINE button/stepper trigger; add an Acknowledge button shown while canAcknowledge (i.e. current holder at PENDING_EXTERNAL_APPROVAL), calling executeAction('ACKNOWLEDGE').
Skill: agent
Model: model_medium
Input_From: cycle_1_S1.json
File: src/components/rfa/RFADetailModal.tsx
Tool: Edit
Rollback: git checkout src/components/rfa/RFADetailModal.tsx
Data_Sent: remove L1292 override onClick + its LineOverrideStepper usage (RFA side only — leave the shared component file for RFI); add Acknowledge button gated on canAcknowledge
Token: ~300 output
Constraints: → §Per-Section Invariants · PLUS: button visibility driven by canAcknowledge from route
Verify-N:
  Run: `grep -nE "EXT_OVERRIDE_LINE|ACKNOWLEDGE|canAcknowledge" src/components/rfa/RFADetailModal.tsx` && `npx tsc --noEmit 2>&1 | head`
  Expect: no override button; Acknowledge button present + gated on canAcknowledge; tsc clean
- [ ] S4

---

## Phase 3 — Close Checklist
- [ ] all S1-S4 marked [X] with [✓ written] + Verify-N proof
- [ ] `grep -rn "EXT_OVERRIDE_LINE" src/lib/config/workflow.ts src/app/api/rfa src/components/rfa` → zero (RFA side only; RFI still has it by design)
- [ ] `npx tsc --noEmit` clean
- [ ] scripts/test-role-registry.ts green
- [ ] scope-creep clean (only the 4 declared RFA files)
- [ ] FULL scrutinize at close
- [ ] active_thread phase:done · next = RFI-parity follow-up + P3
- [ ] user re-tests on emulator (CM Acknowledge releases doc → creator re-sends same rev; override button gone; workflow shows ACKNOWLEDGE distinct from REQUEST_REVISION)
- [ ] roadmap: add follow-up task "RFI EXT_OVERRIDE_LINE removal + dead-helper cleanup"
- [ ] Close via PATH A (clear Phase 1-3, keep Phase 0)

## Close Path — PATH A (task complete) — clear Phase 1-3, keep Phase 0.
