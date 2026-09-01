# Info Gather Loop (the "blueprint check before building")

> **Type:** knowledge · **Topic:** info_gather_loop · **Created:** 2026-06-24 (T-266) · **Origin:** AGENTS.md §Phase 1 Info Gather

Phase 1 runs once per task, right after Per-Turn Routing (C0–C3) and before any planning or code changes. Its job is to make sure the agent fully understands *what* to build and *where* — before touching a single file. Think of a contractor who, before swinging a hammer, walks the site with the blueprint, marks every wall that's affected, and calls the client if anything is unclear. That walkthrough is Phase 1.

The loop fires on every new task or topic switch. It ends when `gather_complete.md` is written today and contains all five required fields. Those two facts (file exists, dated today) are checked by the **PreToolUse phase-gate hook** in `.claude/settings.json` — any Edit/Write to `src/` is **blocked** until both Phase 1 and Phase 2 are current.

---

## The 4-stage cycle

```
[G0] Clarity Gate
     (skip if task is already specific enough)
          │
          ▼
[G1] One-Pass Scan ──── scan ALL sections in one pass
          │              output: missing_files[] + missing_user_input[]
          ▼
[G2] Batch Grep + Read ─ ONE Bash call, ALL greps
          │              targeted Read per discovered item
          ▼
[G3] Assess ──────────── confirm 5 fields complete
          │              if still missing → single user-ask (max 1 per Phase 1)
          ▼
    [✓ gather] ──────── write gather_complete.md (today-dated)
```

| # | Stage | Status | Enforced by (real artifact) |
|---|---|---|---|
| G0 | **Clarity Gate** — ask Goal/Affected area/Constraints/DoD before scanning; skip if ≥3 specifics already in the request; forced on by `scope_grill=armed` (C0 Q4) | 🟡 | Advisory — honor-system skip logic; `scope_grill=armed` flag set by `scripts/review_intent.py` (UserPromptSubmit). Refusal contract (`[gather-refused]` after 2 rounds) is agent-emitted, not hook-blocked. |
| G1 | **One-Pass Scan** — read every SKILL.md section header in one pass; produce `missing_files[]` + `missing_user_input[]` | 🟡 | Advisory — rule is "never one section at a time" (AGENTS.md §Phase 1, Implement/03_config.md §Gather rules); no hook auto-fires if violated. |
| G2 | **Batch Grep + Read** — all greps in **one** Bash call; targeted `Read offset+limit` per item; `on_demand_files` from manifest used here (never at boot) | 🟡 | Advisory — "G2 = 1 Bash call" rule in AGENTS.md §Phase 1; no hook blocks a multi-call violation directly. |
| G3 | **Assess + Write** — confirm 5 fields present (goal · constraints · affected_files · acceptance_criteria · verification_intent); write `gather_complete.md` dated today | 🟢 | **ENFORCED** — PreToolUse phase-gate in `.claude/settings.json` BLOCKs any Edit/Write to `src/` if `gather_complete.md` is missing or not dated today. |

**Legend:**
- 🟢 **ENFORCED** — a hook, gate, or mandatory-emit will BLOCK you (or auto-fire) if you skip it.
- 🟡 **ADVISORY** — currently on the honor system (remembered, not enforced). Naming it 🟡 is a forcing function: it flags a future gap to close.

> **Honest note on G0–G2:** the gather rules are well-specified but not yet hook-enforced. Only the *output* of Phase 1 (the today-dated `gather_complete.md`) is hard-blocked by the gate. G0–G2 discipline is enforced by the agent following AGENTS.md §Phase 1 and emitting `[gather-refused]` / `[gather-stalled]` signals — these are mandatory emits, not auto-blocking hooks.

---

## The principle

> **You cannot plan what you do not understand — gather first, every time, without shortcuts.**

G0–G2 exist so the agent never starts writing a plan based on assumptions. The phase-gate at G3's output (the `gather_complete.md` date-check) is the teeth: even if G0–G2 were soft, skipping the *write* physically blocks the next phase. The stall cap (max 5 clarification rounds) and refusal contract (halt after 2 ignored rounds) prevent the loop from spinning forever when the user is unavailable.

---

## Re-render the cycle

