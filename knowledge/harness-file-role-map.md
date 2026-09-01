# Harness File Role Map
> Maps existing harness files to the 6-layer behavioral architecture.
> Source: knowledge/harness-reference-file-role-clarity-2026-05-13.md
> Purpose: resolve precedence conflicts, prevent behavioral drift, clarify scope.

---

## Layer Precedence (high → low)

```
Identity/Policy → Bootstrap → Routing → Operations → Continuity → Persona
```

When two files conflict, the higher layer wins.

---

## Layer Definitions & File Mapping

| Layer | Role | Harness Files |
|---|---|---|
| **Persona** | Agent tone, audience adaptation, user-facing language rules | `CLAUDE.md §R7` (Thai/English rule) |
| **Identity/Policy** | Hard constraints, invariants, what agent may NEVER do | `CLAUDE.md` (global rules) · `INVARIANTS.md` (destructive gates) · `CODING_FAILURE_PATTERNS.md` (learned violations) |
| **Bootstrap** | Session initialization, tool detection, state restore | `AGENTS.md §Boot` (B1–B4) · `.agents/platform/detected.md` · `.sessions/compact_state.md` |
| **Routing** | Per-turn skill dispatch, topic switch, phase transition | `AGENTS.md §Per-Turn Routing` (C0–C3) · `.agents/skills/skill-manifest.json` · `.agents/skills/registry.md` |
| **Continuity** | Session state, handoff, resume, token tracking | `.sessions/active_thread.md` · `.sessions/session_handoff.md` · `.sessions/mece_plan.md` · `.sessions/gather_complete.md` · `.sessions/session_tokens.md` · `.sessions/session_*.json` |
| **Operations** | Skill execution, task procedures, index management | `.agents/skills/*/SKILL.md` · `REPO_MAP.md` · `Implement/` docs · `knowledge/index_*.json` · `docs/master_roadmap.md` |

---

## Single-Concern Rule

Each file owns exactly ONE concern. Adding behavior to the wrong layer = drift risk.

| File | Owns | Does NOT own |
|---|---|---|
| `CLAUDE.md` | Hard constraints (R1–R16) | Skill-specific workflow steps |
| `AGENTS.md` | Boot + routing + phase architecture | Project-specific file paths |
| `INVARIANTS.md` | Destructive action gates | Session management logic |
| `skill-manifest.json` | Keyword→skill routing + bucket labels | Execution instructions |
| `.sessions/active_thread.md` | Current task + phase | Token counts |
| `.sessions/session_tokens.md` | SESSION_TOTAL counter | Task progress |
| `SKILL.md` (each skill) | Skill-specific workflow | Cross-skill routing |

---

## Conflict Resolution

If two files give conflicting instructions:
1. Identify which layer each file belongs to
2. Higher layer (Identity/Policy > Bootstrap > Routing > Operations) wins
3. Log conflict as CFP if recurs — structural fix needed

Example: `CLAUDE.md` says "never read full file" + a SKILL.md says "Read full file"
→ Identity/Policy > Operations → CLAUDE.md wins → use grep + targeted Read

---

## Adding New Files

Before creating a new harness file, assign it a layer:
- Layer determines where agent looks for it at boot/routing/runtime
- Never split one concern across two files
- Continuity files belong in `.sessions/` · Operations files in `.agents/skills/` or `knowledge/`
