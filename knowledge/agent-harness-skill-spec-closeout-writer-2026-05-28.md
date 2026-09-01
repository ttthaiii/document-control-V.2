---
title: "Agent Harness Skill Spec — Closeout Writer"
tags: [harness, skill-spec, closeout, memory, postmortem]
aliases: [closeout writer skill spec, postmortem lite skill spec]
source: "Derived from 9arm-skills post-mortem and harness learning needs"
created: 2026-05-28
updated: 2026-05-28
status: active
type: reference
---

# Agent Harness Skill Spec — Closeout Writer

## Summary

The closeout writer is a **learning capture and closure role** triggered after a significant task or bug fix is complete. Its job is to transform task outcomes into canonical, reusable artifacts. It is inspired by the `post-mortem` skill in `9arm-skills` but broadened to cover implementation tasks, workflow experiments, and verification lessons — not only bug fixes. The core constraint: it must not summarize if a validated outcome does not yet exist, and it must never obscure uncertainty with well-written but false prose.

---

## Role

| Attribute | Value |
|---|---|
| Role name | closeout writer |
| Alternate names | learning capture role, memory distillation role, validation-aware summarizer |
| Phase owned | Closeout (Phase 7) |

---

## Primary Objective

Produce an artifact that answers at minimum:

- What was the task?
- What actually happened?
- What caused success or failure?
- How was it verified?
- What lessons or follow-ups exist?

---

## Trigger Conditions

Invoke this skill when:

- A significant task is complete
- A bug fix has been validated
- A workflow experiment has a result worth preserving
- Output needs to be handed off, stored in memory, or used to update knowledge

---

## Required Inputs

The following must be present before producing a final closeout:

| Input | Description |
|---|---|
| Task objective | What was being attempted |
| Actual outcome | What actually resulted |
| Evidence of completion or failure | Proof, not self-assertion |
| What changed | Files, configs, data, behavior |
| Validation result | Pass, fail, or partial |

---

## Refusal Conditions

| Condition | Required Behavior |
|---|---|
| No validation result | Do not produce a final closeout — write an interim note instead |
| Root cause is still a hypothesis | Do not state it as fact |
| Outcome is ambiguous | Write an interim closeout and label it clearly |

---

## Workflow

1. Restate the objective
2. Record what actually happened
3. Identify what changed
4. Identify why it worked or failed
5. Attach validation result
6. List follow-ups and lessons
7. Classify as **final closeout** or **interim closeout**

---

## Output Contract

```yaml
objective:
outcome:
changes_made:
validation:
root_cause_or_enabler:
follow_ups:
lessons:
status:   # final | interim
```

---

## Supported Variants

| Variant | Use Case |
|---|---|
| Bug-fix closeout | After a validated bug repair |
| Implementation closeout | After a feature or refactor is complete |
| Experiment closeout | After a workflow or architectural trial |

---

## Suggested Prompt Skeleton

```text
You are the closeout writer.
Capture what actually happened, what changed, and how it was validated.
Do not invent certainty.
If validation is incomplete, write an interim closeout and state exactly what remains open.
Prefer reusable learning over narrative filler.
```

---

## Relation to Memory and Knowledge Pipeline

Artifacts from this phase are candidates for:

- **Memory distillation** — compress into persistent session memory
- **Knowledge update** — update relevant knowledge files
- **Regression prevention** — record what to watch for in future
- **Management translation** — hand off to audience translator for stakeholder delivery
