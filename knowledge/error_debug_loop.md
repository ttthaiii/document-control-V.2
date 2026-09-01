# Error / Debug Loop (the "dead-path prevention" loop)

> **Type:** knowledge · **Topic:** error_debug_loop · **Created:** 2026-06-24 (T-266) · **Origin:** CLAUDE.md §R9 Error Protocol

When something breaks, a natural (and wrong) instinct is to chase the first plausible explanation. This loop exists to prevent that. Instead of running toward the "obvious" fix, the loop forces the agent to (1) check if this error has been seen before, (2) consult the error library before touching anything, (3) name at least two possible causes, and (4) try to *disprove* the cheapest one first — writing down what gets ruled out so the search never circles back.

Think of it like a detective who writes down every suspect they've cleared. The notebook (the breadcrumb ledger) is what stops them from re-interviewing someone they already eliminated.

**The loop's job: turn "guess and try" debugging into a structured, non-repeating search.**

---

## The 6-stage cycle

```
  ERROR / "still broken" / "same error"
              │
              ▼
  ┌───────────────────────┐
  │  Step-0: Recurrence   │  🟢  grep roadmap + Failed Approaches
  │  check                │      → [recurring] if seen before
  └───────────┬───────────┘
              │
              ▼
  ┌───────────────────────┐
  │  Pre-debug greps      │  🟢  error_index · index_variables ·
  │  (3-index check)      │      index_files — in that order
  └───────────┬───────────┘
              │
              ▼
  ┌───────────────────────┐
  │  ID + BC-lookup       │  🟢  T-{Parent}-{BugID}-{Attempt} +
  │  (new ERR only)       │      BC-topic-lookup + BC-active-fix
  └───────────┬───────────┘
              │
              ▼
  ┌───────────────────────┐
  │  Rank ≥2 hypotheses   │  🟡  disproof-first (P3 short form)
  │  by cheapest-to-kill  │      judgment — not enforced by a hook
  └───────────┬───────────┘
              │
              ▼
  ┌───────────────────────┐
  │  Disprove + Ledger    │  🟡  kill cheapest first → log each
  │                       │      ruled-out → never re-test KILLED
  └───────────┬───────────┘
              │
              ▼
  ┌───────────────────────┐
  │  Hard/looping case    │  🟡  escalate → load `debug` skill
  │  → debug skill        │      (full P3 + breadcrumb ledger)
  └───────────────────────┘
```

| # | Stage | Status | Enforced by (real artifact) |
|---|---|---|---|
| 1 | **Step-0 Recurrence check** | 🟢 | R9 mandatory `[recurring]` emit · `grep roadmap + ### Failed Approaches:` — skipping = `[violation] R9` |
| 2 | **Pre-debug greps (3-index)** | 🟢 | R9 enforced sequence: `error_index` → `index_variables` → `index_files` · BC-active-fix contract (each `[violation]`-enforced) |
| 3 | **ID + BC-topic-lookup** | 🟢 | New ERR requires `T-{Parent}-{BugID}-{Attempt}` + BC-topic-lookup + BC-active-fix · missing = `[violation]` per `Implement/03_config.md §R9` |
| 4 | **Rank ≥2 hypotheses** | 🟡 | Advisory — P3 short form described in `CLAUDE.md §R9`; deep form owned by `.agents/skills/harness/debug/SKILL.md` [R2]+[R3] |
| 5 | **Disprove cheapest first + Ledger** | 🟡 | Advisory — breadcrumb `[ledger]` emits defined in `debug/SKILL.md` [D1]–[D3]; short form in `Implement/03_config.md §R9`; honor-system unless `debug` skill is loaded |
| 6 | **Escalate to `debug` skill** | 🟡 | Advisory — R9 says "hard/looping case → load `debug` skill"; the full disproof ladder + BLOCK on no-repro live in `debug/SKILL.md` |

**Legend:**
- 🟢 **ENFORCED** — a hook, gate, or mandatory-emit will BLOCK you (or auto-fire) if you skip it.
- 🟡 **ADVISORY** — currently on the honor system (remembered, not enforced). Named 🟡 to flag future gaps.

---

## The principle

> **The only way to stop a debugging loop is to write down what you've already ruled out.**

Hypothesis ranking and disproof-first are not "good habits" — they are the structural answer to the most common debugging failure: revisiting a dead path. The breadcrumb ledger (stages 4–5) is the mechanism that makes the search non-repeating. Stages 1–3 make it non-redundant: checking prior art before debugging anything prevents re-solving the same bug twice. Stages 4–6 make it non-circular: writing down what is KILLED means it stays killed.

---

## Re-render the cycle

