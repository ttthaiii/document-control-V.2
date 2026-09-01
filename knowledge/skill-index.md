---
name: Skill Index
description: Fast trigger-to-skill lookup. Read before skill-manifest.json — saves Boot B2 grep if match found here.
---

# Skill Index

> **Routing tier 1 of 3:** skill-index (this file) → skill-manifest.json keyword grep → choose_tools.py full search
> Match here first → load SKILL.md directly. No match → proceed to skill-manifest.json.

## Fast Lookup Table

| Intent / User Says | Skill | Notes |
|---|---|---|
| fix, bug, error, not working, broken, issue, wrong, fail, แก้, ไม่ทำงาน, error | `editor` | + R7 first → if >1 file: `mece` before edit |
| implement, refactor, restructure, build, rename all, migrate, multi-step, plan task, วางแผน, ปรับโครง | `mece` → then `coder` or `editor` | Phase 2 — runs once per task |
| create, new file, scaffold, add page, add component, new api, new route, สร้าง, ไฟล์ใหม่ | `coder` → then auto `index_manager` | New files only — never modifies existing |
| move file, delete file, rename file, file created, imports changed | `index_manager` (mode:file) | MANDATORY after any file op |
| rename function, rename symbol, refactor component, rename variable | `index_manager` (mode:symbol) | MANDATORY after any symbol change |
| new session, done, wrap up, switch task, pause, close, ปิด, จบ, จบงาน | `session_manager` | Session lifecycle + compact |
| flow diagram, ascii flow, flowchart, architecture chart, draw flow | `ascii_flow` | .md files with diagrams |
| spawn agents, parallel, orchestrate, cycle, fan-out, delegate | `agent` | Multi-section / sub-agent |
| CFP recurred, harness broken, structural fix, ซ่อม harness | `harness_doctor` | Only after failed CFP fix |
| review plan, skeptical, challenge, scrutinize, M4 | `skeptical_reviewer` | Phase 2 M4 optional gate |
| improve harness, failure pattern, self improve, CFP review, ปัญหาซ้ำ | `self_improve` | Auto-called at session close |
| edit skill, update SKILL.md, แก้ harness, update harness, add rule | `harness_editor` | Harness config file edits |
| token, SESSION_TOTAL, > 60k | `token_tracker` / `token_auditor` | Always active / threshold-based |

## Chained Skills (always run in sequence)

| Trigger | Chain |
|---|---|
| After `coder` completes | → `index_manager` |
| After `editor` (symbol changed) | → `index_manager` (mode:symbol) |
| Any session close | → `self_improve` §3 Step 0 |

## Always Active (loaded every turn)

- `token_tracker` — Step 6 of every loop turn
- `identity` — persona + communication rules (non-executable)

## Fallback Chain

```
[1] skill-index.md     → exact keyword/phrase match
[2] skill-manifest.json → grep keywords[] (Boot B2)
[3] choose_tools.py    → semantic keyword search across manifest + tool-manifest
[4] agent skill        → default orchestrator (no match)
```

## Backlinks

- [[.agents/skills/registry.md]]
- [[.agents/skills/skill-manifest.json]]
- [[scripts/choose_tools.py]]
