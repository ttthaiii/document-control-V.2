# Session-Close Loop (the "exit checklist")

> **Type:** knowledge · **Topic:** session_close_loop · **Created:** 2026-06-24 (T-266) · **Origin:** AGENTS.md §Completion Gate + §Phase 3 Close

When a task finishes — all MECE sections marked [X] — the harness does not simply stop. It runs a short, ordered checklist that saves exactly enough state for the next session to pick up where this one left off, clears the old plan so it cannot bleed into a new task, and trims the context window so future reads stay cheap. Think of it like a pilot's pre-shutdown procedure: you don't just cut the engine; you go through each switch in order so the plane is clean and ready for the next flight.

The loop exists because skipping any one step breaks the next session's boot in a predictable way: missing `session_handoff.md` → boot has no resume hint; missing `compact_state.md` → /compact cannot restore the skill; a stale `mece_plan.md` → C2 thinks the old task is still in progress.

---

## The 8-stage cycle

```
all [X] in mece_plan.md
        │
        ▾
(1) close-gate check ──▸ (2) scope-creep gate ──▸ (3) Verify-N + artifact review
        │                                                       │
        ▾                                                       ▾
(4) Write session_handoff.md ◂─────────────────────────────────┘
        │
        ▾
(5) Write compact_state.md
        │
        ▾
(6) /compact  (+ trim_exec_log · token_log.jsonl)
        │
        ▾
(7) PATH A — clear mece_plan.md Phase 1-3  (Phase 0 kept)
        │
        ▾
(8) Write active_thread.md  phase: done
        │
        ▾
    session closed ✅
```

| # | Stage | Status | Enforced by (real artifact) |
|---|---|---|---|
| 1 | **close-gate check** | 🟢 | `AGENTS.md §Completion Gate` — mandatory `[close-gate-check]` emit before any close action; CFP-037 bans auto-close; gate fires when any of: user typed /compact · SESSION>80k · LOOP_WEIGHT>50 |
| 2 | **scope-creep gate** | 🟢 | `scripts/posttool_track.py` captures `.sessions/.scope_baseline` at Phase 1; any undeclared changed file emits `[scope-creep]` and BLOCKs [X] mark until justified |
| 3 | **Verify-N + artifact review** | 🟢 | Verify-N in `mece_plan.md` (inline bash or MODEL_LOW reviewer); `scripts/skill_gate.py` HARD-BLOCKS `phase: done` if a review was demanded without loading the `scrutinize` skill (T-263 · CFP-044) |
| 4 | **Write session_handoff.md** | 🟡 | Advisory — agent writes `skill_name + CFP_COUNT + task + mece_plan_hash`; no hook BLOCKs the skip, but missing file causes `[plan-stale]` at next boot's staleness gate (V3) |
| 5 | **Write compact_state.md** | 🟡 | Advisory — agent writes `dt/sk/sk_h/mece_h/p3/section/step` + resets `LOOP_WEIGHT=0`; missing file means /compact cannot emit `[compact-restore]` at next boot |
| 6 | **/compact + pre-compact cleanup** | 🟢 | `scripts/trim_exec_log.py` + `token_log.jsonl` session_summary written before /compact; TOKEN PAUSE gate (60-80k) prevents skipping on heavy sessions |
| 7 | **PATH A — clear mece_plan.md Phase 1-3** | 🟢 | exact command locked in `docs/session_templates/mece_plan_schema.md §PATH A`; CFP-025 requires Phase 0 preserved; C2 re-routing depends on this being clear |
| 8 | **Write active_thread.md phase: done** | 🟢 | Done-criteria checklist in `AGENTS.md §Completion Gate` — `active_thread phase:done` is a required item; boot's C1 reads this to decide fresh-start vs resume |

**Legend:**
- 🟢 **ENFORCED** — a hook, gate, or mandatory-emit will BLOCK you (or auto-fire) if you skip it.
- 🟡 **ADVISORY** — currently on the honor system (remembered, not enforced). Naming it 🟡 is a forcing function: it flags a future gap to close.

> Note: stages 4 and 5 are 🟡 because no PreToolUse hook currently blocks `phase: done` if the files are absent. The downstream consequence (broken boot) acts as a soft penalty, but there is no hard block equivalent to the scope-creep or skill_gate enforcers.

---

## The principle

> **Every exit step must be written in order, or the next session starts broken.**

