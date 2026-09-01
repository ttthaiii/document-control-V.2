# Workflow Review Pattern — multi-agent review with adversarial verify

created: 2026-07-04 · source: Fable 5 model-intro conversation · status: **candidate** (not yet adopted into Completion Gate)
diagram: `knowledge/diagrams/workflow-review-pattern.svg` (Thai labels — user-facing artifact, R11 exemption)

## Problem this addresses

Current review path = a **single reviewer agent** (scrutinize / skeptical_reviewer): it reads everything alone, judges alone, and nothing challenges its findings before they reach the user. Known failure: the duplication audit that over-flagged duplicate content — the user had to manually re-verify every finding before acting (see user memory: surveys over-flag duplication). AI review output always contains plausible-but-wrong findings; without a refutation stage the user IS the filter.

## The pattern (3 stages)

1. **Fan-out** — split the review into 3–5 narrow dimensions (correctness, completeness, duplication, ...) and run one agent per dimension in parallel. Narrow focus catches what a single generalist pass misses.
2. **Adversarial verify** — every finding is sent to a separate set of agents instructed to REFUTE it ("prove this finding is wrong"). Majority refuted → finding is dropped. This is the stage the current setup lacks; it kills over-flagging before it reaches the user.
3. **Synthesize** — only findings that survive the vote enter the final report. Shorter report, every line pre-verified.

Mechanism: the platform `Workflow` tool (deterministic orchestration — the stage order is a script, not model improvisation). Available on claude-code with Claude 5 family (Fable 5).

## When to use / when not

- USE: large audits, pre-decision reviews, anything where a false alarm is expensive (mass delete, restructure).
- DO NOT USE: small checks, single-file reviews, routine verify — it spawns 10–20 agents and costs several × a normal review.
- Opt-in rule: the tool only runs when the **user explicitly asks** (message contains "workflow"). The agent must not self-invoke it.

## Adoption path

1. Trial: run a workflow-based audit on a real task (e.g. `.agents/skills` cross-skill consistency check) and compare findings + false-alarm rate against a plain scrutinize pass.
2. If better: register a roadmap Task (§6.2 block) to add it as an official Completion Gate branch — candidate slot: the existing "Verify-N ≥4 OR src/ change → spawn reviewer" rule gains a "large audit → Workflow review" option.
3. Until adopted, this file is the single source for the pattern; do not duplicate it into SKILL.md files.

## Related

- `.agents/skills/harness/scrutinize/SKILL.md` · `.agents/skills/harness/skeptical_reviewer/SKILL.md`
- AGENTS.md §Completion Gate (post-build artifact review, T-263)
- R4 sub-agent rules (Implement/03_config.md §Sub-agent Rules) — Workflow is the scripted superset of manual spawn patterns
