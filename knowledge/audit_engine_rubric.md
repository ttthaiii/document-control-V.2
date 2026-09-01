# Audit Engine Rubric — shared audit machinery (file-agnostic)

> Single source of truth for the *file-agnostic* part of any audit skill.
> Referenced by: `skill_auditor` (SKILL.md files) · `harness_doc_auditor` (rule/directive .md).
> Each auditor adds ONLY its file-type-specific checklist on top of this engine.
> Source: extracted from skill_auditor SKILL.md (T-179-S1, 2026-06-12).

---

## 1 · Operating Stance (apply at every tier)
- **Adversarial by default.** Assume the target is incomplete until each item is proven present with cited lines. "Looks complete" is not a verdict — cited evidence is.
- **No partial credit.** Half-written = absent. Vague = absent. One-liner where substance is required = weak. No upgrade for effort.
- **No bias, no courtesy.** Do not soften a ❌ because the file was recently written or written by the session owner. Do not add ⚠️ where the correct verdict is ❌. Truth over politeness — always.
- **No enforcement bias.** A hard gate / BC is for irreversible damage only — never for judgment, quality, or style (see §6 + each auditor's own rule).
- **Verdict before explanation.** Lead with the verdict (`❌ absent` / `⚠️ weak` / `✅ Ln–Lm`), then evidence. Never bury the verdict after three sentences of context.
- **Solution provider, not fault-finder.** Every ❌ or ⚠️ ships with the actual paste-ready text to fix it — not a description of what to write.
- **Third-party perspective (hard).** Audit as if you have never seen this file and have no stake in it. You did not write it. You are answering one question: "Does this make an agent reliably better or not?" — call it accordingly.

## 2 · Verdict format (mandatory shape)
```
❌ absent          · <one-line rationale>
⚠️ weak · L<N>     · <one-line rationale + the fix text>
✅ present · L<N>–L<M>
```
Keep:   verdict marker + cited line numbers + one-line rationale.
Strip:  internal deliberation ("I noticed…") · hedging ("it seems…") · courtesy softening.
Prohibited: burying the verdict after context · ⚠️ where evidence calls for ❌ · "looks good overall" without cited evidence.
Rule: **never mark ✅ without citing line numbers.**

## 3 · Stop conditions — TWO classes (low tier: this distinction is MANDATORY)
A low tier tends to read every entry as "stop the whole audit." It is NOT. A **FULL HALT** ends the
audit and produces no report; a **STEP-SKIP** abstains on one step and CONTINUES. Check before starting.

**Class A — FULL HALT (stop entire audit · no report):**
- Target file does not exist on disk → refuse (state required inputs).
- User wants a fix, not a diagnosis → hand to harness_editor directly.
- Target is a stub (< 20L / placeholder only) → emit `[pre-audit] stub detected` · ask to complete first.
- Request is out of this auditor's declared scope (wrong file type) → decline · name the right skill.
- A required source-of-truth file is missing → emit `[<x>-missing]` · stop · tell user to restore it.
- Same unchanged target already audited 3× → stop · ask user to restate the goal.

**Class B — STEP-SKIP (abstain on THAT step · then CONTINUE):**
- Running as a low tier and hit a judgment step → emit `[tier-low] skipped: <step>` · do NOT halt ·
  finish the remaining mechanical steps and still produce the report (abstain ≠ quit · never guess).

None of Class A applies → proceed.

## 4 · Failure-Mode awareness (decides ❌ vs ⚠️)
When a target governs an iterative/agent behaviour, recognise which failure class a missing piece allows:
- **Dead Loop Risk** — iterative pattern (fix/edit/retry) missing an explicit loop escape (`attempt N = shift layer` / stop condition). Flag ❌ if retry steps exist with no cap.
- **Root Cause Guessing Risk** — diagnostic/fix flow missing a "never invent root cause / read the full error first" constraint. Flag ❌ if it acts on errors without requiring the error be read first.
- **Scope Creep Risk** — build/create flow missing a stop condition ("if you cannot X → stop") or a gather/plan gate. Flag ❌ if no gate and no explicit stop phrase.
- **Runaway Iteration Risk** — multi-attempt loop missing a quality heuristic ("N iterations is a smell"). Flag ⚠️ if loop exists but no heuristic.
When suggesting a loop escape / stop / root-cause gate: name the Failure Mode it prevents *before* the fix text — the agent learns *why*, not just *what* to paste.

## 5 · Tier & effort (mechanical vs judgment split)
Default runner = Sonnet @ medium (full audit). **Two supported modes ONLY:**
1. Sonnet @ medium-or-higher = full audit (every step).
2. A low tier (e.g. Haiku, parallel/batch) = mechanical steps + the honest fallbacks below.

**Never run Sonnet below medium effort:** at low effort it does every step shallowly WITHOUT emitting
`[tier-low]`, so the gaps are invisible — false-confidence, worse than an explicit skip.

Low-tier rule: mechanical checks (file size, header grep, table lookups, literal-overlap scans) are
reliable at low effort. Judgment steps get a bracketed fallback; if unclear → emit
`[tier-low] skipped: <step>` (neutral abstention — NOT a pass · never default to ✅/⚠️ to dodge work ·
never skip a step you can actually do). Bias rules (§1) apply at every tier.

## 6 · Structure Audit (run on every target · emit a `## Structure` block)
**Scan A — Redundancy.** For each rule appearing more than once: keep it in the enforcement location, drop the duplicate. Low-tier: flag only literal same-sentence overlap.
→ `[redundant] concept: "<X>" · at: L<N> + L<N> · keep: L<N> · trim: L<N>`

**Scan B — Topic Scatter.** Read section order. Flag topic A → topic B → topic A re-expanded. Consolidate to one home + pointer elsewhere. (Judgment — low-tier: `[tier-low] skipped: Scan B`.)
→ `[scattered] topic: "<X>" · locations: L<N>, L<N> · consolidate to: L<N>`

**Scan C — Prescription.** Per step ask: *told what to think, or how to execute?* Hard-coded exact strings / word-lists that break when wording shifts, where a principle would cover all cases = over-prescribed. Low-tier: flag only literal break-on-rephrase hard-coding.
→ `[over-prescribed] location: "<section>" · L<N> · reason: <why principle beats script> · recommend: <principle>`

**Scan D — Cross-File Duplication / Drift.** (Cross-file — A/B/C only see within one file.) For each named rule / threshold / literal value in the target, grep the other harness files (CLAUDE.md, AGENTS.md, Implement/*, .agents/skills/*/SKILL.md, knowledge/*.md). Appears in ≥2 files with NO reference pointer (`see` / `per` / `§` / `@` / "→") between them = duplication that can drift apart silently (the T-181 failure: same token thresholds restated in 4 files). One file is canonical (the enforcement home); every other copy must become a pointer. Low-tier (mechanical): match exact numbers + `§`-rule-names only. High-tier: match equivalent meaning across rewordings (`[tier-low] skipped: Scan D-semantic`).
→ `[cross-dup] rule/value: "<X>" · target: L<N> · also-in: <file:L> · canonical: <which> · risk: drift`

No issues across A/B/C/D → emit `[structure] clean`.

## 7 · Re-audit on change (snapshot rule)
Audits run on a snapshot. If the target is edited between read and report:
- Re-read the target — the old snapshot is stale.
- Re-assess only items touching the edited sections — do not re-flag already-fixed items.
- Prior audit in `.sessions/exec_log/` → emit `[prior-audit-found]` · diff · report delta only.

## 8 · Escalation (shared)
- ≥3 issues in one target → offer a handoff to harness_editor with the paste-ready fixes.
- ≥3 targets share the same missing component → emit `[systemic-gap] component: <X> · targets: [list]` → hand to self_improve as ONE CFP proposal (not N separate fixes).
