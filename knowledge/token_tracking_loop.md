# Token Tracking Loop (the "odometer + fuel gauge")

> **Type:** knowledge · **Topic:** token_tracking_loop · **Created:** 2026-06-24 (T-266) · **Origin:** CLAUDE.md §R1 Token Tracking · Implement/03_config.md §Token Tracking

Every conversation uses up a fixed pool of memory (the context window). Without tracking, the agent has no idea whether it is near empty or near full — it would keep working until it hits a hard wall and crashes mid-task. The token tracking loop is the odometer + fuel gauge that runs quietly in the background every single turn: it counts how much has been used, writes it down, checks warning thresholds, and puts the current reading in the footer of every response so both the user and agent can see the trend.

The loop also enforces strict reset rules so that counters never drift: `SESSION_TOTAL` (per-task cost) and `CHAT_TOTAL` (context window size) are each allowed to reset only at specific, named events — not whenever the agent feels like it.

---

## The per-turn cycle

```
[hook auto] PostToolUse
    posttool_track.py accumulates SESSION_TOTAL + CHAT_TOTAL + LOOP_WEIGHT
    writes → .sessions/session_tokens.md  (every tool call, not just end-of-turn)
         |
         ▾
[agent] Step 1 — READ [token-state]
    read hook-written values from session_tokens.md
    (absent → grep session_tokens.md live)
         |
         ▾
[agent] Step 2 — WRITE JSONL entry
    → .sessions/token_log.jsonl
    fields: turn_id · timestamp · task_id · phase · session_total · chat_total
            cache_read · cache_write · cache_hit_pct · buckets · turn_tokens
         |
         ▾
[agent] Step 3 — CHECK R3 threshold
    signal-box N/4 (primary) + CHAT/SESSION/LOOP_WEIGHT estimates (secondary)
    N≥2 → [compact-rec] | eff≥90%·WIN AND box≥2 → [compact-STOP]
         |
         ▾
[agent] Step 4 — CHECK spike
    turn-spike / cache-collapse / loop-explosion / retrieval-inflation /
    output-runaway / tool-result-inflation → emit [spike:<type>]
         |
         ▾
[agent] Step 5 — FOOTER
    *(Turn: N · Loop_W: N | Session: ~NNNk | Chat: ~NNNk tokens)*
    (if SESSION_TOTAL >5k: add 4-bucket [sys:Nk tools:Nk hist:Nk out:Nk])
         |
         ▾
[agent] Step 6 — cache-warn (after footer)
    if cache_hit_pct < 60% AND cache_read_tokens > 0
    → emit [cache-warn] hit%: NN% (target ≥60%)
```

### Reset rules (separate from the per-turn cycle)

```
SESSION_TOTAL reset to 0:
  PATH B  → user-confirmed /compact at a mece compact-checkpoint
             (compact_state.md: session_reset=armed → consumed at next boot)
  PATH A/C → task done + session close
  NEVER   → stale compact_state.md · mid-task fresh boot · agent whim

CHAT_TOTAL reset:
  → /compact only  (via compact_reset.py · single-source)

LOOP_WEIGHT reset to 0:
  → B1 on every fresh session or compact-restore
```

### Stage table

| # | Stage | Status | Enforced by (real artifact) |
|---|---|---|---|
| H | **Hook auto-accumulate** (SESSION + CHAT + LOOP_WEIGHT) | 🟢 | PostToolUse hook → `scripts/posttool_track.py` (T-178 · T-231 · T-235) |
| 1 | **Read [token-state]** | 🟡 | Honor-system; hook supplies the values, agent reads them (no gate blocks a skip) |
| 2 | **Write JSONL entry** | 🟡 | Honor-system; no hook forces this write each turn |
| 3 | **Check R3 threshold** | 🟢 | UserPromptSubmit hook supplies signal-box N/4 (T-221); ceiling gate (`scripts/posttool_track.py` + C0 Q3) BLOCKS when eff≥90%·WIN AND box≥2 |
| 4 | **Check spike** | 🟡 | Honor-system; spike types defined in Implement/03_config.md §Token Tracking; no auto-emit |
| 5 | **Emit footer** | 🟡 | Honor-system; R1 mandates it every response but no hook enforces the emit |
| 6 | **cache-warn** | 🟡 | Honor-system; skipping is explicitly a R1 violation but advisory only |
| R-B | **SESSION_TOTAL reset (PATH B)** | 🟢 | `scripts/compact_reset.py` (single-source · T-180) — SessionStart:compact hook (claude-code) or C0 plain-text confirm; armed→consumed in compact_state.md |
| R-A | **SESSION_TOTAL reset (PATH A/C)** | 🟢 | session_manager close sequence; `scripts/compact_reset.py` |
| R-C | **CHAT_TOTAL reset** | 🟢 | /compact only → `scripts/compact_reset.py` (T-180 single-source) |
| R-L | **LOOP_WEIGHT reset** | 🟢 | B1 `boot_init.sh` writes `LOOP_WEIGHT: 0` on every fresh or compact-restore start |

