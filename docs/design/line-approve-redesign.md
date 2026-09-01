# Line-Approve Redesign — Concept & Decisions

> Status: **DISCUSSION / CONCEPT** (no code yet). Captures agreed design before Phase 1 planning.
> Tasks: T-018 (runtime follows configured line), T-026 (markup sweep after final approval). Depends on T-016 (line template, already scaffolded).
> Date started: 2026-09-01.

## 1. Problem

Current approval flow is **hardcoded**:
- Roles are fixed constants (`ROLES` in `src/lib/config/workflow.ts`).
- Runtime status machine (`RFA_TRANSITIONS`) drives the flow, NOT the configured line template — this is the T-018 gap.
- T-016 scaffolded a 2-level line template (Stage=Role "Phase A" shipped; Member=People "Phase B" defined but inert), but runtime ignores it.

Real usage (QConZol-style) needs: add roles without code changes, per-document approval line, and per-document choice of who acts vs who just observes.

## 2. Core model (agreed)

### 2.1 Behaviour groups (not permission atoms)
A role belongs to ONE behaviour group. Group = the role's default behaviour. Adding a new role = just assign it to a group.

| Group | Behaviour |
|---|---|
| **Creator** | Creates/opens the document |
| **Reviewer** | Reviews + comments before it reaches approval (does NOT gate) |
| **Approver** | Gates the document (must approve to advance) |

- Keep **all** existing roles — production is live, deleting is unsafe.
- The genuinely hard part is the **Approver side (CM / Designer / Owner)** — creation side is largely fine already.

### 2.2 Creator routing — "pass through Site?" flag  ✅ DECISION: Option A
When adding a Creator-group role, it has a switch: **"Must pass Site review first?"**
- `BIM` = **yes** (Create → Site review → Approver chain).
- `งานระบบ` / MEP / `งานไฟฟ้า` (electrical) etc. = **no** (Create → straight to Approver chain, no Reviewer phase).

Rationale: keeps roles dynamic — a new creator role just picks yes/no, no code change. (Option B "hardcode BIM-only" was rejected: any future review-requiring creator would need code.)

> Code already behaves this way today but via hardcoded `rfaType`+role: RFA-SHOP + (ME|SN) → straight to CM (`workflow.ts` ~line 838). The redesign moves this decision from hardcode → the per-role flag.

### 2.3 Send-time recipients: To / CC  ✅ DECISION: confirmed
Per-person action is NOT a permanent line-config setting. It is chosen **at each send (hop)**. When sending, the sender picks recipients:

| Recipient type | Can do | Gates the doc? |
|---|---|---|
| **To (ส่งถึง)** | Must act — approve, or review-and-forward | ✅ Yes — doc waits on them |
| **CC – acknowledge (รับทราบ)** | View only | ❌ No |
| **CC – comment (ร่วมคอมเมนต์)** | Comment, but cannot approve | ❌ No |

- The earlier "A reviews / B approves within CM" case = **A is CC–comment, B is To**.
- "To" always means the actor that advances the doc at this stage (reviewer-forward at a Reviewer stage, approver at an Approver stage).
- This **replaces** per-person permission overrides inside the line config — simpler, matches "choose recipients every time you send."

### 2.4 Line = default, send = fine-tune
- The configured **line template** = the default sequence + who should be at each stage.
- At each actual send, the sender may adjust the To/CC recipients on top of the default.
- Gating rule (agreed earlier): **Approvers gate; Reviewers comment in parallel, non-blocking.**

## 3. RFA vs RFI
- Shared **role registry** (one place to add roles).
- **Separate line/behaviour per module** (`LineModule = 'RFA' | 'RFI'`).
- Implement **RFA first**.

## 4. Scope guards
- Approval lines exist **only for INTERNAL projects** (`cmSystemType`). EXTERNAL short-circuits to no in-system chain.
- Never remove embedded `annotations.json` from approved PDFs (Excel export depends on it) — relevant to T-026.

## 5. Phased roadmap (agreed)
| Phase | Content |
|---|---|
| **P1** | Roles foundation — behaviour groups + Creator "pass Site?" flag (keep all existing roles) |
| **P2** | Runtime follows configured line (T-018 core) |
| **P3** | Sub-line + send-time To/CC recipients (per-document permission) |
| **P4** | Excel/CSV bulk import of doc-lists + lines (deferred) |
| **P5** | T-026 collaborative-markup cleanup after final approval |

## 6. Open items for Phase 1
- Where the "pass Site?" flag physically lives (role config vs group config).
- How the send-time To/CC selector maps onto the existing line-template stages.
- Migration path so live production roles keep working during rollout.

## 7. Implementation status
- **P1 Roles foundation — DONE (2026-09-01).** `src/lib/config/roleRegistry.ts` is now the single
  role source (leaf owning ROLES + behaviour-group registry + accessors `rolesInGroup` /
  `isInGroup` / `roleRequiresSiteReview`). `workflow.ts` re-exports ROLES/Role and derives the
  CREATOR/REVIEWER/APPROVER/EXTERNAL_APPROVER arrays from the registry — the ~40 consumer imports
  are unchanged. The "pass Site?" decision (§2.2) is now the per-role `requiresSiteReview` flag.
  - Routing decision taken: **Option B** — ME/SN (งานระบบ, `requiresSiteReview:false`) skip Site
    for ALL rfa types (an intentional change from the old RFA-SHOP-only skip; MAT/GEN now go
    straight to CM). BIM + other creators keep `true` (parity). Reviewer-forward branch unchanged.
  - Note: §2.2's "Option A" label refers to the *design approach* (per-role flag, not hardcode-BIM);
    §2.2's Option A/B and this routing Option A/B are different decisions — both resolved as above.
  - SE/FM/PD carry `groups:[]` (SE/FM are approved-doc observers; a dedicated observer group is
    likely P3 work). Verified: `npx tsc --noEmit` clean + `npx tsx scripts/test-role-registry.ts` green.
- P2–P5: not started.
