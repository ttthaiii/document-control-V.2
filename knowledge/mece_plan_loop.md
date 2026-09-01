# MECE Plan Loop (the "blueprint room")

> **Type:** knowledge · **Topic:** mece_plan_loop · **Created:** 2026-06-24 (T-266) · **Origin:** AGENTS.md §Phase 2 MECE Plan

Phase 2 of the harness loop is where the agent stops gathering information and starts designing the work. Think of it like a blueprint room: before any construction begins, the plan is drawn on paper, reviewed by the owner, and approved — only then can tools be picked up. The MECE Plan loop runs **once per task** (skipped on resume if a valid plan already exists), and its job is to turn a vague goal into a section-by-section, verifiable, rollback-safe plan that every subsequent step can follow literally.

The whole point: **a plan that lives only in the agent's head is a plan that can change without anyone noticing.** Writing it to `mece_plan.md` from the schema (not from memory) is the act that makes the plan real.

---

## The 7-stage cycle

```
[M1] Read SKILL.md
       ↓
[M1.5] dependency_map + risk_flags + compact_checkpoint
       ↓
[M2] Build plan + Verify-N
       ↓
[M3] Read schema → Write gather_complete.md + mece_plan.md
       ↓
[M4] Optional Skeptical Reviewer  ──→ (if risk_flags non-empty)
       ↓
[M5] Present plan → User confirms
       ↓
[M6] Roadmap T-N entries
       ↓
[M7] [✓ MECE] + mece-compact prompt
```

**Legend:**
- 🟢 **ENFORCED** — a hook, gate, or mandatory-emit will BLOCK you (or auto-fire) if you skip it.
- 🟡 **ADVISORY** — currently on the honor system (remembered, not enforced). Naming it 🟡 is a forcing function: it flags a future gap to close.

| # | Stage | Status | Enforced by (real artifact) |
|---|---|---|---|
| M1 | **Read MECE SKILL.md** | 🟢 | B3 boot mandates skill read; CFP-044 blocks skill invoked from memory (never loaded) |
| M1.5 | **dependency_map + risk_flags + compact_checkpoint** | 🟡 | Advisory — agent must emit these to mece_plan.md M1.5 block; no hook blocks a missing M1.5 yet |
| M2 | **Build plan + Verify-N** | 🟢 | Phase-gate (`PreToolUse hook`) blocks any Edit/Write to `src/` unless `mece_plan.md` is dated today with Phase 0-3 blocks; Verify-N required per section or plan is incomplete |
| M3 | **Read schema → Write mece_plan.md** | 🟢 | CFP-019: writing from memory = violation; must Read `mece_plan_schema.md` first → copy structure → fill task content. Phase-gate enforces dated file. M3 verify: `grep -c "## Phase 2"` + `grep -c "## Phase 3"` must both pass |
| M4 | **Optional Skeptical Reviewer** | 🟡 | Advisory — spawned when risk_flags non-empty; verdict (go/revise/reject) returned before plan is shown |
| M5 | **Present plan → User confirms** | 🟢 | Write-Before-Present contract (CFP-027): Write tool must be called for `gather_complete.md` + `mece_plan.md` BEFORE the plan is shown — plan presented without files written = blocked |
| M6 | **Roadmap parent Task** | 🟡 | Advisory — the parent §6.2 Task on the roadmap (big-task-only · NEVER per section); usually already registered → verified at M7 by agent grep, not a hard hook |
| M7 | **[✓ MECE] + mece-compact prompt** | 🟢 | M3 verify gate (agent-level block): mece-schema-check must emit `Phase2:ok · Verify-N:ok · checkpoint:ok · close-checklist:ok` before [✓ MECE] is allowed; gap found → rewrite → re-assess |

---

## The principle

> **A plan written from the schema and confirmed by the user is the harness's contract — everything else is just notes.**

Phases 3 through close all assume the plan in `mece_plan.md` is the authoritative source of truth. If the plan was written from memory (CFP-019) or presented before being written (CFP-027), that source of truth is corrupted from the start. The schema read and the write-before-present rule both happen at M3 — those are the two moments that keep the contract honest.

---

## Re-render the cycle

