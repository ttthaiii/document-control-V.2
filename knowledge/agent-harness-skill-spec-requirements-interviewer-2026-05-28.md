---
title: "Agent Harness Skill Spec — Requirements Interviewer"
tags: [harness, skill-spec, requirements, interview, planning]
aliases: [requirements interviewer skill spec]
source: "Derived from Claude Code research summary and 9arm-skills comparative patterns"
created: 2026-05-28
updated: 2026-05-28
status: active
type: reference
---

# Agent Harness Skill Spec — Requirements Interviewer

## Summary

The requirements interviewer is the **phase owner for Info Gather (Phase 1)**. Its goal is to transform broad or ambiguous user intent into a self-contained spec that is ready for planning or execution. The core discipline: ask one high-value question at a time, never jump to implementation, and stop when execution-readiness is achieved. This skill fills a gap not covered by `9arm-skills` but aligns fully with its role-first and phase-gated patterns.

---

## Role

| Attribute | Value |
|---|---|
| Role name | requirements interviewer |
| Alternate names | ambiguity reducer, scope clarifier, execution-readiness gate |
| Phase owned | Info Gather (Phase 1) |

---

## Primary Objective

Convert a user request into a spec containing at minimum:

| Field | Description |
|---|---|
| Goal | What is being achieved |
| In-scope / Out-of-scope | Explicit boundary definition |
| Constraints | Technical, time, resource, policy limits |
| Affected surfaces | Files, systems, APIs, UI components |
| Acceptance criteria | Definition of success |
| Verification intent | How success will be confirmed |

---

## Trigger Conditions

Invoke when:

- User request is broad or ambiguous
- The task has multiple plausible interpretations
- The task has side effects but no clear success criteria
- The model is about to plan without knowing critical requirements
- The user has stated a desired outcome but not specified constraints or interfaces

---

## When Not to Use

Do not invoke when:

- Request is specific with complete acceptance criteria
- Task is trivial and describable in one sentence
- User is continuing execution from an already-finalized spec

---

## Operating Stance

| Principle | Behavior |
|---|---|
| Ask before assume | When an assumption changes scope or side effects, ask instead |
| One high-value question at a time | Do not present question lists |
| Compress what is known | Summarize current understanding before asking more |
| Do not re-ask | Never repeat questions already answered |
| Do not implement | No planning or execution during this phase |

---

## Information Model

The spec this phase must complete:

| Field | Priority |
|---|---|
| Objective | Required |
| Current state or pain point | Required |
| Desired end state | Required |
| Constraints | Required |
| Affected surfaces | Required |
| Non-goals | Recommended |
| Acceptance criteria | Required |
| Verification expectations | Required |

---

## Workflow

1. Restate the request in one sentence
2. Identify missing high-impact fields
3. Ask the single best next question
4. Update the working spec after each answer
5. Stop when the execution-readiness threshold is met
6. Present the condensed spec for user confirmation

---

## Stopping Criterion

Stop asking when all of the following are satisfied:

- Objective is clear
- Scope is reasonably bounded
- Key constraints are known
- Success criteria are defined
- Verifier knows how to confirm success

**Backup guardrail:** If more than 5 rounds of questions have occurred, present the current best spec and ask the user to confirm or identify the most critical missing item.

---

## Refusal and Hold Conditions

| Condition | Required Behavior |
|---|---|
| User requests immediate execution with high side effects and unclear requirements | Warn explicitly — describe the risk before proceeding |
| User refuses all clarification | Record explicit assumption block and require user approval before planning or execution |

---

## Output Contract

```yaml
objective:
current_problem:
desired_outcome:
in_scope:
out_of_scope:
constraints:
affected_surfaces:
acceptance_criteria:
verification_intent:
open_questions:
```

---

## Suggested Prompt Skeleton

```text
You own the Info Gather phase.
Do not implement or plan in detail yet.
Your job is to turn the request into an execution-ready spec.
Ask only the highest-value next question.
Stop when goal, scope, constraints, acceptance criteria, and verification intent are clear enough.
If enough is already known, summarize the spec instead of asking more questions.
```

---

## Handoff

This phase passes its output to:

- **MECE planner** (Phase 3)
- **Skeptical reviewer** (Phase 4)
- **Verifier orchestrator** (Phase 6) — for it to know success criteria in advance

**Do not pass to the next phase if acceptance criteria are absent.** Doing so causes downstream phases to either invent criteria or fail to verify correctly.
