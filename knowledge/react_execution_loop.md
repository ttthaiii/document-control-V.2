# REACT Execution Loop (the "do the work" engine)

> **Type:** knowledge · **Topic:** react_execution_loop · **Created:** 2026-06-24 (T-266) · **Origin:** AGENTS.md §Phase 3 Execution Loop

---

## What it is

Once the agent has gathered information (Phase 1) and drawn a plan (Phase 2), it enters Phase 3 — the part where work actually gets done. The REACT loop is the engine that drives Phase 3. It runs one **cycle per plan section**, repeating until the section is complete or tokens run low.

Think of it like a factory quality-control line: each piece of work passes through fixed stations in order — pick a tool, run it, check the output, verify nothing broke, clean up the scraps, then decide whether to loop again or call the section done. The loop never skips a station because several stations have hard enforcement teeth (hooks, mandatory emits, blocking gates) that catch skips automatically.

**The loop's job:** turn each confirmed MECE plan section from `[ ]` (open) to `[X]` (verified done) — no section closes on memory alone, only on a file write + a passing Verify-N check.

---

## The 6-stage cycle

```
[L1] Select ──▶ [L2] Execute ──▶ [L3] Observe ──▶ [L4] Verify ──▶ [L4.5] Purge ──▶ [L5] Decide
     ▲                                                                                      │
     └──────────────────────────── repeat until section_complete OR token pause ───────────┘
```

**Legend:**
- 🟢 **ENFORCED** — a hook, gate, or mandatory-emit will BLOCK or auto-fire if you skip it.
- 🟡 **ADVISORY** — currently on the honor system; named here as a forcing function to flag the gap.

| # | Stage | Status | Enforced by (real artifact) |
|---|---|---|---|
| L1 | **Select** — choose the next tool (R2 budget, R5 index-first) | 🟢 | HOT trigger: if next tool = Read, agent MUST emit `[pre-read] Target · Line` BEFORE calling Read. Skipping this emit = `[violation] R5` (CFP-034). |
| L2 | **Execute** — run the selected tool | 🟢 | If Bash output likely >40 lines: MUST use `python3 scripts/safe_run.py` OR pipe through `grep -iE "error|warn|fail" \| tail -20` (R6). Skipping = R6 violation. |
| L3 | **Observe** — verify tool result; unexpected → diagnose → retry once → BLOCKED | 🟡 | Honor system; no hard gate. But BLOCKED state surfaces to user (halt + ask "fix or skip?"). |
| L4 | **Verify** — (a) grep-confirm + emit `[✓ written]`; (b) run section Verify-N from mece_plan.md | 🟢 | `[ ] S<N>` → `[X]` ONLY when BOTH `[✓ written]` AND Verify-N pass. File write, not memory. Automation: `scripts/verify_runner.py`. |
| L4.5 | **Purge** — drop tool results per state-retention policy | 🟢 | HOT trigger: after EVERY tool result MUST emit one of `[dropped]` / `[kept: N lines]` / `[offloaded]`. Silent keep = `[violation] BC-L4.5-purge` (CFP-033 fix). |
| L5 | **Decide** — section_done = `[✓ written]` AND Verify-N both pass → mark `[X]`; else loop | 🟢 | Marking `[X]` requires a file write to `.sessions/mece_plan.md` (not memory). After each section → write `session_handoff.md` (sections_done · resume_at · mece_plan_hash). |

**Purge policy detail (L4.5):**

| Tool result type | Policy |
|---|---|
| Bash verify / grep | DROP immediately after verdict emitted |
| Read — irrelevant | DROP immediately (`[post-read] irrelevant`) |
| Read — partial / relevant | KEEP excerpt only (≤10 lines); drop full output |
| Edit / Write success | KEEP `[✓ written]` verdict + artifact path |
| Tool result > 50 lines | OFFLOAD → `scripts/safe_run.py` writes to `.sessions/exec_log/<uuid>.txt`; inject `[result-offloaded]` |

---

## The principle

> **Every stage that can be skipped will eventually be skipped — so the stages that matter must enforce themselves.**

The HOT triggers at L1 (`[pre-read]`) and L4.5 (mandatory purge signal) are both mandatory emits enforced by post-turn hook scanning; a silent skip produces a `[violation]` that routes back to self-improve (R16). L4's double-gate (`[✓ written]` AND Verify-N) means the loop cannot declare victory on a mental note — it needs a file write and a passing check. These three enforcement points together make the loop self-policing rather than honor-system.

---

## Re-render the cycle