The session-close loop is the mirror of the boot sequence: boot reads what close wrote. If any step is skipped, the asymmetry shows up at the next boot — a stale plan re-routes the agent mid-task, a missing compact state loses the resume hint, or a dirty context window makes the first response expensive. Ordering matters: `session_handoff.md` must exist before /compact because the SessionStart:compact hook reads it to emit `[compact-restore]`.

---

## Re-render the cycle

```svg
<svg viewBox="0 0 520 620" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
  <!-- vertical spine -->
  <line x1="260" y1="30" x2="260" y2="590" stroke="#cbd5e0" stroke-width="2" stroke-dasharray="4 6"/>

  <!-- nodes -->
  <!-- trigger -->
  <rect x="140" y="10" width="240" height="34" rx="8" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.5"/>
  <text x="260" y="32" text-anchor="middle" font-size="12" font-weight="700" fill="#1e293b">all [X] in mece_plan.md</text>

  <!-- 1 close-gate -->
  <rect x="120" y="66" width="280" height="38" rx="8" fill="#dcfce7" stroke="#22c55e" stroke-width="2"/>
  <text x="260" y="82" text-anchor="middle" font-size="12" font-weight="700" fill="#14532d">1 · close-gate check</text>
  <text x="260" y="96" text-anchor="middle" font-size="10" fill="#166534">🟢 AGENTS.md §Completion Gate · CFP-037</text>

  <!-- 2 scope-creep -->
  <rect x="120" y="126" width="280" height="38" rx="8" fill="#dcfce7" stroke="#22c55e" stroke-width="2"/>
  <text x="260" y="142" text-anchor="middle" font-size="12" font-weight="700" fill="#14532d">2 · scope-creep gate</text>
  <text x="260" y="156" text-anchor="middle" font-size="10" fill="#166534">🟢 posttool_track.py · .scope_baseline</text>

  <!-- 3 verify -->
  <rect x="120" y="186" width="280" height="38" rx="8" fill="#dcfce7" stroke="#22c55e" stroke-width="2"/>
  <text x="260" y="202" text-anchor="middle" font-size="12" font-weight="700" fill="#14532d">3 · Verify-N + artifact review</text>
  <text x="260" y="216" text-anchor="middle" font-size="10" fill="#166534">🟢 skill_gate.py (T-263) · scrutinize skill</text>

  <!-- 4 session_handoff -->
  <rect x="120" y="246" width="280" height="38" rx="8" fill="#fef9c3" stroke="#eab308" stroke-width="2"/>
  <text x="260" y="262" text-anchor="middle" font-size="12" font-weight="700" fill="#713f12">4 · Write session_handoff.md</text>
  <text x="260" y="276" text-anchor="middle" font-size="10" fill="#854d0e">🟡 advisory — boot V3 staleness gate</text>

  <!-- 5 compact_state -->
  <rect x="120" y="306" width="280" height="38" rx="8" fill="#fef9c3" stroke="#eab308" stroke-width="2"/>
  <text x="260" y="322" text-anchor="middle" font-size="12" font-weight="700" fill="#713f12">5 · Write compact_state.md</text>
  <text x="260" y="336" text-anchor="middle" font-size="10" fill="#854d0e">🟡 advisory — compact-restore depends on it</text>

  <!-- 6 compact -->
  <rect x="120" y="366" width="280" height="38" rx="8" fill="#dcfce7" stroke="#22c55e" stroke-width="2"/>
  <text x="260" y="382" text-anchor="middle" font-size="12" font-weight="700" fill="#14532d">6 · /compact + trim_exec_log</text>
  <text x="260" y="396" text-anchor="middle" font-size="10" fill="#166534">🟢 TOKEN PAUSE gate · token_log.jsonl</text>

  <!-- 7 PATH A -->
  <rect x="120" y="426" width="280" height="38" rx="8" fill="#dcfce7" stroke="#22c55e" stroke-width="2"/>
  <text x="260" y="442" text-anchor="middle" font-size="12" font-weight="700" fill="#14532d">7 · PATH A — clear mece_plan Phase 1-3</text>
  <text x="260" y="456" text-anchor="middle" font-size="10" fill="#166534">🟢 mece_plan_schema.md §PATH A · CFP-025</text>

  <!-- 8 active_thread -->
  <rect x="120" y="486" width="280" height="38" rx="8" fill="#dcfce7" stroke="#22c55e" stroke-width="2"/>
  <text x="260" y="502" text-anchor="middle" font-size="12" font-weight="700" fill="#14532d">8 · active_thread.md phase: done</text>
  <text x="260" y="516" text-anchor="middle" font-size="10" fill="#166534">🟢 Done-criteria checklist · AGENTS.md §Completion Gate</text>

  <!-- session closed -->
  <rect x="160" y="546" width="200" height="34" rx="8" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5"/>
  <text x="260" y="567" text-anchor="middle" font-size="12" font-weight="700" fill="#0c4a6e">session closed ✅</text>

  <!-- arrows -->
  <g stroke="#64748b" stroke-width="1.5" fill="#64748b">
    <line x1="260" y1="44" x2="260" y2="64"/>  <polygon points="255,60 265,60 260,66"/>
    <line x1="260" y1="104" x2="260" y2="124"/> <polygon points="255,120 265,120 260,126"/>
    <line x1="260" y1="164" x2="260" y2="184"/> <polygon points="255,180 265,180 260,186"/>
    <line x1="260" y1="224" x2="260" y2="244"/> <polygon points="255,240 265,240 260,246"/>
    <line x1="260" y1="284" x2="260" y2="304"/> <polygon points="255,300 265,300 260,306"/>
    <line x1="260" y1="344" x2="260" y2="364"/> <polygon points="255,360 265,360 260,366"/>
    <line x1="260" y1="404" x2="260" y2="424"/> <polygon points="255,420 265,420 260,426"/>
    <line x1="260" y1="464" x2="260" y2="484"/> <polygon points="255,480 265,480 260,486"/>
    <line x1="260" y1="524" x2="260" y2="544"/> <polygon points="255,540 265,540 260,546"/>
  </g>
</svg>
```

