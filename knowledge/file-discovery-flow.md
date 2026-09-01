---
type: knowledge
domain: harness
topics:
  major: [index_sync, knowledge_base]
  minor: [topic_graph]
description: Single home for the "how the agent finds the right files/docs to support a task" diagram (index-first lookup). Embedded SVG + a redraw-from-text table. Built from real sources, maintained by the flow_summarizer skill.
last_built: 2026-06-26
# source_hashes = anchor files whose change = a change in THIS discovery process's behavior (sha1[:8]).
# Heuristic, maintained by flow_summarizer; scripts/flow_freshness.py flags [flow-stale] when a live hash drifts.
# skill-manifest.json is deliberately NOT an anchor: 1366L + high churn (every skill edit) = false-stale noise;
# discovery behavior is governed by the AGENTS.md G2 rule, not the manifest's content.
source_hashes:
  CLAUDE.md: 3db8b3e9
  AGENTS.md: 10829cff
  Implement/03_config.md: 4dc9827e
  scripts/backlink_analyzer.py: 7f3f63c1
---

# File / Document Discovery → Index-First Lookup — Unified Flow

> **Single home for this diagram.** The embedded `<svg>` renders in Obsidian / GitHub; the **structure table (§3)** lets the diagram be regenerated from text if the SVG is lost or needs editing.
> **Authoritative rules live in their source files** (CLAUDE.md §R4/R5/R11 · AGENTS.md §Phase 1 + §Sub-agent Rules · Implement/03_config.md §R5/§Backlink Rule). This doc *illustrates* how they chain together — it does not restate them.

## 1 · Plain-language flow

When the agent needs supporting files for a task, it does **not** open files at random. It runs an **index-first lookup** — like using a library's card catalog before pulling books off the shelf, so you only carry the few that matter.

The chain, start to finish:

1. **Probe the scope first** (R4 / R11) — count how many files are in play: `find … | wc -l`. Under ~5 files → handle it yourself in the main context. 5 or more → hand the search to a sub-agent so the main context stays lean.
2. **Scan, don't read** (G1) — one quick pass over the task's sections to list *what's missing* (which files/inputs you still need). No file is fully opened yet.
3. **One batched grep + consult the catalog** (G2 — a single Bash call) — search by keyword and look up the index files (the "card catalog"): `index_files.json` (the link map), `index_variables.json` (where each symbol lives), `error_index.md`, and the skill's `on_demand_files` lookup table. These are **grep-only** — never opened whole.
4. **Targeted read** (R5 + Never-Full-Load) — only now open a file, and only the slice you need (`offset+limit`), announced with `[pre-read]`. Big files are never read whole.
5. **Judge relevance immediately** (R5 `[post-read]`) — right after reading, classify it: *relevant* (keep), *partial* (keep an excerpt), or *irrelevant* (**drop it** — don't let it sit in context). Forgetting to judge = treat it as irrelevant.
6. **Survey impact before editing** (Backlink 3-tier) — before changing a file, check who's connected to it: explicit `references[]` → inbound `backlinks[]` → topic-overlap `related[]`. "Related" is computed by a topic score **gated by domain** (files in different domains don't link unless an explicit reference says so).
7. **Re-sync the catalog after a change** (R8) — once a file is created/edited/deleted, rebuild the links (`backlink_analyzer.py`) so the catalog stays correct.

**Why this order matters:** every step narrows the search *before* spending the expensive resource (reading into context). Probe trims the file count, scan trims to what's missing, the catalog points straight at the right slice, and the relevance verdict throws away anything that snuck in. The escalation branch keeps a big search from bloating the main context.

## 2 · The flow (embedded SVG)