```svg
<svg viewBox="0 0 820 220" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
  <!-- track arrow back -->
  <path d="M 780 110 Q 780 190 400 190 Q 20 190 20 110" fill="none" stroke="#cbd5d0" stroke-width="2" stroke-dasharray="5 5" marker-end="url(#arr)"/>
  <!-- arrowhead def -->
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <polygon points="0,0 8,4 0,8" fill="#9aa7a0"/>
    </marker>
    <marker id="arrfwd" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <polygon points="0,0 8,4 0,8" fill="#4a6fa5"/>
    </marker>
  </defs>
  <!-- forward connectors -->
  <line x1="95" y1="80" x2="165" y2="80" stroke="#4a6fa5" stroke-width="1.5" marker-end="url(#arrfwd)"/>
  <line x1="255" y1="80" x2="325" y2="80" stroke="#4a6fa5" stroke-width="1.5" marker-end="url(#arrfwd)"/>
  <line x1="415" y1="80" x2="485" y2="80" stroke="#4a6fa5" stroke-width="1.5" marker-end="url(#arrfwd)"/>
  <line x1="575" y1="80" x2="645" y2="80" stroke="#4a6fa5" stroke-width="1.5" marker-end="url(#arrfwd)"/>
  <line x1="735" y1="80" x2="775" y2="80" stroke="#4a6fa5" stroke-width="1.5" marker-end="url(#arrfwd)"/>
  <!-- nodes -->
  <!-- L1 Select -->
  <rect x="10" y="50" width="85" height="60" rx="8" fill="#e6f0fb" stroke="#4a6fa5" stroke-width="2"/>
  <text x="52" y="74" text-anchor="middle" font-size="11" font-weight="700" fill="#1a2a4a">L1</text>
  <text x="52" y="89" text-anchor="middle" font-size="10" fill="#1a2a4a">Select</text>
  <text x="52" y="103" text-anchor="middle" font-size="9" fill="#2e7d32">🟢 [pre-read]</text>
  <!-- L2 Execute -->
  <rect x="170" y="50" width="85" height="60" rx="8" fill="#e6f0fb" stroke="#4a6fa5" stroke-width="2"/>
  <text x="212" y="74" text-anchor="middle" font-size="11" font-weight="700" fill="#1a2a4a">L2</text>
  <text x="212" y="89" text-anchor="middle" font-size="10" fill="#1a2a4a">Execute</text>
  <text x="212" y="103" text-anchor="middle" font-size="9" fill="#2e7d32">🟢 safe_run</text>
  <!-- L3 Observe -->
  <rect x="330" y="50" width="85" height="60" rx="8" fill="#fffbe6" stroke="#e6a817" stroke-width="2"/>
  <text x="372" y="74" text-anchor="middle" font-size="11" font-weight="700" fill="#3a2a00">L3</text>
  <text x="372" y="89" text-anchor="middle" font-size="10" fill="#3a2a00">Observe</text>
  <text x="372" y="103" text-anchor="middle" font-size="9" fill="#b86a00">🟡 honor</text>
  <!-- L4 Verify -->
  <rect x="490" y="50" width="85" height="60" rx="8" fill="#e6f0fb" stroke="#4a6fa5" stroke-width="2"/>
  <text x="532" y="74" text-anchor="middle" font-size="11" font-weight="700" fill="#1a2a4a">L4</text>
  <text x="532" y="89" text-anchor="middle" font-size="10" fill="#1a2a4a">Verify</text>
  <text x="532" y="103" text-anchor="middle" font-size="9" fill="#2e7d32">🟢 ✓+Verify-N</text>
  <!-- L4.5 Purge -->
  <rect x="650" y="50" width="85" height="60" rx="8" fill="#e6f0fb" stroke="#4a6fa5" stroke-width="2"/>
  <text x="692" y="74" text-anchor="middle" font-size="11" font-weight="700" fill="#1a2a4a">L4.5</text>
  <text x="692" y="89" text-anchor="middle" font-size="10" fill="#1a2a4a">Purge</text>
  <text x="692" y="103" text-anchor="middle" font-size="9" fill="#2e7d32">🟢 mandatory</text>
  <!-- L5 Decide -->
  <rect x="780" y="50" width="30" height="60" rx="8" fill="#e8f5e9" stroke="#2e9e5b" stroke-width="2"/>
  <text x="795" y="77" text-anchor="middle" font-size="9" font-weight="700" fill="#1a3a2a">L5</text>
  <text x="795" y="93" text-anchor="middle" font-size="8" fill="#1a3a2a">Decide</text>
  <!-- label -->
  <text x="400" y="215" text-anchor="middle" font-size="10" fill="#888">repeat per section · token pause or section_complete exits loop</text>
</svg>
```

---

## Related

- **Full stage how-to + PURGE table + safe_run + cache notes:** [Implement/06_orchestrator.md](../Implement/06_orchestrator.md) — §Phase 3 REACT LOOP (lazy-loaded on entering the loop).
- **HOT triggers summary (canonical):** [AGENTS.md](../AGENTS.md) — §Phase 3 · Execution Loop.
- **Bash output guard:** [scripts/safe_run.py](../scripts/safe_run.py) — wraps Bash calls with >40L output; writes offloaded results to `.sessions/exec_log/`.
- **Section tracking:** [.sessions/mece_plan.md](../.sessions/mece_plan.md) — `[ ]`→`[X]` transitions happen here; L4/L5 write to this file.
- **Resume anchor:** [.sessions/session_handoff.md](../.sessions/session_handoff.md) — written after each section (sections_done · resume_at · mece_plan_hash); boot reads it to find the next pending section.
- **Verify automation:** [scripts/verify_runner.py](../scripts/verify_runner.py) — optional L4 runner; `--section S<N> --file .sessions/mece_plan.md`.
- **Sibling loops:** [[boot_loop]] · [[per_turn_routing_loop]] · [[info_gather_loop]] · [[mece_plan_loop]] · [[token_tracking_loop]] · [[session_close_loop]] · [[error_debug_loop]] · [[self_improvement_loop]]
- **Catalog:** [knowledge/loops_catalog.md](loops_catalog.md) — the hub linking all loops.

---

## index_files.json entry stub

```json
"knowledge/react_execution_loop.md": {
  "type": "knowledge",
  "topic": "react_execution_loop",
  "summary": "Documents the Phase 3 REACT loop (L1 Select → L2 Execute → L3 Observe → L4 Verify → L4.5 Purge → L5 Decide) — stages, enforcement status, purge policy, and real-artifact backlinks.",
  "references": [
    "AGENTS.md",
    "Implement/06_orchestrator.md",
    "scripts/safe_run.py",
    "scripts/verify_runner.py",
    ".sessions/mece_plan.md",
    ".sessions/session_handoff.md"
  ],
  "related": [],
  "backlinks": []
}
```