---

## Related

- **Close trigger + gate definition:** [AGENTS.md](../AGENTS.md) §Completion Gate — the canonical source for the close-gate check, scope-creep gate, Verify-N routing, and Done-criteria checklist.
- **Phase 3 Close sequence (compact form):** [CLAUDE.md](../CLAUDE.md) §Phase 3 Close — 4-step ordered sequence (verify [X] → handoff → compact_state → /compact → PATH A).
- **Session state written at close:** [.sessions/session_handoff.md](../.sessions/session_handoff.md) + [.sessions/compact_state.md](../.sessions/compact_state.md) — the two files close writes and boot reads.
- **PATH A command (mece_plan clear):** [docs/session_templates/mece_plan_schema.md](../docs/session_templates/mece_plan_schema.md) §PATH A — exact command locked here to prevent CFP-025 recurrence.
- **Index auto-reconcile at session close:** [scripts/index_reconcile.py](../scripts/index_reconcile.py) — Stop-hook runs this idempotent reconciler so any missed manual index update is caught, not lost.
- **Scope baseline capture:** [scripts/posttool_track.py](../scripts/posttool_track.py) — writes `.sessions/.scope_baseline` at Phase 1 gather; drives the scope-creep gate at close.
- **Artifact review enforcement:** [scripts/skill_gate.py](../scripts/skill_gate.py) — HARD-BLOCKS `phase: done` if a review was demanded without loading `scrutinize` (T-263 · CFP-044).
- **Sibling loops:** [[boot_loop]] · [[per_turn_routing_loop]] · [[info_gather_loop]] · [[mece_plan_loop]] · [[react_execution_loop]] · [[token_tracking_loop]] · [[error_debug_loop]] · [[self_improvement_loop]]
- **Catalog:** [knowledge/loops_catalog.md](loops_catalog.md) — the hub linking all loops.

---

## index_files.json entry stub

```json
"knowledge/session_close_loop.md": {
  "type": "knowledge",
  "topic": "session_close_loop",
  "summary": "Documents the 8-stage session-close loop: close-gate check → scope-creep gate → Verify-N → write session_handoff.md → write compact_state.md → /compact → PATH A clear mece_plan → active_thread phase:done.",
  "references": [
    "AGENTS.md",
    "CLAUDE.md",
    ".sessions/session_handoff.md",
    ".sessions/compact_state.md",
    "docs/session_templates/mece_plan_schema.md",
    "scripts/index_reconcile.py",
    "scripts/posttool_track.py",
    "scripts/skill_gate.py"
  ],
  "related": [],
  "backlinks": []
}
```
