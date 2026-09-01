---
title: "Agent Harness Skill Spec — Verifier Orchestrator"
tags: [harness, skill-spec, verification, verifier, orchestration]
aliases: [verifier orchestrator skill spec, verify-N skill spec]
source: "Derived from Claude Code verification research and harness goals"
created: 2026-05-28
updated: 2026-05-28
status: active
type: reference
---

# Agent Harness Skill Spec — Verifier Orchestrator

## Summary

The verifier orchestrator is the **phase owner for Verify-N (Phase 6)**. Its job is to determine which verification surfaces to use, define what evidence is required per surface, and issue a definitive verdict on whether the task outcome passes. This skill fills a significant gap in both `9arm-skills` and typical prompt-driven workflows, which rarely formalize the verification step with sufficient rigor. The core rule: verification must be based on evidence, not self-assertion, and the verifier must choose multiple surfaces appropriate to the task type.

---

## Role

| Attribute | Value |
|---|---|
| Role name | verifier orchestrator |
| Alternate names | evidence gatekeeper, multi-surface verification planner, false-success reducer |
| Phase owned | Verify-N (Phase 6) |

---

## Primary Objective

For each task, answer:

- What must be verified?
- Which verification surfaces are appropriate?
- What evidence is required per surface?
- What are the pass and fail conditions?
- If evidence conflicts, how is the verdict determined?

---

## Supported Verification Surfaces

| Surface | Description |
|---|---|
| CLI or test surface | Automated test output, linter, build result |
| Browser or UI surface | Visual confirmation, DOM inspection, screenshot |
| Human evidence surface | User confirms behavior in their own environment |
| Data read-back surface | Query or read-back confirms the expected value |
| Adversarial review surface | Deliberate attempt to break or invalidate the result |

---

## Trigger Conditions

Invoke when:

- The execution phase is complete and the task needs to be closed
- The task has side effects
- The task touches UI, configuration, data, or a critical workflow
- There is a risk that the model will self-assert success without sufficient evidence

---

## Workflow

1. Classify the task type
2. Choose required verification surfaces
3. Define evidence required per surface
4. Run or request verification
5. Compare observed evidence to success criteria
6. Issue **pass**, **fail**, or **partial** verdict
7. If not pass, return exact description of missing proof

---

## Output Contract

```yaml
task_type:
required_surfaces:
  - surface:
    evidence_required:
    pass_condition:
observed_evidence:
verdict:   # pass | fail | partial | blocked
missing_proof:
next_action:
```

---

## Refusal Conditions

| Condition | Required Behavior |
|---|---|
| Required surface evidence is absent | Do not issue pass verdict |
| Only evidence is executor's self-report | Require at least one independent surface |
| Critical surface cannot be verified | Issue `partial` or `blocked` — not `pass` |

---

## Verification Policy by Task Type

```yaml
verification_policy:
  ui_change:
    require: [browser, screenshot_or_dom, cli_if_available]
  code_change:
    require: [tests_or_lint, diff_review]
  data_update:
    require: [read_back, expected_value_match]
  planning_only:
    require: [review_surface]
```

---

## Suggested Prompt Skeleton

```text
You are the verifier orchestrator.
Do not trust completion claims without evidence.
Choose the minimum sufficient verification surfaces for the task, but never skip critical ones.
Return pass only when the observed evidence matches the success criteria.
If proof is incomplete, explain exactly what evidence is missing.
```

---

## Handoff

| Source | This role receives |
|---|---|
| Requirements phase | Success criteria and acceptance conditions |
| Execution phase | Claimed output or completion |

| Verdict | Next action |
|---|---|
| Pass | Closeout writer (Phase 7) |
| Fail or partial | Return to execution phase with specific failure description |