**Legend:**
- 🟢 **ENFORCED** — a hook, gate, or mandatory-emit will BLOCK you (or auto-fire) if you skip it.
- 🟡 **ADVISORY** — currently on the honor system (remembered, not enforced). Naming it 🟡 is a forcing function: it flags a future gap to close.

---

## The principle

**Every counter that can drift will drift — so the accumulation is hook-owned, and the reset rules are single-sourced.**

The key design decision: the PostToolUse hook (`posttool_track.py`) is the ONLY writer of SESSION_TOTAL and CHAT_TOTAL to `session_tokens.md`. The agent never hand-writes these. A second agent-side write would double-count. Similarly, `scripts/compact_reset.py` is the ONE place that recomputes counters after a compact — B1, the SessionStart:compact hook, and the C0 confirm path all call it, so they can never drift from each other.

---

## Re-render the cycle

```svg
<svg viewBox="0 0 700 520" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="12">
  <!-- background -->
  <rect width="700" height="520" fill="#0d1117" rx="8"/>

  <!-- title -->
  <text x="350" y="28" text-anchor="middle" fill="#e6edf3" font-size="14" font-weight="bold">Token Tracking Loop — per-turn cycle</text>

  <!-- Hook box (auto) -->
  <rect x="30" y="50" width="200" height="52" rx="6" fill="#1a3a1a" stroke="#3fb950" stroke-width="1.5"/>
  <text x="130" y="70" text-anchor="middle" fill="#3fb950" font-weight="bold">[H] Hook auto-accumulate 🟢</text>
  <text x="130" y="88" text-anchor="middle" fill="#8b949e">posttool_track.py</text>
  <text x="130" y="100" text-anchor="middle" fill="#8b949e">SESSION + CHAT + LOOP_WEIGHT</text>

  <!-- arrow H → 1 -->
  <line x1="230" y1="76" x2="270" y2="76" stroke="#484f58" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- Step 1 -->
  <rect x="270" y="50" width="160" height="52" rx="6" fill="#1a1f2e" stroke="#58a6ff" stroke-width="1.5"/>
  <text x="350" y="72" text-anchor="middle" fill="#58a6ff" font-weight="bold">[1] Read [token-state] 🟡</text>
  <text x="350" y="90" text-anchor="middle" fill="#8b949e">from session_tokens.md</text>

  <!-- arrow 1 → 2 -->
  <line x1="430" y1="76" x2="470" y2="76" stroke="#484f58" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- Step 2 -->
  <rect x="470" y="50" width="200" height="52" rx="6" fill="#1a1f2e" stroke="#58a6ff" stroke-width="1.5"/>
  <text x="570" y="72" text-anchor="middle" fill="#58a6ff" font-weight="bold">[2] Write JSONL entry 🟡</text>
  <text x="570" y="90" text-anchor="middle" fill="#8b949e">→ .sessions/token_log.jsonl</text>

  <!-- arrow 2 → 3 (down from step 2) -->
  <line x1="570" y1="102" x2="570" y2="150" stroke="#484f58" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- Step 3 -->
  <rect x="470" y="150" width="200" height="64" rx="6" fill="#1a2a1a" stroke="#3fb950" stroke-width="1.5"/>
  <text x="570" y="172" text-anchor="middle" fill="#3fb950" font-weight="bold">[3] Check R3 threshold 🟢</text>
  <text x="570" y="188" text-anchor="middle" fill="#8b949e">signal-box primary</text>
  <text x="570" y="202" text-anchor="middle" fill="#8b949e">→ [compact-rec] / [compact-STOP]</text>

  <!-- arrow 3 → 4 (left) -->
  <line x1="470" y1="182" x2="430" y2="182" stroke="#484f58" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- Step 4 -->
  <rect x="270" y="150" width="160" height="64" rx="6" fill="#1a1f2e" stroke="#58a6ff" stroke-width="1.5"/>
  <text x="350" y="172" text-anchor="middle" fill="#58a6ff" font-weight="bold">[4] Check spike 🟡</text>
  <text x="350" y="188" text-anchor="middle" fill="#8b949e">turn / cache / loop /</text>
  <text x="350" y="202" text-anchor="middle" fill="#8b949e">retrieval / output</text>

  <!-- arrow 4 → 5 (left) -->
  <line x1="270" y1="182" x2="230" y2="182" stroke="#484f58" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- Step 5 -->
  <rect x="30" y="150" width="200" height="64" rx="6" fill="#1a1f2e" stroke="#58a6ff" stroke-width="1.5"/>
  <text x="130" y="172" text-anchor="middle" fill="#58a6ff" font-weight="bold">[5] Emit footer 🟡</text>
  <text x="130" y="188" text-anchor="middle" fill="#8b949e">Turn · Loop_W · Session · Chat</text>
  <text x="130" y="202" text-anchor="middle" fill="#8b949e">4-bucket if SESSION &gt; 5k</text>

  <!-- arrow 5 → 6 (down) -->
  <line x1="130" y1="214" x2="130" y2="260" stroke="#484f58" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- Step 6 -->
  <rect x="30" y="260" width="200" height="52" rx="6" fill="#1a1f2e" stroke="#58a6ff" stroke-width="1.5"/>
  <text x="130" y="282" text-anchor="middle" fill="#58a6ff" font-weight="bold">[6] cache-warn 🟡</text>
  <text x="130" y="298" text-anchor="middle" fill="#8b949e">if hit% &lt; 60% → emit warn</text>

  <!-- divider -->
  <line x1="30" y1="335" x2="670" y2="335" stroke="#30363d" stroke-width="1" stroke-dasharray="4 4"/>
  <text x="350" y="352" text-anchor="middle" fill="#8b949e" font-size="11">RESET RULES (separate from per-turn cycle)</text>

  <!-- Reset PATH B -->
  <rect x="30" y="365" width="190" height="64" rx="6" fill="#1a2a1a" stroke="#3fb950" stroke-width="1.5"/>
  <text x="125" y="385" text-anchor="middle" fill="#3fb950" font-weight="bold">[R-B] SESSION reset 🟢</text>
  <text x="125" y="401" text-anchor="middle" fill="#8b949e">PATH B: /compact at checkpoint</text>
  <text x="125" y="415" text-anchor="middle" fill="#8b949e">compact_reset.py · armed→consumed</text>

  <!-- Reset PATH A/C -->
  <rect x="255" y="365" width="190" height="64" rx="6" fill="#1a2a1a" stroke="#3fb950" stroke-width="1.5"/>
  <text x="350" y="385" text-anchor="middle" fill="#3fb950" font-weight="bold">[R-A] SESSION reset 🟢</text>
  <text x="350" y="401" text-anchor="middle" fill="#8b949e">PATH A/C: task done + close</text>
  <text x="350" y="415" text-anchor="middle" fill="#8b949e">session_manager · compact_reset.py</text>

  <!-- Reset CHAT -->
  <rect x="480" y="365" width="190" height="64" rx="6" fill="#1a2a1a" stroke="#3fb950" stroke-width="1.5"/>
  <text x="575" y="385" text-anchor="middle" fill="#3fb950" font-weight="bold">[R-C/L] CHAT + LOOP reset 🟢</text>
  <text x="575" y="401" text-anchor="middle" fill="#8b949e">CHAT: /compact → compact_reset.py</text>
  <text x="575" y="415" text-anchor="middle" fill="#8b949e">LOOP_WEIGHT: B1 boot_init.sh</text>

  <!-- legend -->
  <text x="30" y="460" fill="#3fb950" font-size="11">🟢 ENFORCED — hook/gate/mandatory-emit fires automatically</text>
  <text x="30" y="478" fill="#58a6ff" font-size="11">🟡 ADVISORY — honor-system; naming it flags a future gap to close</text>

  <!-- arrowhead def -->
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#484f58"/>
    </marker>
  </defs>
</svg>
```

