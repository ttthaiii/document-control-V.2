# MECE Plan — P1: Roles foundation (behaviour-group registry + Creator requiresSiteReview)

task: P1 roles foundation — central role registry (config-in-code) + requiresSiteReview flag, behaviour preserved
phase: in_progress
status: awaiting-user-confirm

## Phase 0 · Context (kept across compacts)
- Parent: T-018 (runtime follows configured line). P1 is its prerequisite (roles foundation).
- Design source of truth: docs/design/line-approve-redesign.md · gather: .sessions/gather_complete.md
- Decision locked: **Hybrid path, step 1 = config-in-code behind ONE central accessor** (DB/admin-UI is a later step of the SAME path, additive — not rework). Reason: design not yet frozen; code has compiler safety net; accessor makes the later DB swap touch one function, not 40 call sites.
- Constraints: keep ALL existing roles (production live) · preserve current runtime behaviour EXACTLY (parity) · INTERNAL-only chain (EXTERNAL untouched) · NO behaviour change unless user explicitly approves the one flagged decision below.
- Scope: RFA only (RFI later). No admin UI, no Firestore in P1.

### ⚠ Decision needed before Phase 3 (flagged to user)
Current `resolveSubmitRevisionStatus` (workflow.ts:837) routes by **(role + rfaType)**, NOT role alone:
- `RFA-SHOP` + (ME|SN) → skip Site → CM
- ME/SN on `RFA-MAT` / `RFA-GEN` → currently GO to Site (PENDING_REVIEW)
A per-role `requiresSiteReview` flag (ME/SN=false) would send ME/SN to CM for **all** rfaTypes → behaviour change for MAT/GEN.
- **Option A (pure parity):** registry flag replicates the exact (role,rfaType) matrix — zero behaviour change.
- **Option B (user's mental model):** ME/SN (งานระบบ) skip Site for ALL types.
→ ✅ USER CHOSE **B** (2026-09-01). งานระบบ (ME/SN) → CM directly for MAT/GEN/SHOP. This is an INTENTIONAL behaviour change for MAT/GEN (previously went to Site). S3 sets requiresSiteReview: BIM=true, ME/SN=false; S4 parity test asserts the NEW agreed matrix (BIM→Site all types; ME/SN→CM all types), NOT the old MAT/GEN-to-Site behaviour.

## Cycle grouping (all sequential — cycles of one, run inline in main context)
- Cycle 1: S1
- Cycle 2: S2   ← compact_checkpoint AFTER this (ceil(4/2)=2)
- Cycle 3: S3
- Cycle 4: S4

## Phase 3 · Sections

- [X] S1 · Role registry data structure
  File: src/lib/config/roleRegistry.ts (NEW)
  Skill: agent · Model: model_medium · MAIN (core config — sensitive, judgment)
  What: define `BehaviourGroup = 'creator'|'reviewer'|'approver'|'externalApprover'`; `RoleMeta { groups: BehaviourGroup[]; requiresSiteReview?: boolean }`; `ROLE_REGISTRY: Record<Role, RoleMeta>`. Seed EXACTLY from the current arrays (CREATOR/REVIEWER/APPROVER/EXTERNAL_APPROVER_ROLES) + set requiresSiteReview per the confirmed A/B decision. No consumer wiring yet.
  Verify-N:
    1. Every Role in ROLES appears in ROLE_REGISTRY (no missing role).
    2. Membership per group === original arrays (set-equal, verified in S4 test).
    3. tsc: no type error.

- [X] S2 · Central accessors + backward-compat derived views
  File: src/lib/config/roleRegistry.ts + src/lib/config/workflow.ts
  Skill: agent · Model: model_medium · MAIN (core routing surface)
  What: add accessors `rolesInGroup(group)`, `isInGroup(role, group)`, `roleRequiresSiteReview(role)`. Re-express `CREATOR_ROLES/REVIEWER_ROLES/APPROVER_ROLES/EXTERNAL_APPROVER_ROLES` in workflow.ts as `rolesInGroup(...)` derived views (so the 40 consumer files keep importing the same names, unchanged). Single source = registry.
  Verify-N:
    1. Derived arrays are set-equal to the pre-change literals (S4 assertion).
    2. No import cycle (roleRegistry must not import workflow if workflow imports it — put registry as the leaf; ROLES stays in workflow, registry imports ROLES/Role only).
    3. tsc + existing build passes.

- [X] S3 · Rewire creator routing to the flag
  File: src/lib/config/workflow.ts (resolveSubmitRevisionStatus)
  Skill: agent · Model: model_high · MAIN (delicate state-machine routing)
  What: replace the hardcoded `RFA-SHOP && (ME|SN)` / reviewer special-cases with `roleRequiresSiteReview(ctx.userRole)` per the confirmed A/B decision. Keep the reviewer-skip-site branch behaviour identical (or fold per decision).
  Verify-N:
    1. Parity matrix (S4): for every (userRole, rfaType, cmSystemType) combo, resolved status === pre-change status (Option A) OR === agreed new matrix (Option B).
    2. No other transition row changed.
    3. tsc + build passes.

- [X] S4 · Parity tests + verification
  File: scripts/test-role-registry.ts (NEW — no vitest/jest installed; follows project's tsx test:* pattern; run `npx tsx scripts/test-role-registry.ts`)
  Skill: agent · Model: model_low (delegate) · mechanical test-writing
  What: unit test — (a) derived arrays === original literals; (b) full (role×rfaType×system) routing matrix asserts parity (A) / agreed matrix (B); (c) every role has ≥1 group.
  Verify-N:
    1. All new tests pass.
    2. Full existing test suite still green (no regression).
    3. `[scope-creep] clean` — only the 3 declared files touched.

## Phase 3 Close Checklist
- [ ] all S1–S4 marked [X] with proof
- [ ] Verify-N passed each section (tsc + tests green)
- [ ] parity confirmed (no unintended behaviour change)
- [ ] R8 index sync (new file roleRegistry.ts + test → index_files.json)
- [ ] roadmap: register P1 under T-018 tree · active_thread phase:done
- [ ] docs/design/line-approve-redesign.md updated (P1 done, note A/B decision taken)
- [ ] scope-creep clean (only roleRegistry.ts, workflow.ts, test file)

## Phase 1–3 — cleared
status: task-complete
