# Boot Loop (the "front door")

> **Type:** knowledge · **Topic:** boot_loop · **Created:** 2026-06-24 (T-266) · **Origin:** AGENTS.md §Boot Sequence

---

## What it is

Every time a new session starts — or a chat is resumed after `/compact` — the harness runs a fixed four-step boot sequence before it does any real work. Think of it like unlocking a combination lock: each step must click into place in order, or the door doesn't open.

**B1** reads the saved state of the room (tokens, active task, CFP count). **B2** picks the right skill — like choosing the right specialist for the job. **B3** loads that skill's instruction sheet (and the MECE planner's sheet). **B4** detects what platform/provider the agent is running on, so token math and caching rules are correct for *this* environment, not a different one. Together, these four steps orient every new session to the same known baseline before the first user-facing response goes out.

**The boot loop's job: establish ground truth about context, skill, and platform before any task begins.**

---

## The 4-stage cycle

```
    ┌───────────────────────────────────────────────────────────┐
    │                       BOOT LOOP                           │
    │                                                           │
    │  [B1] boot_init.sh ──▸ [B2] Skill routing ──▸            │
    │                                          │                │
    │                                          ▾                │
    │                         [B3] SKILL.md load ──▸ [B4] Plat │
    │                                                   probe   │
    │                                                   (cond.) │
    └───────────────────────────────────────────────────────────┘
    fires once per session start (or post-compact resume)
```

**Legend:**
- 🟢 **ENFORCED** — a hook, gate, or mandatory-emit will BLOCK you (or auto-fire) if you skip it.
- 🟡 **ADVISORY** — currently on the honor system (remembered, not enforced). Naming it 🟡 is a forcing function: it flags a future gap to close.

| # | Stage | Status | Enforced by (real artifact) |
|---|---|---|---|
| B1 | **boot_init.sh** — runs the shell script; resets SESSION_TOTAL=0, recomputes CHAT_TOTAL, normalizes LOOP_WEIGHT to 0, checks compact_state.md for a pending compact-restore, emits CFP_COUNT | 🟢 | `scripts/boot_init.sh` — mandatory first tool call; `scripts/compact_reset.py` is the single-source formula mirror used by boot, SessionStart:compact hook, and C0 confirm path |
| B2 | **Skill routing** — if compact-restore: parse `sk=` field from compact_state.md (skip manifest). Otherwise: `grep -B1 -A6 '"keywords"' .agents/skills/skill-manifest.json` → keyword match → emit `[skill-match]` or `[skill-miss]`; tie → last manifest order wins (`[skill-match-tie]`) | 🟡 | `.agents/skills/skill-manifest.json` drives the lookup; `[skill-miss]` is a mandatory emit (forcing function) but no hook hard-blocks a mismatch today — advisory |
| B3 | **SKILL.md load** — if compact-restore: sha1sum check vs `sk_h` / `mece_h` in compact_state.md → match = skip read (~2.9k tokens saved); otherwise Read `SKILL.md` + `harness/mece/SKILL.md` | 🟡 | No hook enforces the sha1sum cache-skip, but `[compact-restore]` emit is required; hash mismatch → mandatory re-read; skip without hash check = token waste flagged by posttool_track.py |
| B4 | **Platform / provider probe** — runs ONLY when `detected.md` `platform: unknown` (or `api_provider:` missing). Maps platform → provider → fills 4 profile fields (cache_mechanism · context_cliff_tokens · token_formula · cache_write_cost). If unresolved → `api_provider: unknown` + conservative fallback | 🟡 | `.agents/platform/detected.md` is the single source of truth; B4 is conditional (skipped when already filled) — no hard block, but wrong provider profile silently breaks token math |

---

## The principle

> **Ground truth must be established before the first response, not inferred on the fly.**

Token counts, active skill, and platform profile are all context-window facts — they change between sessions, after compacts, and on different providers. If any of them start wrong, every downstream decision (compact warnings, skill invocations, cache rules) inherits the error. The boot loop is the single moment when all three can be set correctly from persisted state, before any user task pollutes the picture.

---

## Re-render the cycle

