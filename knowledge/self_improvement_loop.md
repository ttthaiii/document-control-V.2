# Harness Self-Improvement Loop (the "immune system")

> **Type:** knowledge · **Topic:** cfp_immunity · **Created:** 2026-06-24 (T-264) · **Updated:** 2026-06-24 (T-265 — the 3 amber gaps 5/7/8 are now closed; all 8 stages enforced) · **Origin:** rendered live during the T-263 close, then persisted here so any agent can re-read the principle and re-render the cycle.

This file documents how the harness is supposed to **heal itself**: every time a rule gets skipped or a bug recurs, the loop below should catch it, write it down, fix it structurally, and prove the fix holds. Think of it as the harness's immune system — a wound (a failure) should always trigger the same response, automatically, not "if someone remembers to."

The whole point: **a required step that is opt-in will eventually be skipped.** That is the exact disease [CFP-044](../CODING_FAILURE_PATTERNS.md) cured for *skill invocation*. The same disease used to live one level up — on the loop's own closing steps (stages 5/7/8) — until **T-265 closed those gaps too**. The loop is now fully enforced end-to-end.

---

## The 8-stage cycle

```
            ┌──────────────────────────────────────────────┐
            │                                              │
        (1) DETECT 🟢 ──▸ (2) LOG CFP 🟢 ──▸ (3) ESCALATE 🟢 ──▸ (4) FIX 🟢
            ▲   failure/         write to        @count 3 = fix-      build a
            │   violation/       CODING_FAILURE_  required             STRUCTURAL
            │   complaint        PATTERNS.md      @count 5 = escalate  solution (a T-N)
            │                                                            │
            │                                                            ▾
        (8) RE-OPEN 🟢 ◂── (7) MEASURE 🟢 ◂── (6) VERIFY 🟢 ◂── (5) RECORD 🟢
            on recurrence:      does the fix      Verify-N +         write the Solution
            resolved→reopened   STAY fixed?       dogfood +          to index_cfp_fix.json
            + re-escalate       (recurred_after_  scrutinize         + self_improve_log.md
            (cfp_recurrence.py)  fix[] · probe)                       (close-gate teeth)
            │                                                            
            └──────────────────────── loops back to (1) ────────────────┘
```

**Legend**
- 🟢 **ENFORCED** — a hook, gate, or mandatory-emit will BLOCK you (or auto-fire) if you skip it. You cannot quietly miss these. **As of T-265 all 8 stages are green.**
- 🟡 **(historical) GAP** — stages 5/7/8 were opt-in until T-265. Kept in the history only to show what "opt-in → eventually skipped" looked like before the teeth were added.

| # | Stage | Status | Enforced by (real artifact) |
|---|---|---|---|
| 1 | **Detect** | 🟢 | R16 C0 detection · `scripts/review_intent.py` (UserPromptSubmit) · `[violation]` emits from hooks |
| 2 | **Log CFP** | 🟢 | R16 mandatory same-response Edit to `CODING_FAILURE_PATTERNS.md` + `grep -c` count check |
| 3 | **Escalate @ 3/5** | 🟢 | Doctor Flow BC-E in `knowledge/index_cfp_fix.json` → `[fix-required]`(3) / `[fix-escalated]`(5) |
| 4 | **Fix** | 🟢 | becomes a roadmap `T-N` → phase-gate + `scripts/skill_gate.py` force the owning skill |
| 5 | **Record Solution** | 🟢 | *(T-265)* close-gate BLOCKs `phase: done` if a CFP status changed this session (`.cfp_touched`) without a same-day `self_improve_log.md` entry · writer in `scripts/posttool_track.py` |
| 6 | **Verify** | 🟢 | Completion-Gate Verify-N + dogfood + `scrutinize` skill on the finished artifact |
| 7 | **Measure stays-fixed** | 🟢 | *(T-265)* `scripts/cfp_fix_probe.py` at boot + Stop — checks every resolved CFP's `artifacts[]` still exist + wired → `[cfp-fix-drift]` |
| 8 | **Re-open on recurrence** | 🟢 | *(T-265)* `scripts/cfp_recurrence.py CFP-N` — reliable `resolved→reopened` + `recurred_after_fix[]` += today + re-escalate (detection stays R16/BC-E judgment) |

---

## The principle

> **Every loop-closing step must be enforced, not remembered.**