---

## Related

- **Canonical rule definition:** [CLAUDE.md §R1 Token Tracking](../CLAUDE.md) — the hard constraints on counter ownership, footer format, and reset policy.
- **Full implementation detail:** [Implement/03_config.md §Token Tracking](../Implement/03_config.md) — provider-aware multipliers, 4-bucket formula, spike types, JSONL schema, single-delta backstop.
- **Hook that auto-accumulates:** [scripts/posttool_track.py](../scripts/posttool_track.py) — the PostToolUse hook; single writer of SESSION_TOTAL + CHAT_TOTAL + LOOP_WEIGHT (T-178 · T-231 · T-235).
- **Single-source reset script:** [scripts/compact_reset.py](../scripts/compact_reset.py) — called by SessionStart:compact hook and C0 confirm path; the ONE place that recomputes counters after /compact (T-180).
- **Live counter file:** [.sessions/session_tokens.md](../.sessions/session_tokens.md) — holds SESSION_TOTAL · CHAT_TOTAL · LOOP_WEIGHT · CACHE_READ · CACHE_WRITE · TURN_COUNT; written by hook every tool call.
- **Audit trail:** [.sessions/token_log.jsonl](../.sessions/token_log.jsonl) — append-only JSONL; one entry per turn; used for session_summary at close.
- **Sibling loops:** [[boot_loop]] · [[per_turn_routing_loop]] · [[info_gather_loop]] · [[mece_plan_loop]] · [[react_execution_loop]] · [[session_close_loop]] · [[error_debug_loop]] · [[self_improvement_loop]]
- **Catalog:** [knowledge/loops_catalog.md](loops_catalog.md) — the hub linking all loops.

---

## index_files.json entry stub

```json
"knowledge/token_tracking_loop.md": {
  "type": "knowledge",
  "topic": "token_tracking_loop",
  "summary": "Documents the per-turn token tracking loop: hook auto-accumulates SESSION_TOTAL/CHAT_TOTAL/LOOP_WEIGHT; agent reads, writes JSONL, checks R3 thresholds + spikes, emits footer; reset rules single-sourced in compact_reset.py.",
  "references": [
    "CLAUDE.md",
    "Implement/03_config.md",
    "scripts/posttool_track.py",
    "scripts/compact_reset.py",
    ".sessions/session_tokens.md",
    ".sessions/token_log.jsonl"
  ],
  "related": [],
  "backlinks": []
}
```