<svg viewBox="0 0 980 770" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,Segoe UI,Roboto,sans-serif">
  <defs>
    <marker id="ar" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L7,3 L0,6 Z" fill="#475569"/>
    </marker>
  </defs>

  <!-- trigger bar -->
  <rect x="20" y="20" width="940" height="40" rx="8" fill="#1e293b"/>
  <text x="490" y="45" text-anchor="middle" fill="#e2e8f0" font-size="15" font-weight="700">Agent needs a file to do a task → index-first lookup (narrow BEFORE you read into context)</text>

  <!-- main spine boxes (x=210, w=250) -->
  <!-- 1 PROBE -->
  <rect x="210" y="88" width="250" height="64" rx="8" fill="#3b82f6" opacity="0.92"/>
  <text x="225" y="112" fill="#fff" font-size="14" font-weight="700">1 · PROBE scope</text>
  <text x="225" y="131" fill="#dbeafe" font-size="11">find … | wc -l → &lt;5 self · ≥5 spawn</text>
  <text x="450" y="146" text-anchor="end" fill="#bfdbfe" font-size="9.5">CLAUDE.md §R4·R11</text>

  <!-- 2 G1 SCAN -->
  <rect x="210" y="176" width="250" height="64" rx="8" fill="#3b82f6" opacity="0.92"/>
  <text x="225" y="200" fill="#fff" font-size="14" font-weight="700">2 · G1 SCAN (don't read)</text>
  <text x="225" y="219" fill="#dbeafe" font-size="11">1-pass over sections → missing[]</text>
  <text x="450" y="234" text-anchor="end" fill="#bfdbfe" font-size="9.5">AGENTS.md §Phase 1 G1</text>

  <!-- 3 G2 BATCH GREP -->
  <rect x="210" y="264" width="250" height="64" rx="8" fill="#3b82f6" opacity="0.92"/>
  <text x="225" y="288" fill="#fff" font-size="14" font-weight="700">3 · G2 BATCH GREP (1 Bash)</text>
  <text x="225" y="307" fill="#dbeafe" font-size="11">greps + on_demand_files + catalog</text>
  <text x="450" y="322" text-anchor="end" fill="#bfdbfe" font-size="9.5">AGENTS.md §Phase 1 G2</text>

  <!-- 4 TARGETED READ -->
  <rect x="210" y="352" width="250" height="64" rx="8" fill="#3b82f6" opacity="0.92"/>
  <text x="225" y="374" fill="#fff" font-size="14" font-weight="700">4 · [pre-read] → TARGETED READ</text>
  <text x="225" y="393" fill="#dbeafe" font-size="11">offset+limit · never full &gt;80L</text>
  <text x="450" y="410" text-anchor="end" fill="#bfdbfe" font-size="9.5">CLAUDE.md §R5 · Never-Full-Load</text>

  <!-- 5 VERDICT -->
  <rect x="210" y="440" width="250" height="64" rx="8" fill="#f59e0b" opacity="0.95"/>
  <text x="225" y="462" fill="#1f2937" font-size="14" font-weight="700">5 · [post-read] VERDICT</text>
  <text x="225" y="481" fill="#451a03" font-size="11">relevant · partial · irrelevant</text>
  <text x="450" y="498" text-anchor="end" fill="#7c2d12" font-size="9.5">CLAUDE.md §R5</text>

  <!-- 6 BACKLINK 3-TIER -->
  <rect x="210" y="528" width="250" height="64" rx="8" fill="#8b5cf6" opacity="0.92"/>
  <text x="225" y="550" fill="#fff" font-size="13.5" font-weight="700">6 · BACKLINK 3-TIER (pre-edit)</text>
  <text x="225" y="569" fill="#ede9fe" font-size="11">references → backlinks → related</text>
  <text x="450" y="586" text-anchor="end" fill="#ddd6fe" font-size="9.5">scripts/backlink_analyzer.py</text>

  <!-- 7 INDEX SYNC -->
  <rect x="210" y="616" width="250" height="64" rx="8" fill="#10b981" opacity="0.92"/>
  <text x="225" y="640" fill="#fff" font-size="14" font-weight="700">7 · INDEX SYNC (after change)</text>
  <text x="225" y="659" fill="#d1fae5" font-size="11">rebuild links · [r8-sync-check]</text>
  <text x="450" y="674" text-anchor="end" fill="#a7f3d0" font-size="9.5">AGENTS.md §R8</text>

  <!-- spine arrows -->
  <line x1="335" y1="152" x2="335" y2="174" stroke="#475569" stroke-width="2" marker-end="url(#ar)"/>
  <line x1="335" y1="240" x2="335" y2="262" stroke="#475569" stroke-width="2" marker-end="url(#ar)"/>
  <line x1="335" y1="328" x2="335" y2="350" stroke="#475569" stroke-width="2" marker-end="url(#ar)"/>
  <line x1="335" y1="416" x2="335" y2="438" stroke="#475569" stroke-width="2" marker-end="url(#ar)"/>
  <line x1="335" y1="504" x2="335" y2="526" stroke="#475569" stroke-width="2" marker-end="url(#ar)"/>
  <line x1="335" y1="592" x2="335" y2="614" stroke="#475569" stroke-width="2" marker-end="url(#ar)"/>

  <!-- INDEX / CARD CATALOG cluster (right) -->
  <rect x="560" y="252" width="400" height="176" rx="10" fill="#064e3b" opacity="0.10" stroke="#10b981" stroke-width="1.5" stroke-dasharray="5 4"/>
  <text x="580" y="276" fill="#065f46" font-size="13" font-weight="700">Index = the "card catalog"  (grep-only · never full-read)</text>
  <rect x="580" y="288" width="170" height="56" rx="6" fill="#10b981" opacity="0.9"/>
  <text x="592" y="310" fill="#fff" font-size="11.5" font-weight="700">index_files.json</text>
  <text x="592" y="328" fill="#d1fae5" font-size="10">the link map (related/backlinks)</text>
  <rect x="770" y="288" width="170" height="56" rx="6" fill="#10b981" opacity="0.9"/>
  <text x="782" y="310" fill="#fff" font-size="11.5" font-weight="700">index_variables.json</text>
  <text x="782" y="328" fill="#d1fae5" font-size="10">where each symbol lives</text>
  <rect x="580" y="356" width="170" height="56" rx="6" fill="#10b981" opacity="0.78"/>
  <text x="592" y="378" fill="#fff" font-size="11.5" font-weight="700">error_index.md (≤40L)</text>
  <text x="592" y="396" fill="#d1fae5" font-size="10">past errors → fast recall</text>
  <rect x="770" y="356" width="170" height="56" rx="6" fill="#10b981" opacity="0.78"/>
  <text x="782" y="378" fill="#fff" font-size="11.5" font-weight="700">on_demand_files</text>
  <text x="782" y="396" fill="#d1fae5" font-size="10">manifest G2 lookup table</text>
  <!-- G2 → catalog arrow -->
  <line x1="460" y1="296" x2="558" y2="320" stroke="#10b981" stroke-width="2" marker-end="url(#ar)"/>
  <text x="470" y="288" fill="#065f46" font-size="9.5">consult</text>

  <!-- DROP (right of verdict) -->
  <rect x="560" y="448" width="230" height="48" rx="8" fill="#ef4444" opacity="0.9"/>
  <text x="575" y="469" fill="#fff" font-size="12.5" font-weight="700">irrelevant → DROP</text>
  <text x="575" y="487" fill="#fee2e2" font-size="10">don't keep in context (CFP-004)</text>
  <line x1="460" y1="472" x2="558" y2="472" stroke="#ef4444" stroke-width="2" marker-end="url(#ar)"/>

  <!-- ESCALATION (left of G2) -->
  <rect x="20" y="262" width="170" height="68" rx="8" fill="#f59e0b" opacity="0.92"/>
  <text x="33" y="285" fill="#1f2937" font-size="12" font-weight="700">≥5 files / &gt;300L</text>
  <text x="33" y="302" fill="#451a03" font-size="10.5">→ spawn Explore</text>
  <text x="33" y="317" fill="#451a03" font-size="10.5">sub-agent (≤500 tok)</text>
  <text x="178" y="328" text-anchor="end" fill="#7c2d12" font-size="9">AGENTS.md §R4</text>
  <line x1="210" y1="296" x2="192" y2="296" stroke="#b45309" stroke-width="2" marker-end="url(#ar)"/>

  <!-- legend -->
  <text x="20" y="730" fill="#64748b" font-size="10.5">Blue = search/read step · Amber = decision/gate · Purple = impact survey · Green = index &amp; sync · Red = discard.  Filename in each box's bottom-right = the rule's home.</text>
  <text x="20" y="750" fill="#94a3b8" font-size="9.5">Narrow the search at every step BEFORE paying to read into context. Anchors (source_hashes) = CLAUDE.md · AGENTS.md · Implement/03_config.md · backlink_analyzer.py.</text>
</svg>

## 3 · Redraw-from-text structure (so any agent can regenerate the SVG)

| # | Step (box) | What happens | Governing rule | Source (file:line) |
|---|---|---|---|---|
| 1 | PROBE scope | `find … \| wc -l` → <5 files = main context · ≥5 = spawn sub-agent | R4 · R11 Scope Probe | CLAUDE.md §R4/R11 · Implement/03_config.md §R4 |
| 2 | G1 SCAN | 1-pass over task sections → list `missing[]`; no file opened yet | Phase 1 G1 (advisory) | AGENTS.md §Phase 1 G1 (~L89,97) |
| 3 | G2 BATCH GREP | ONE Bash call: keyword greps + `on_demand_files` lookup + consult catalog | Phase 1 G2 (= 1 Bash) | AGENTS.md §Phase 1 G2 (~L100) |
| — | Index / card catalog | `index_files.json` (link map) · `index_variables.json` (symbol→file) · `error_index.md` ≤40L · manifest `on_demand_files` — all **grep-only** | Never-Full-Load | CLAUDE.md §Never-Full-Load (~L53-59) |
| 4 | TARGETED READ | `[pre-read]` then Read `offset+limit`; never full-read >80L | R5 + Never-Full-Load | CLAUDE.md §R5 · Implement/03_config.md §R5 (~L301-338) |
| 5 | VERDICT | `[post-read]` relevant / partial / irrelevant; miss = treat irrelevant | R5 (hard) | CLAUDE.md §R5 · Implement/03_config.md (~L307-314) |
| → | DROP | irrelevant result discarded, not carried in context | R5 / CFP-004 | Implement/03_config.md §R5 |
| 6 | BACKLINK 3-TIER | pre-edit survey: `references[]` → `backlinks[]` → `related[]`; related = topic score (major=2/minor=1) **gated by domain** | Backlink Rule (3-tier) | scripts/backlink_analyzer.py:6-12,163-165 · Implement/03_config.md §Backlink Rule (~L818-824) |
| 7 | INDEX SYNC | after create/edit/delete → rebuild links + `[r8-sync-check]` | R8 Index Sync (hard) | AGENTS.md §R8 (~L151-157) |
| ↰ | ESCALATE | ≥5 files / >300L → `[cycle N]` spawn Explore sub-agent (≤500 tok summary) | R4 sub-agent | AGENTS.md §Sub-agent Rules (~L168-173) |

**Divergences from the "obvious" reading (kept accurate on purpose):**
- The G0–G2 *steps* are **advisory** (no hook checks you actually scanned), but the gate OUTPUTS are enforced: the PreToolUse hook requires BOTH `gather_complete.md` (Phase 1) **and** `mece_plan.md` (Phase 2) to be dated today before any non-`.sessions/` Edit/Write.
- `on_demand_files` is a **G2-only** lookup table — never auto-loaded at Boot B3.
- The backlink 3-tier check is a **pre-edit impact survey**, not a post-edit sync.
- **Domain gate:** different-domain files do *not* auto-link on topic overlap; only an explicit `references[]` crosses the boundary (schema v3, T-278).

## Related
- **Rule homes (anchors):** CLAUDE.md (§R4/R5/R11/Never-Full-Load) · AGENTS.md (§Phase 1, §Sub-agent Rules, §R8) · Implement/03_config.md (§R5, §Backlink Rule, §R4) · scripts/backlink_analyzer.py (related-link scoring + domain gate).
- **Peer process docs:** [[file-lifecycle-flow]] (what happens to the index *after* a file changes — the write side of this read side) · knowledge/info_gather_loop.md (the G0–G3 cycle in detail).
- **Optional tool:** scripts/lookup.py — a T0 keyword oracle some flows run before the T1/T2/T3 grep tiers (optimization, not a required step → not an anchor).