The front half (detect → log → escalate → fix → verify) was wired into hooks and gates from the start. The back half (record → measure → re-open) used to be on the honor system — the loop's hole sat *precisely where it mattered most*: the part that proves a fix worked and re-acts when it didn't. **T-265 applied the same medicine to that back half**, so the whole loop now runs whether or not the agent "feels like it."

---

## How the 3 gaps were closed (T-265)

The medicine was the same idea as the front half — turn each "remembered" step into a hook/gate/reliable-script:

1. **Gap 5 → close-gate teeth:** `posttool_track.py` drops a `.cfp_touched` tripwire when a CFP *status* is edited; the PreToolUse close-gate then BLOCKs `phase: done` unless `self_improve_log.md` was updated the same day. (Fail-open · escape `HARNESS_SKIP_CFP_BLOCK=1`.)
2. **Gap 7 → boot/Stop auto-probe:** `cfp_fix_probe.py` scans every `resolved` CFP (with a `resolved_by`) and verifies its `artifacts[]` still exist *and* hook scripts are still referenced in `.claude/settings.json` → emits `[cfp-fix-drift]`/`[cfp-fix-ok]`. Wired into `boot_init.sh` + the Stop hook.
3. **Gap 8 → reliable re-open:** `cfp_recurrence.py CFP-N` makes the `resolved → reopened` flip total (status + `recurred_after_fix[]` + `count++` + escalation signal) so the write can never be half-done. Detection of "this recurred" stays R16/BC-E judgment; the script only guarantees the write.

> Anti-self-brick note: the gate (in `.claude/settings.json`) was wired LAST, after the BLOCK-case was proven live — so building it could not block its own task. Design rationale: project memory `harness-self-improvement-loop-closure` (links to [[feedback-hard-block-over-soft-rule]]).
>
> Known residual (out-of-scope, flagged separately): the gate's top-level `json.load` is fail-*closed* on malformed stdin — a pre-existing latent brick, tracked as its own task.

---

## Re-render the cycle

The SVG below is the same diagram, self-contained — paste it into the visualize widget (title `harness_self_improvement_full_loop`) or open it in any SVG viewer. (All 8 nodes green as of T-265.)

```svg
<svg viewBox="0 0 760 560" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
  <!-- loop track -->
  <circle cx="380" cy="250" r="180" fill="none" stroke="#cbd5d0" stroke-width="2" stroke-dasharray="4 6"/>
  <!-- clockwise arrowheads on the track -->
  <g fill="#9aa7a0">
    <polygon points="-6,-6 8,0 -6,6" transform="translate(448.9,83.7) rotate(22.5)"/>
    <polygon points="-6,-6 8,0 -6,6" transform="translate(546.3,181.1) rotate(67.5)"/>
    <polygon points="-6,-6 8,0 -6,6" transform="translate(546.3,318.9) rotate(112.5)"/>
    <polygon points="-6,-6 8,0 -6,6" transform="translate(448.9,416.3) rotate(157.5)"/>
    <polygon points="-6,-6 8,0 -6,6" transform="translate(311.1,416.3) rotate(202.5)"/>
    <polygon points="-6,-6 8,0 -6,6" transform="translate(213.7,318.9) rotate(247.5)"/>
    <polygon points="-6,-6 8,0 -6,6" transform="translate(213.7,181.1) rotate(292.5)"/>
    <polygon points="-6,-6 8,0 -6,6" transform="translate(311.1,83.7) rotate(337.5)"/>
  </g>
  <!-- center -->
  <text x="380" y="232" text-anchor="middle" font-size="17" font-weight="700" fill="#1a3a2a">Self-Improvement Loop</text>
  <text x="380" y="256" text-anchor="middle" font-size="12" fill="#5a6b63">harness "immune system"</text>
  <text x="380" y="282" text-anchor="middle" font-size="11" font-style="italic" fill="#8a7a3a">enforced, not remembered</text>
  <!-- nodes: all green = enforced (gaps 5/7/8 closed by T-265) -->
  <g font-size="12" text-anchor="middle">
    <!-- 1 Detect -->
    <circle cx="380" cy="70" r="44" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2.5"/>
    <text x="380" y="66" font-weight="700" fill="#1a3a2a">1 Detect</text>
    <text x="380" y="82" font-size="10" fill="#3a5a4a">🟢 enforced</text>
    <!-- 2 Log CFP -->
    <circle cx="507" cy="123" r="44" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2.5"/>
    <text x="507" y="119" font-weight="700" fill="#1a3a2a">2 Log CFP</text>
    <text x="507" y="135" font-size="10" fill="#3a5a4a">🟢 enforced</text>
    <!-- 3 Escalate -->
    <circle cx="560" cy="250" r="44" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2.5"/>
    <text x="560" y="246" font-weight="700" fill="#1a3a2a">3 Escalate</text>
    <text x="560" y="262" font-size="10" fill="#3a5a4a">🟢 @3/5</text>
    <!-- 4 Fix -->
    <circle cx="507" cy="377" r="44" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2.5"/>
    <text x="507" y="373" font-weight="700" fill="#1a3a2a">4 Fix</text>
    <text x="507" y="389" font-size="10" fill="#3a5a4a">🟢 enforced</text>
    <!-- 5 Record (closed T-265) -->
    <circle cx="380" cy="430" r="44" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2.5"/>
    <text x="380" y="426" font-weight="700" fill="#1a3a2a">5 Record</text>
    <text x="380" y="442" font-size="10" fill="#3a5a4a">🟢 close-gate</text>
    <!-- 6 Verify -->
    <circle cx="253" cy="377" r="44" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2.5"/>
    <text x="253" y="373" font-weight="700" fill="#1a3a2a">6 Verify</text>
    <text x="253" y="389" font-size="10" fill="#3a5a4a">🟢 enforced</text>
    <!-- 7 Measure (closed T-265) -->
    <circle cx="200" cy="250" r="44" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2.5"/>
    <text x="200" y="246" font-weight="700" fill="#1a3a2a">7 Measure</text>
    <text x="200" y="262" font-size="10" fill="#3a5a4a">🟢 probe</text>
    <!-- 8 Re-open (closed T-265) -->
    <circle cx="253" cy="123" r="44" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2.5"/>
    <text x="253" y="119" font-weight="700" fill="#1a3a2a">8 Re-open</text>
    <text x="253" y="135" font-size="10" fill="#3a5a4a">🟢 script</text>
  </g>
  <!-- legend -->
  <g font-size="12">
    <rect x="200" y="510" width="16" height="16" rx="3" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2"/>
    <text x="224" y="523" fill="#1a3a2a">enforced (hook / gate / reliable script) — all 8 stages as of T-265</text>
  </g>
</svg>
```

