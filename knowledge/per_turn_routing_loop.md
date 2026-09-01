# Per-Turn Routing Loop (the "front door check")

> **Type:** knowledge · **Topic:** per_turn_routing_loop · **Created:** 2026-06-24 (T-266) · **Origin:** AGENTS.md §Per-Turn Routing

Every time the user sends a message, the harness runs four checks — C0 through C3 — before doing any actual work. Think of it like a security desk at a building entrance: before you let anyone upstairs, you check (1) is there a pending admin task first? (2) who are you? (3) what floor do you want? (4) if you're going somewhere new, close out the old floor first. Only after all four checks pass does work begin.

The loop's job: **route the right task to the right state, every turn, without letting stale context or token overload sneak through unnoticed.**

---

## The 4-stage cycle

```
  [user message arrives]
         │
         ▾
  ┌─────────────────────────────────────────────────────────────────┐
  │  C0 · Pre-work gate (4 sub-questions)                           │
  │  Q1 compact-confirm?  Q2 complaint?  Q3 token gate?  Q4 scope? │
  └──────────────────────────────┬──────────────────────────────────┘
                                 │ none triggered → pass
                                 ▾
                     C1 · Read active_thread.md
                         (what task is running?)
                                 │
                                 ▾
                     C2 · Compare: new topic vs task?
                         ┌───────┴────────┐
                    same topic        different topic
                         │                 │
                         ▾                 ▾
                   resume / new task     C3 · Topic-switch close
                   (Phase 3 or 1)        (close session → fresh start)
```

| # | Stage | Status | Enforced by (real artifact) |
|---|---|---|---|
| C0-Q1 | **Compact-confirm** — bare "compact แล้ว" triggers `compact_reset.py` | 🟢 | `scripts/compact_reset.py` (mandatory run + surface its `[compact-reset]` line) |
| C0-Q2 | **Complaint** — "ลืม / you skipped / didn't log" + harness step → R16 self-improve | 🟢 | R16 rule in CLAUDE.md; `[self-improve]` + same-response Edit to `CODING_FAILURE_PATTERNS.md` |
| C0-Q3 | **Token gate** — signal-box N/4 (turns≥20, files_read≥5, long_outputs≥3, steps_left≥3) | 🟢 | `scripts/posttool_track.py` (UserPromptSubmit hook writes signal-box + `[token-state]`); hard ceiling requires BOTH signal-box≥2 AND eff(CHAT×1.75)≥90%·WIN → `[compact-STOP]` |
| C0-Q4 | **Scope-grill** — "scope-grill" / "เจาะ scope" arms active G0 + out-of-scope question | 🟡 | Detected at C0 by rule in AGENTS.md; armed as `scope_grill=armed` in memory — behavioral, not a gate file |
| C1 | **Read active thread** — `grep` active_thread.md for `task:` field | 🟢 | AGENTS.md §Per-Turn Routing; skip = routing miss (no explicit hook, but C2 cannot run without it) |
| C2 | **Topic compare** — new message vs `task:` field; detect same/different/new | 🟡 | AGENTS.md rule; no hook enforces the decision — agent judgment; wrong call = silent mis-route |
| C3 | **Topic-switch close** — emit `[topic-switch]`, run session_manager §3, `/compact` or write `compact_state.md` + STOP | 🟢 | `[topic-switch]` mandatory emit in CLAUDE.md C3; `scripts/compact_reset.py` on claude-code platform; skip = `[violation] C3-skip` |

**Legend:**
- 🟢 **ENFORCED** — a hook, gate, or mandatory-emit will BLOCK you (or auto-fire) if you skip it.
- 🟡 **ADVISORY** — currently on the honor system (remembered, not enforced). Named 🟡 to flag the gap.

---

## The principle

> **Every turn must be checked before work begins — stale context and token overload are silent saboteurs.**

C0 exists because the agent has no persistent memory of what happened *between* sessions: /compact is invisible, the user may have just cleared context, or a complaint may need immediate backfill. Running C0→C3 every single turn is cheap insurance that prevents the most common class of harness drift — starting work on the wrong task, in an overloaded context, without noticing.

---

## Re-render the cycle