```svg
<svg viewBox="0 0 600 480" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
  <!-- vertical spine -->
  <line x1="300" y1="60" x2="300" y2="420" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4 5"/>
  <!-- arrowheads on spine -->
  <polygon points="294,118 300,130 306,118" fill="#94a3b8"/>
  <polygon points="294,218 300,230 306,218" fill="#94a3b8"/>
  <polygon points="294,318 300,330 306,318" fill="#94a3b8"/>
  <!-- G0 node — advisory (amber) -->
  <rect x="170" y="20" width="260" height="80" rx="12" fill="#fef9c3" stroke="#ca8a04" stroke-width="2"/>
  <text x="300" y="50" text-anchor="middle" font-size="14" font-weight="700" fill="#78350f">G0 · Clarity Gate</text>
  <text x="300" y="68" text-anchor="middle" font-size="11" fill="#92400e">Ask Goal / Area / Constraints / DoD</text>
  <text x="300" y="84" text-anchor="middle" font-size="10" fill="#b45309">🟡 advisory (skip if ≥3 specifics)</text>
  <!-- G1 node — advisory (amber) -->
  <rect x="170" y="130" width="260" height="80" rx="12" fill="#fef9c3" stroke="#ca8a04" stroke-width="2"/>
  <text x="300" y="160" text-anchor="middle" font-size="14" font-weight="700" fill="#78350f">G1 · One-Pass Scan</text>
  <text x="300" y="178" text-anchor="middle" font-size="11" fill="#92400e">Scan ALL sections in one pass</text>
  <text x="300" y="194" text-anchor="middle" font-size="10" fill="#b45309">🟡 advisory — missing_files[] + missing_user_input[]</text>
  <!-- G2 node — advisory (amber) -->
  <rect x="170" y="230" width="260" height="80" rx="12" fill="#fef9c3" stroke="#ca8a04" stroke-width="2"/>
  <text x="300" y="260" text-anchor="middle" font-size="14" font-weight="700" fill="#78350f">G2 · Batch Grep + Read</text>
  <text x="300" y="278" text-anchor="middle" font-size="11" fill="#92400e">One Bash call · on_demand_files lookup</text>
  <text x="300" y="294" text-anchor="middle" font-size="10" fill="#b45309">🟡 advisory — targeted Read per item</text>
  <!-- G3 node — enforced (green) -->
  <rect x="170" y="330" width="260" height="80" rx="12" fill="#dcfce7" stroke="#16a34a" stroke-width="2.5"/>
  <text x="300" y="360" text-anchor="middle" font-size="14" font-weight="700" fill="#14532d">G3 · Assess + Write</text>
  <text x="300" y="378" text-anchor="middle" font-size="11" fill="#166534">Confirm 5 fields → write gather_complete.md</text>
  <text x="300" y="394" text-anchor="middle" font-size="10" fill="#15803d">🟢 ENFORCED — PreToolUse phase-gate BLOCKs src/ edit</text>
  <!-- [✓ gather] label -->
  <text x="300" y="440" text-anchor="middle" font-size="12" font-weight="700" fill="#1d4ed8">[✓ gather] emitted · Phase 2 unlocked</text>
</svg>
```

---

## Related

- **Full G0–G3 detail + limits + refusal contract:** [Implement/04_skills.md §Phase 1](../Implement/04_skills.md) — canonical G0 skip rules, output contract, stall cap, spec-completeness check.
- **Gather rules (G1/G2 one-pass / one-call rules):** [Implement/03_config.md §Phase 1](../Implement/03_config.md) — the `AskUserQuestion` options, G0 scope-grill active mode, max_clarification_rounds.
- **The output file this loop writes:** [.sessions/gather_complete.md](../.sessions/gather_complete.md) — must contain objective · constraints · affected_files · out_of_scope · acceptance_criteria · verification_intent, dated today.
- **The hook that enforces G3's output:** [.claude/settings.json](../.claude/settings.json) PreToolUse block — checks `gather_complete.md` exists and is dated today before allowing any Edit/Write to `src/`.
- **Sibling loops:** [[boot_loop]] · [[per_turn_routing_loop]] · [[mece_plan_loop]] · [[react_execution_loop]] · [[token_tracking_loop]] · [[session_close_loop]] · [[error_debug_loop]] · [[self_improvement_loop]]
- **Catalog:** [knowledge/loops_catalog.md](loops_catalog.md) — the hub linking all loops.

---

## index_files.json entry stub

```json
"knowledge/info_gather_loop.md": {
  "type": "knowledge",
  "topic": "info_gather_loop",
  "summary": "Documents the Phase 1 Info Gather loop (G0 clarity gate → G1 scan → G2 batch grep → G3 assess → gather_complete.md) — its 4 stages, enforcement status, and backlinks to the real artifacts.",
  "references": [
    "Implement/04_skills.md",
    "Implement/03_config.md",
    ".sessions/gather_complete.md",
    ".claude/settings.json"
  ],
  "related": [],
  "backlinks": []
}
```