```svg
<svg viewBox="0 0 700 340" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
  <!-- background track -->
  <rect x="20" y="20" width="660" height="300" rx="16" fill="#f5f7f6" stroke="#c8d4ce" stroke-width="1.5"/>
  <text x="350" y="46" text-anchor="middle" font-size="13" font-weight="700" fill="#1a3a2a">Boot Loop — fires once per session start / post-compact resume</text>

  <!-- arrows -->
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#5a7a6a"/>
    </marker>
  </defs>
  <!-- B1 → B2 -->
  <line x1="182" y1="170" x2="258" y2="170" stroke="#5a7a6a" stroke-width="1.8" marker-end="url(#arr)"/>
  <!-- B2 → B3 -->
  <line x1="422" y1="170" x2="498" y2="170" stroke="#5a7a6a" stroke-width="1.8" marker-end="url(#arr)"/>
  <!-- B3 → B4 (down then right label) -->
  <line x1="590" y1="210" x2="590" y2="245" stroke="#5a7a6a" stroke-width="1.8" marker-end="url(#arr)"/>
  <text x="596" y="232" font-size="10" fill="#5a7a6a">cond.</text>

  <!-- B1 node -->
  <rect x="44" y="130" width="138" height="80" rx="12" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="2"/>
  <text x="113" y="158" text-anchor="middle" font-size="13" font-weight="700" fill="#1a3a2a">B1</text>
  <text x="113" y="174" text-anchor="middle" font-size="11" fill="#2a4a3a">boot_init.sh</text>
  <text x="113" y="188" text-anchor="middle" font-size="10" fill="#3a5a4a">🟢 enforced</text>
  <text x="113" y="202" text-anchor="middle" font-size="9" fill="#5a7a6a">tokens · state · CFP</text>

  <!-- B2 node -->
  <rect x="262" y="130" width="156" height="80" rx="12" fill="#fef9ec" stroke="#c9a327" stroke-width="2"/>
  <text x="340" y="158" text-anchor="middle" font-size="13" font-weight="700" fill="#1a3a2a">B2</text>
  <text x="340" y="174" text-anchor="middle" font-size="11" fill="#2a4a3a">Skill routing</text>
  <text x="340" y="188" text-anchor="middle" font-size="10" fill="#5a6a3a">🟡 advisory</text>
  <text x="340" y="202" text-anchor="middle" font-size="9" fill="#7a7a5a">manifest keyword match</text>

  <!-- B3 node -->
  <rect x="502" y="130" width="156" height="80" rx="12" fill="#fef9ec" stroke="#c9a327" stroke-width="2"/>
  <text x="580" y="158" text-anchor="middle" font-size="13" font-weight="700" fill="#1a3a2a">B3</text>
  <text x="580" y="174" text-anchor="middle" font-size="11" fill="#2a4a3a">SKILL.md load</text>
  <text x="580" y="188" text-anchor="middle" font-size="10" fill="#5a6a3a">🟡 advisory</text>
  <text x="580" y="202" text-anchor="middle" font-size="9" fill="#7a7a5a">sha1sum cache-skip</text>

  <!-- B4 node -->
  <rect x="502" y="248" width="156" height="56" rx="12" fill="#fef9ec" stroke="#c9a327" stroke-width="2"/>
  <text x="580" y="270" text-anchor="middle" font-size="13" font-weight="700" fill="#1a3a2a">B4</text>
  <text x="580" y="286" text-anchor="middle" font-size="11" fill="#2a4a3a">Platform probe</text>
  <text x="580" y="298" text-anchor="middle" font-size="10" fill="#5a6a3a">🟡 conditional</text>

  <!-- legend -->
  <rect x="44" y="284" width="14" height="14" rx="3" fill="#e6f5ec" stroke="#2e9e5b" stroke-width="1.5"/>
  <text x="64" y="295" font-size="11" fill="#1a3a2a">🟢 enforced (hook/script)</text>
  <rect x="200" y="284" width="14" height="14" rx="3" fill="#fef9ec" stroke="#c9a327" stroke-width="1.5"/>
  <text x="220" y="295" font-size="11" fill="#1a3a2a">🟡 advisory (honor system)</text>
</svg>
```

---

## Related (wiki backlinks to the real harness files)

- **B1 shell script (token reset · CHAT formula · LOOP_WEIGHT):** [scripts/boot_init.sh](../scripts/boot_init.sh) — the first mandatory tool call every session; also calls `compact_reset.py` for the post-compact recompute.
- **B1/B2 compact formula mirror:** [scripts/compact_reset.py](../scripts/compact_reset.py) — single-source CHAT formula used by boot, the SessionStart:compact hook, and the C0 confirm path.
- **B2 skill keyword index:** [.agents/skills/skill-manifest.json](../.agents/skills/skill-manifest.json) — the `keywords` + `activates_at` fields that B2 greps to pick the active skill.
- **B4 platform / provider state:** [.agents/platform/detected.md](../.agents/platform/detected.md) — persists `platform:`, `api_provider:`, `token_formula:`, and `cache_mechanism:`; B4 skips if already filled.
- **B1 internals (formula bodies):** [Implement/07_platform.md](../Implement/07_platform.md) — §Boot Init: CHAT_TOTAL formula, LOOP_WEIGHT normalization, compact_state.md field format, 8-field session_tokens.md layout.
- **Sibling loops:** [[per_turn_routing_loop]] · [[info_gather_loop]] · [[mece_plan_loop]] · [[react_execution_loop]] · [[token_tracking_loop]] · [[session_close_loop]] · [[error_debug_loop]] · [[self_improvement_loop]]
- **Catalog:** [knowledge/loops_catalog.md](loops_catalog.md) — the hub linking all loops.

---

## index_files.json entry stub

```json
"knowledge/boot_loop.md": {
  "type": "knowledge",
  "topic": "boot_loop",
  "summary": "Documents the 4-stage boot sequence (B1 boot_init → B2 skill routing → B3 SKILL.md load → B4 platform probe) that orients every session before the first response.",
  "references": [
    "scripts/boot_init.sh",
    "scripts/compact_reset.py",
    ".agents/skills/skill-manifest.json",
    ".agents/platform/detected.md",
    "Implement/07_platform.md",
    "AGENTS.md"
  ],
  "related": [],
  "backlinks": []
}
```