---

## Related (wiki backlinks to the real harness files)

The loop is not abstract — each stage points at concrete files. Follow these to see the machinery:

- **Where failures are logged:** [CODING_FAILURE_PATTERNS.md](../CODING_FAILURE_PATTERNS.md) — CFP-044 is the canonical example this loop cured (skill invocation was opt-in).
- **The fix ledger (record + measure):** [knowledge/index_cfp_fix.json](index_cfp_fix.json) — `approved_proposal`, `resolved_by`, `artifacts[]`, `recurred_after_fix[]`.
- **The enforcement hooks (stage 1 + 4):**
  - [scripts/skill_gate.py](../scripts/skill_gate.py) — PreToolUse hard block: edits to owned harness paths require the owning skill active.
  - [scripts/review_intent.py](../scripts/review_intent.py) — UserPromptSubmit: detects a review/audit ask and arms `.review_intent`.
  - [scripts/posttool_track.py](../scripts/posttool_track.py) — turns a SKILL.md Read into the `.active_skill` artifact, and (T-265) drops `.cfp_touched` on a CFP-status edit.
- **The 3 gap-closing scripts (stages 5/7/8 · T-265):**
  - [scripts/cfp_fix_probe.py](../scripts/cfp_fix_probe.py) — stage 7: resolved-CFP fix-artifacts still exist + wired.
  - [scripts/cfp_recurrence.py](../scripts/cfp_recurrence.py) — stage 8: reliable `resolved → reopened` write.
  - the close-gate `.cfp_touched` branch in [.claude/settings.json](../.claude/settings.json) — stage 5 teeth.
- **Where the loop is described in the orientation doc:** [AGENTS.md](../AGENTS.md) §Completion Gate (post-build review must load scrutinize) + §Index Sync Invariant (R8 auto-reconcile).
- **Guard-rail signal glossary:** [knowledge/harness_flow_20260526.md](harness_flow_20260526.md) — see the T-265 entry for the `[cfp-fix-drift]` / `[recurrence-logged]` signals.
- **The running diary (stage 5 today):** [.sessions/self_improve_log.md](../.sessions/self_improve_log.md).
- **Design rationale for closing the 3 gaps:** project memory `harness-self-improvement-loop-closure`.