```svg
<svg viewBox="0 0 680 520" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
  <!-- title -->
  <text x="200" y="18" text-anchor="middle" font-size="15" font-weight="700" fill="#1a2a3a">MECE Plan Loop — Phase 2</text>
  <!-- vertical spine -->
  <line x1="200" y1="40" x2="200" y2="494" stroke="#cbd5d0" stroke-width="2" stroke-dasharray="4 6"/>
  <!-- arrowheads down the spine -->
  <g fill="#9aa7a0">
    <polygon points="-5,-7 5,-7 0,7" transform="translate(200,76)"/>
    <polygon points="-5,-7 5,-7 0,7" transform="translate(200,136)"/>
    <polygon points="-5,-7 5,-7 0,7" transform="translate(200,196)"/>
    <polygon points="-5,-7 5,-7 0,7" transform="translate(200,256)"/>
    <polygon points="-5,-7 5,-7 0,7" transform="translate(200,316)"/>
    <polygon points="-5,-7 5,-7 0,7" transform="translate(200,376)"/>
    <polygon points="-5,-7 5,-7 0,7" transform="translate(200,436)"/>
  </g>
  <!-- M1 -->
  <rect x="60" y="22" width="280" height="52" rx="8" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2"/>
  <text x="200" y="44" text-anchor="middle" font-weight="700" font-size="13" fill="#1a3a2a">M1 · Read MECE SKILL.md</text>
  <text x="200" y="62" text-anchor="middle" font-size="10" fill="#3a5a4a">🟢 CFP-044 blocks memory-invoke</text>
  <!-- M1.5 -->
  <rect x="60" y="82" width="280" height="52" rx="8" fill="#fdf6e3" stroke="#c8a520" stroke-width="2"/>
  <text x="200" y="104" text-anchor="middle" font-weight="700" font-size="13" fill="#1a3a2a">M1.5 · dep_map + risk_flags + checkpoint</text>
  <text x="200" y="122" text-anchor="middle" font-size="10" fill="#6b5800">🟡 advisory — no hook yet</text>
  <!-- M2 -->
  <rect x="60" y="142" width="280" height="52" rx="8" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2"/>
  <text x="200" y="164" text-anchor="middle" font-weight="700" font-size="13" fill="#1a3a2a">M2 · Build plan + Verify-N</text>
  <text x="200" y="182" text-anchor="middle" font-size="10" fill="#3a5a4a">🟢 phase-gate blocks src/ edit w/o dated plan</text>
  <!-- M3 -->
  <rect x="60" y="202" width="280" height="52" rx="8" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2"/>
  <text x="200" y="224" text-anchor="middle" font-weight="700" font-size="13" fill="#1a3a2a">M3 · Read schema → Write mece_plan.md</text>
  <text x="200" y="242" text-anchor="middle" font-size="10" fill="#3a5a4a">🟢 CFP-019/027 · write-before-present</text>
  <!-- M4 -->
  <rect x="60" y="262" width="280" height="52" rx="8" fill="#fdf6e3" stroke="#c8a520" stroke-width="2"/>
  <text x="200" y="284" text-anchor="middle" font-weight="700" font-size="13" fill="#1a3a2a">M4 · Skeptical Reviewer (optional)</text>
  <text x="200" y="302" text-anchor="middle" font-size="10" fill="#6b5800">🟡 fires when risk_flags non-empty</text>
  <!-- M5 -->
  <rect x="60" y="322" width="280" height="52" rx="8" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2"/>
  <text x="200" y="344" text-anchor="middle" font-weight="700" font-size="13" fill="#1a3a2a">M5 · Present plan → User confirms</text>
  <text x="200" y="362" text-anchor="middle" font-size="10" fill="#3a5a4a">🟢 CFP-027 · present the written file</text>
  <!-- M6 -->
  <rect x="60" y="382" width="280" height="52" rx="8" fill="#fdf6e3" stroke="#c8a520" stroke-width="2"/>
  <text x="200" y="404" text-anchor="middle" font-weight="700" font-size="13" fill="#1a3a2a">M6 · Roadmap T-N entries</text>
  <text x="200" y="422" text-anchor="middle" font-size="10" fill="#6b5800">🟡 advisory — agent grep verify only</text>
  <!-- M7 -->
  <rect x="60" y="442" width="280" height="52" rx="8" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2"/>
  <text x="200" y="464" text-anchor="middle" font-weight="700" font-size="13" fill="#1a3a2a">M7 · [✓ MECE] + mece-compact prompt</text>
  <text x="200" y="482" text-anchor="middle" font-size="10" fill="#3a5a4a">🟢 mece-schema-check must pass first</text>
</svg>
```

---

## Related

- **MECE skill definition (the source of M1-M7 steps):** [.agents/skills/harness/mece/SKILL.md](./../.agents/skills/harness/mece/SKILL.md) — full M1-M7 execution protocol, plan format, size caps, Verify patterns.
- **Schema the agent MUST read at M3:** [docs/session_templates/mece_plan_schema.md](./../docs/session_templates/mece_plan_schema.md) — Phase 0-3 block template, Surgical Scope section, Close Checklist, PATH A/B/C.
- **The live plan artifact (written at M3, consumed by Phase 3):** [.sessions/mece_plan.md](./../.sessions/mece_plan.md) — check here to see the current task's section status `[ ]`/`[/]`/`[X]`.
- **Sibling loops:** [[boot_loop]] · [[per_turn_routing_loop]] · [[info_gather_loop]] · [[react_execution_loop]] · [[token_tracking_loop]] · [[session_close_loop]] · [[error_debug_loop]] · [[self_improvement_loop]]
- **Catalog:** [knowledge/loops_catalog.md](loops_catalog.md) — the hub linking all loops.

---

## index_files.json entry stub

```json
"knowledge/mece_plan_loop.md": {
  "type": "knowledge",
  "topic": "mece_plan_loop",
  "summary": "Documents the Phase 2 MECE Plan loop (M1–M7): read skill, build plan, write mece_plan.md from schema, optional skeptical reviewer, get user confirm, roadmap entries, emit [✓ MECE].",
  "references": [
    ".agents/skills/harness/mece/SKILL.md",
    "docs/session_templates/mece_plan_schema.md",
    ".sessions/mece_plan.md",
    "AGENTS.md",
    "Implement/04_skills.md"
  ],
  "related": [],
  "backlinks": []
}
```