```svg
<svg viewBox="0 0 680 520" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
  <!-- title -->
  <text x="340" y="28" text-anchor="middle" font-size="16" font-weight="700" fill="#1a2a3a">Error / Debug Loop</text>
  <text x="340" y="46" text-anchor="middle" font-size="11" font-style="italic" fill="#6a7a8a">disproof-first · dead-path prevention</text>

  <!-- node boxes -->
  <!-- S0: Recurrence check — green -->
  <rect x="220" y="68" width="240" height="48" rx="8" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2"/>
  <text x="340" y="88" text-anchor="middle" font-size="12" font-weight="700" fill="#1a3a2a">1 · Recurrence Check</text>
  <text x="340" y="106" text-anchor="middle" font-size="10" fill="#3a5a4a">🟢 grep roadmap + Failed Approaches</text>

  <!-- S1: Pre-debug greps — green -->
  <rect x="220" y="140" width="240" height="48" rx="8" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2"/>
  <text x="340" y="160" text-anchor="middle" font-size="12" font-weight="700" fill="#1a3a2a">2 · Pre-debug Greps</text>
  <text x="340" y="178" text-anchor="middle" font-size="10" fill="#3a5a4a">🟢 error_index → vars → files</text>

  <!-- S2: ID + BC lookup — green -->
  <rect x="220" y="212" width="240" height="48" rx="8" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2"/>
  <text x="340" y="232" text-anchor="middle" font-size="12" font-weight="700" fill="#1a3a2a">3 · ID + BC-topic-lookup</text>
  <text x="340" y="250" text-anchor="middle" font-size="10" fill="#3a5a4a">🟢 T-{Parent}-{BugID}-{Attempt}</text>

  <!-- S3: Rank hypotheses — amber -->
  <rect x="220" y="284" width="240" height="48" rx="8" fill="#fef9e7" stroke="#d4ac0d" stroke-width="2"/>
  <text x="340" y="304" text-anchor="middle" font-size="12" font-weight="700" fill="#3a2a0a">4 · Rank ≥2 Hypotheses</text>
  <text x="340" y="322" text-anchor="middle" font-size="10" fill="#6a5a2a">🟡 cheapest-to-kill first</text>

  <!-- S4: Disprove + Ledger — amber -->
  <rect x="220" y="356" width="240" height="48" rx="8" fill="#fef9e7" stroke="#d4ac0d" stroke-width="2"/>
  <text x="340" y="376" text-anchor="middle" font-size="12" font-weight="700" fill="#3a2a0a">5 · Disprove + Ledger</text>
  <text x="340" y="394" text-anchor="middle" font-size="10" fill="#6a5a2a">🟡 log each ruled-out, never re-test</text>

  <!-- S5: Escalate to debug skill — amber -->
  <rect x="220" y="428" width="240" height="48" rx="8" fill="#fef9e7" stroke="#d4ac0d" stroke-width="2"/>
  <text x="340" y="448" text-anchor="middle" font-size="12" font-weight="700" fill="#3a2a0a">6 · Escalate → debug skill</text>
  <text x="340" y="466" text-anchor="middle" font-size="10" fill="#6a5a2a">🟡 hard/looping case only</text>

  <!-- arrows down -->
  <line x1="340" y1="116" x2="340" y2="138" stroke="#555" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="340" y1="188" x2="340" y2="210" stroke="#555" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="340" y1="260" x2="340" y2="282" stroke="#555" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="340" y1="332" x2="340" y2="354" stroke="#555" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="340" y1="404" x2="340" y2="426" stroke="#555" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- arrowhead marker -->
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#555"/>
    </marker>
  </defs>

  <!-- loop-back label on right side for stage 5 (disprove loop) -->
  <path d="M460,380 Q580,380 580,310 Q580,240 460,240" fill="none" stroke="#d4ac0d" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#arr)"/>
  <text x="592" y="306" text-anchor="middle" font-size="9" fill="#6a5a2a">next</text>
  <text x="592" y="318" text-anchor="middle" font-size="9" fill="#6a5a2a">cheapest</text>
</svg>
```

---

## Related

- **Canonical R9 definition:** [CLAUDE.md](../CLAUDE.md) §R9 — the always-on short form (Step-0 + pre-debug greps + disproof-first) that fires on every error.
- **Full R9 protocol detail:** [Implement/03_config.md](../Implement/03_config.md) §R9 — exact grep sequence, ID format, BC-topic-lookup contract, and error_index entry format.
- **Deep disproof-first discipline (P3 full form):** [.agents/skills/harness/debug/SKILL.md](../.agents/skills/harness/debug/SKILL.md) — the breadcrumb-ledger ladder ([R1]–[R3], [D1]–[D4]), `[hypotheses]` / `[rank]` / `[ledger]` / `[root-cause]` emits, and the no-repro block. R9 short form points here for hard cases.
- **Error knowledge base:** [knowledge/error_index.md](error_index.md) — every ERR-XXX entry with `### Failed Approaches:` blocks (the recurrence check at Step-0 reads this).
- **CFP recurrence tracking:** [knowledge/index_cfp_fix.json](index_cfp_fix.json) — BC-E appends recurrences here; `[fix-required]` at count ≥3.
- **Sibling loops:** [[boot_loop]] · [[per_turn_routing_loop]] · [[info_gather_loop]] · [[mece_plan_loop]] · [[react_execution_loop]] · [[token_tracking_loop]] · [[session_close_loop]] · [[self_improvement_loop]]
- **Catalog:** [knowledge/loops_catalog.md](loops_catalog.md) — the hub linking all loops.

---

## index_files.json entry stub

```json
"knowledge/error_debug_loop.md": {
  "type": "knowledge",
  "topic": "error_debug_loop",
  "summary": "Documents the R9 Error/Debug loop: Step-0 recurrence check → 3-index pre-debug greps → ID+BC-lookup → rank ≥2 hypotheses → disproof-first → breadcrumb ledger → escalate to debug skill.",
  "references": [
    "CLAUDE.md",
    "Implement/03_config.md",
    ".agents/skills/harness/debug/SKILL.md",
    "knowledge/error_index.md",
    "knowledge/index_cfp_fix.json"
  ],
  "related": [],
  "backlinks": []
}
```