```svg
<svg viewBox="0 0 680 480" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
  <!-- title -->
  <text x="340" y="28" text-anchor="middle" font-size="16" font-weight="700" fill="#1a2a3a">Per-Turn Routing Loop</text>
  <text x="340" y="46" text-anchor="middle" font-size="11" fill="#5a6b7a">fires before every turn of work</text>

  <!-- C0 box -->
  <rect x="40" y="70" width="600" height="110" rx="8" fill="#eef4fb" stroke="#4a90d9" stroke-width="2"/>
  <text x="340" y="92" text-anchor="middle" font-size="13" font-weight="700" fill="#1a2a6a">C0 · Pre-work gate</text>
  <text x="80" y="114" font-size="11" fill="#2a3a5a">Q1 compact-confirm? → run compact_reset.py</text>
  <text x="80" y="130" font-size="11" fill="#2a3a5a">Q2 complaint? → R16 self-improve (same-response CFP edit)</text>
  <text x="80" y="146" font-size="11" fill="#2a3a5a">Q3 token gate? → signal-box N/4 · hard ceiling [compact-STOP]</text>
  <text x="80" y="162" font-size="11" fill="#2a3a5a">Q4 scope-grill? → arm active G0 + out-of-scope question</text>

  <!-- arrow C0 → C1 -->
  <line x1="340" y1="180" x2="340" y2="210" stroke="#4a90d9" stroke-width="2" marker-end="url(#arr)"/>
  <text x="355" y="198" font-size="10" fill="#5a7090">none triggered</text>

  <!-- C1 box -->
  <rect x="160" y="210" width="360" height="50" rx="8" fill="#e8f5e9" stroke="#2e9e5b" stroke-width="2"/>
  <text x="340" y="232" text-anchor="middle" font-size="13" font-weight="700" fill="#1a3a2a">C1 · Read active_thread.md</text>
  <text x="340" y="250" text-anchor="middle" font-size="10" fill="#3a5a4a">extract task: field → what is running?</text>

  <!-- arrow C1 → C2 -->
  <line x1="340" y1="260" x2="340" y2="290" stroke="#2e9e5b" stroke-width="2" marker-end="url(#arr)"/>

  <!-- C2 box -->
  <rect x="160" y="290" width="360" height="50" rx="8" fill="#fff8e1" stroke="#f5a623" stroke-width="2"/>
  <text x="340" y="312" text-anchor="middle" font-size="13" font-weight="700" fill="#3a2a0a">C2 · Compare topic vs task</text>
  <text x="340" y="330" text-anchor="middle" font-size="10" fill="#5a4a1a">same? → resume/new task   different? → C3</text>

  <!-- arrow same → Phase -->
  <line x1="220" y1="340" x2="140" y2="400" stroke="#2e9e5b" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="90" y="420" text-anchor="middle" font-size="10" fill="#2e9e5b">Phase 3 or 1</text>

  <!-- arrow different → C3 -->
  <line x1="460" y1="340" x2="540" y2="400" stroke="#e05050" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- C3 box -->
  <rect x="460" y="400" width="190" height="55" rx="8" fill="#fdecea" stroke="#e05050" stroke-width="2"/>
  <text x="555" y="422" text-anchor="middle" font-size="12" font-weight="700" fill="#5a0a0a">C3 · Topic-switch close</text>
  <text x="555" y="438" text-anchor="middle" font-size="10" fill="#7a2a2a">[topic-switch] · session §3</text>
  <text x="555" y="452" text-anchor="middle" font-size="10" fill="#7a2a2a">/compact or STOP</text>

  <!-- arrowhead marker -->
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#4a6a8a"/>
    </marker>
  </defs>
</svg>
```

---

## Related

- **Canonical definition:** [AGENTS.md](../AGENTS.md) §Per-Turn Routing — the authoritative C0→C3 logic including sub-question order, stuck-counter guard, and C3 platform branching.
- **Signal-box + token-state writer:** [scripts/posttool_track.py](../scripts/posttool_track.py) — UserPromptSubmit hook that counts turns/files_read/long_outputs/steps_left and writes `[token-state]` consumed by C0-Q3.
- **Compact counter reset:** [scripts/compact_reset.py](../scripts/compact_reset.py) — the single-source reset for CHAT_TOTAL / LOOP_WEIGHT / SESSION_TOTAL; invoked by C0-Q1 and the SessionStart:compact hook.
- **Active thread state file:** [.sessions/active_thread.md](../.sessions/active_thread.md) — the `task: / phase: / next:` file that C1 reads and C2 compares against.
- **Sibling loops:** [[boot_loop]] · [[info_gather_loop]] · [[mece_plan_loop]] · [[react_execution_loop]] · [[token_tracking_loop]] · [[session_close_loop]] · [[error_debug_loop]] · [[self_improvement_loop]]
- **Catalog:** [knowledge/loops_catalog.md](loops_catalog.md) — the hub linking all loops.

---

## index_files.json entry stub

```json
"knowledge/per_turn_routing_loop.md": {
  "type": "knowledge",
  "topic": "per_turn_routing_loop",
  "summary": "Documents the C0→C1→C2→C3 per-turn routing gate that fires before every turn of harness work — compact-confirm, complaint, token ceiling, scope-grill, thread-read, topic-compare, and topic-switch close.",
  "references": [
    "AGENTS.md",
    "scripts/posttool_track.py",
    "scripts/compact_reset.py",
    ".sessions/active_thread.md",
    "CLAUDE.md"
  ],
  "related": [],
  "backlinks": []
}
```
