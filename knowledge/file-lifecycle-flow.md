---
type: knowledge
domain: harness
topics:
  major: [index_sync, knowledge_base]
  minor: [topic_graph]
description: Single home for the "what happens when a file is added/edited/deleted" diagram. Covers all 3 artifact types (code · skill · knowledge) with an embedded SVG plus a redraw-from-text structure table.
supersedes: knowledge/diagrams/wiki-index-sync-current-vs-fixed.svg
last_built: 2026-06-26
# source_hashes = anchor files whose change = a change in THIS process's behavior (sha1[:8]).
# Heuristic, maintained by the flow_summarizer skill; scripts/flow_freshness.py flags [flow-stale] when a live hash drifts.
source_hashes:
  scripts/backlink_analyzer.py: 7f3f63c1
  scripts/code_graph.py: a87e0dfd
  scripts/symbol_indexer.py: f238fc8c
  scripts/rule_indexer.py: 80478cc6
  scripts/session_indexer.py: be5e4395
  scripts/repo_map_check.py: fc8698e4
  scripts/index_reconcile.py: a02487e4
  knowledge/topic_facet_schema.md: 1696690f
---

# File Lifecycle → Index Sync — Unified Flow (code · skill · knowledge)

> **Single home for this diagram.** The embedded `<svg>` renders in Obsidian / GitHub; the **structure table (§3)** lets the diagram be regenerated from text if the SVG is ever lost or needs editing.
> **Authoritative rules live in `Implement/03_config.md §R8`** — this doc *illustrates* that table, it does not replace it. (Supersedes the older `diagrams/wiki-index-sync-current-vs-fixed.svg`, which covered the knowledge lane only.)

## 1 · Plain-language flow

When any file is **added, edited, deleted, or renamed**, the harness refreshes its "card catalog" (the index files) so the links between files stay correct. The pipeline is **not one unified flow** — it splits by **artifact type**, because a "link" means a different thing for each:

- **knowledge `*.md`** → `backlink_analyzer.py` builds *semantic* links: shared `topic` tags give the match **score**, and `domain` acts as a **gate** (two files in different domains are not linked unless an explicit `references[]` says so) → written to `index_files.json` (`related[]` / `backlinks[]`).
- **code `.py/.ts/.js`** → `code_graph.py` + `symbol_indexer.py` build *hard* links (actual import edges + cross-file symbols) → `index_files.json` (`imports[]`/`imported_by[]`) and `index_variables.json`.
- **`SKILL.md`** → registered into `skill-manifest.json` (manual judgment) + `rule_indexer.py` for `rules_defined[]`/`rules_referenced[]`.

A **safety net** runs at session close: the Stop-hook `index_reconcile.py` auto-runs the idempotent regenerators, so a missed manual update is caught, not lost.

## 2 · Diagram (embedded SVG — renders inline)

<svg viewBox="0 0 980 642" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
  <defs>
    <marker id="a" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#8b949e"/></marker>
  </defs>
  <rect x="0" y="0" width="980" height="642" rx="14" fill="#f7f8fa"/>
  <text x="24" y="30" font-size="19" font-weight="700" fill="#1f2328">A file enters → which process it starts</text>
  <text x="24" y="50" font-size="12.5" fill="#57606a">read top→bottom · branch by file TYPE · same process = same box · responsible file in each box's bottom-right corner</text>

  <!-- TRIGGER -->
  <rect x="329" y="64" width="320" height="38" rx="9" fill="#1f2328"/>
  <text x="489" y="88" font-size="13" font-weight="700" fill="#ffffff" text-anchor="middle">A file is ADDED · EDITED · DELETED · RENAMED</text>
  <!-- distribution bus -->
  <path d="M489 102 L489 118" stroke="#8b949e" stroke-width="2"/>
  <path d="M111 118 L867 118" stroke="#8b949e" stroke-width="2"/>
  <path d="M111 118 L111 130" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>
  <path d="M300 118 L300 130" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>
  <path d="M489 118 L489 130" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>
  <path d="M678 118 L678 130" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>
  <path d="M867 118 L867 130" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>

  <!-- ============ ROW 1: ENTRY — what each type STARTS with ============ -->
  <!-- K -->
  <rect x="24" y="130" width="174" height="62" rx="9" fill="#ffffff" stroke="#6366f1" stroke-width="2"/>
  <text x="111" y="153" font-size="12.5" font-weight="700" fill="#1f2328" text-anchor="middle">Knowledge .md</text>
  <text x="111" y="171" font-size="9" fill="#57606a" text-anchor="middle">set facets:</text>
  <text x="111" y="184" font-size="9" fill="#57606a" text-anchor="middle">type · topic · domain</text>
  <!-- C -->
  <rect x="213" y="130" width="174" height="62" rx="9" fill="#ffffff" stroke="#f59e0b" stroke-width="2"/>
  <text x="300" y="153" font-size="12.5" font-weight="700" fill="#1f2328" text-anchor="middle">Code .py/.ts/.js</text>
  <text x="300" y="178" font-size="9" fill="#57606a" text-anchor="middle">imports + symbols</text>
  <!-- S -->
  <rect x="402" y="130" width="174" height="62" rx="9" fill="#ffffff" stroke="#10b981" stroke-width="2"/>
  <text x="489" y="153" font-size="12.5" font-weight="700" fill="#1f2328" text-anchor="middle">SKILL.md</text>
  <text x="489" y="178" font-size="9" fill="#57606a" text-anchor="middle">skill route entry</text>
  <!-- T -->
  <rect x="591" y="130" width="174" height="62" rx="9" fill="#ffffff" stroke="#0891b2" stroke-width="2"/>
  <text x="678" y="153" font-size="12.5" font-weight="700" fill="#1f2328" text-anchor="middle">Tool script</text>
  <text x="678" y="178" font-size="9" fill="#57606a" text-anchor="middle">tool definition</text>
  <!-- O -->
  <rect x="780" y="130" width="174" height="62" rx="9" fill="#ffffff" stroke="#64748b" stroke-width="2"/>
  <text x="867" y="151" font-size="11" font-weight="700" fill="#1f2328" text-anchor="middle">Rule · Config ·</text>
  <text x="867" y="166" font-size="11" font-weight="700" fill="#1f2328" text-anchor="middle">Session · Root</text>
  <text x="867" y="184" font-size="9" fill="#57606a" text-anchor="middle">rule tags / record</text>

  <!-- entry → process arrows -->
  <path d="M111 192 L111 222" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>
  <path d="M300 192 L300 222" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>
  <path d="M489 192 L489 222" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>
  <path d="M678 192 L678 222" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>
  <path d="M867 192 L867 222" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>

  <!-- ============ ROW 2: PROCESS (action) — filename bottom-right ============ -->
  <!-- K process -->
  <rect x="24" y="222" width="174" height="82" rx="9" fill="#eef0ff" stroke="#6366f1" stroke-width="1.5"/>
  <text x="111" y="245" font-size="11" font-weight="700" fill="#1f2328" text-anchor="middle">Build semantic links</text>
  <text x="111" y="261" font-size="9" fill="#57606a" text-anchor="middle">topic = score · domain = gate</text>
  <text x="190" y="298" font-size="8" font-family="monospace" fill="#6366f1" text-anchor="end">backlink_analyzer.py</text>
  <!-- C process -->
  <rect x="213" y="222" width="174" height="82" rx="9" fill="#fff6e8" stroke="#f59e0b" stroke-width="1.5"/>
  <text x="300" y="245" font-size="11" font-weight="700" fill="#1f2328" text-anchor="middle">Map imports + symbols</text>
  <text x="300" y="261" font-size="9" fill="#57606a" text-anchor="middle">real import edges</text>
  <text x="379" y="289" font-size="8" font-family="monospace" fill="#f59e0b" text-anchor="end">code_graph.py</text>
  <text x="379" y="299" font-size="8" font-family="monospace" fill="#f59e0b" text-anchor="end">symbol_indexer.py</text>
  <!-- S process -->
  <rect x="402" y="222" width="174" height="82" rx="9" fill="#e9f9f1" stroke="#10b981" stroke-width="1.5"/>
  <text x="489" y="245" font-size="11" font-weight="700" fill="#1f2328" text-anchor="middle">Register + tag rules</text>
  <text x="489" y="261" font-size="9" fill="#57606a" text-anchor="middle">manual route + rule tags</text>
  <text x="568" y="289" font-size="8" font-family="monospace" fill="#10b981" text-anchor="end">skill-manifest.json *</text>
  <text x="568" y="299" font-size="8" font-family="monospace" fill="#10b981" text-anchor="end">rule_indexer.py</text>
  <!-- T process -->
  <rect x="591" y="222" width="174" height="82" rx="9" fill="#e6f6fa" stroke="#0891b2" stroke-width="1.5"/>
  <text x="678" y="245" font-size="11" font-weight="700" fill="#1f2328" text-anchor="middle">Register tool</text>
  <text x="678" y="261" font-size="9" fill="#57606a" text-anchor="middle">manual</text>
  <text x="757" y="298" font-size="8" font-family="monospace" fill="#0891b2" text-anchor="end">tool-manifest.json *</text>
  <!-- O process -->
  <rect x="780" y="222" width="174" height="82" rx="9" fill="#f1f5f9" stroke="#64748b" stroke-width="1.5"/>
  <text x="867" y="245" font-size="11" font-weight="700" fill="#1f2328" text-anchor="middle">Index rule / session</text>
  <text x="867" y="261" font-size="9" fill="#57606a" text-anchor="middle">/ repo map</text>
  <text x="946" y="279" font-size="8" font-family="monospace" fill="#64748b" text-anchor="end">rule_indexer.py</text>
  <text x="946" y="289" font-size="8" font-family="monospace" fill="#64748b" text-anchor="end">session_indexer.py</text>
  <text x="946" y="299" font-size="8" font-family="monospace" fill="#64748b" text-anchor="end">repo_map_check.py</text>

  <!-- process → writes arrows (K + C CONVERGE into one shared index_files.json box) -->
  <path d="M111 304 L150 334" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>
  <path d="M300 304 L262 334" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>
  <path d="M489 304 L489 334" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>
  <path d="M678 304 L678 334" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>
  <path d="M867 304 L867 334" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>

  <!-- ============ ROW 3: WRITES TO ============ -->
  <!-- shared K+C convergence -->
  <rect x="24" y="334" width="363" height="60" rx="9" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="205" y="356" font-size="11" font-weight="700" fill="#1f2328" text-anchor="middle">index_files.json  (shared)</text>
  <text x="205" y="372" font-size="9" fill="#57606a" text-anchor="middle">knowledge → related[]/backlinks[]  ·  code → imports[]</text>
  <text x="205" y="386" font-size="9" fill="#57606a" text-anchor="middle">+ index_variables.json → symbols (code)</text>
  <!-- S writes -->
  <rect x="402" y="334" width="174" height="60" rx="9" fill="#ffffff" stroke="#d0d7de" stroke-width="1.5"/>
  <text x="489" y="358" font-size="10" font-weight="600" fill="#1f2328" text-anchor="middle">manifest entry +</text>
  <text x="489" y="374" font-size="9" fill="#57606a" text-anchor="middle">rules_defined/referenced[]</text>
  <!-- T writes -->
  <rect x="591" y="334" width="174" height="60" rx="9" fill="#ffffff" stroke="#d0d7de" stroke-width="1.5"/>
  <text x="678" y="368" font-size="10" font-weight="600" fill="#1f2328" text-anchor="middle">tool-manifest.json</text>
  <!-- O writes -->
  <rect x="780" y="334" width="174" height="60" rx="9" fill="#ffffff" stroke="#d0d7de" stroke-width="1.5"/>
  <text x="867" y="358" font-size="9.5" font-weight="600" fill="#1f2328" text-anchor="middle">index_sessions.json</text>
  <text x="867" y="374" font-size="9.5" font-weight="600" fill="#1f2328" text-anchor="middle">REPO_MAP.md</text>

  <!-- writes → safety net: ALL CONVERGE into one box -->
  <path d="M205 394 L205 430" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>
  <path d="M489 394 L489 430" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>
  <path d="M678 394 L678 430" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>
  <path d="M867 394 L867 430" stroke="#8b949e" stroke-width="2" marker-end="url(#a)"/>

  <!-- ============ ROW 4: SAFETY NET — OUTER WRAPPER (same file, 3 work-parts) ============ -->
  <rect x="24" y="430" width="930" height="156" rx="11" fill="#1f2328"/>
  <text x="40" y="455" font-size="12.5" font-weight="700" fill="#ffffff">Safety net at session close — index_reconcile.py  (one file, three work-parts · idempotent)</text>
  <text x="40" y="472" font-size="9.5" fill="#9aa5b1">Adds/prunes index cards directly; for a CHANGED file it does NOT re-link itself — it re-runs the regenerators above.</text>
  <!-- inner sub-boxes: same file, different parts — CoT order: born → changed → gone -->
  <rect x="40" y="482" width="290" height="86" rx="8" fill="#2d333b" stroke="#3fb950" stroke-width="1.5"/>
  <text x="185" y="506" font-size="12" font-weight="700" fill="#3fb950" text-anchor="middle">ENROLL  (add)</text>
  <text x="185" y="528" font-size="9.5" fill="#c9d1d9" text-anchor="middle">new / untracked file → blank stub</text>
  <text x="185" y="544" font-size="9.5" fill="#c9d1d9" text-anchor="middle">+ git ls-files catch-up</text>
  <rect x="345" y="482" width="290" height="86" rx="8" fill="#2d333b" stroke="#d29922" stroke-width="1.5"/>
  <text x="490" y="506" font-size="12" font-weight="700" fill="#d29922" text-anchor="middle">RE-RUN regenerators  (edit)</text>
  <text x="490" y="528" font-size="9.5" fill="#c9d1d9" text-anchor="middle">changed file → recompute links</text>
  <text x="490" y="544" font-size="9.5" fill="#c9d1d9" text-anchor="middle">backlink · code_graph · symbol</text>
  <rect x="650" y="482" width="290" height="86" rx="8" fill="#2d333b" stroke="#f85149" stroke-width="1.5"/>
  <text x="795" y="506" font-size="12" font-weight="700" fill="#f85149" text-anchor="middle">PRUNE  (delete)</text>
  <text x="795" y="528" font-size="9.5" fill="#c9d1d9" text-anchor="middle">deleted file → remove card</text>
  <text x="795" y="544" font-size="9.5" fill="#c9d1d9" text-anchor="middle">+ flag orphaned skill-name refs</text>

  <text x="24" y="608" font-size="9" fill="#8b949e">* = manual register (judgment) · all other steps auto-run by scripts. Outer dark box = ONE file (index_reconcile.py) doing 3 parts. Authoritative table: Implement/03_config.md §R8.</text>
  <text x="24" y="624" font-size="9" fill="#8b949e">Colors = file type: indigo Knowledge · amber Code · green Skill · teal Tool · slate Rule/Session. Dashed box = convergence (two types, same output).</text>
</svg>

## 3 · Structure table (source of truth for redraw)

If the SVG is lost or needs editing, regenerate it from this table — it carries the full content. Read it as the diagram does: **a file enters → starts with → enters which process (responsible file) → writes to**.

| File type (entry) | Starts with | Process (responsible file) | Writes to |
|---|---|---|---|
| **Knowledge** `.md` | facets `type · topic · domain` | build semantic links — `topic` = match score, `domain` = gate (blocks cross-domain links) (`backlink_analyzer.py`) | `index_files.json` → `related[]`/`backlinks[]` ⟶ *converges* |
| **Code** `.py/.ts/.js` | imports + symbols | map import edges + symbols (`code_graph.py` + `symbol_indexer.py`) | `index_files.json` → `imports[]` *(same box)* + `index_variables.json` → symbols |
| **Skill** `SKILL.md` | skill route entry | register route + tag rules (`skill-manifest.json`* + `rule_indexer.py`) | manifest entry + `rules_defined[]`/`rules_referenced[]` |
| **Tool** script | tool definition | register tool (`tool-manifest.json`*) | tool-manifest entry |
| **Rule · Config · Session · Root** | rule tags / record | index rule / session / repo map (`rule_indexer.py` · `session_indexer.py` · `repo_map_check.py`) | `index_sessions.json` · `REPO_MAP.md` |

`*` = manual register (human judgment); every other step auto-runs.

**Convergence (same process = same box):** Knowledge + Code both land in the **one** `index_files.json` box — drawn as a single shared (dashed) box, not duplicated per type.

**Same file, different parts (outer wrapper box):** at session close every lane flows into **one** dark wrapper box — `index_reconcile.py` — which does three distinct work-parts, in file-lifecycle order:
- **ENROLL** (add) — a new / untracked file gets a blank stub card; also runs `git ls-files` to catch files committed in prior sessions that were never indexed.
- **RE-RUN regenerators** (edit) — a changed file is **not** re-linked by reconcile itself; it re-runs the regenerators (`backlink_analyzer` · `code_graph` · `symbol_indexer`) so they recompute. (The hash-based re-tag rule lives in `topic_facet_schema.md §6`, not here — single source.)
- **PRUNE** (delete) — a deleted file's card is removed, and orphaned skill-name references still mentioned in live `.md` files are flagged.

The outer box = one file; the three inner boxes = its three parts.

**Why separate indexers (not one pipeline):** a "link" means something different per file type — shared topic vs import edge vs skill route — so each gets its own indexer. `index_reconcile.py` is the single safety net that enrolls/prunes cards and re-runs the others at close.

## 4 · The three facets (and the bloat rule)

| Facet | Vocab | Can it bloat? | Control |
|---|---|---|---|
| `type` | closed enum | no | fixed list |
| `topic` | **open** | **yes** | `topic_facet_schema.md §8` keyword-dedup (≥2 match → reuse) + propose+confirm gate + §5 Pareto coverage |
| `domain` | **closed** enum {harness·content·data} — values from `topic_registry.json` → `domains` | **no** — by construction | none needed |

**Rule of thumb:** open vocab ⇒ needs a gate · closed enum ⇒ bloat-proof. That is why only `topic` carries an anti-bloat gate and `domain` does not.

## Related
- `Implement/03_config.md §R8` — authoritative trigger → indexer → regen table (this diagram illustrates it)
- [[topic_facet_schema]] — facet definitions §3 (domain), anti-bloat gate §8, Pareto §5
- `AGENTS.md §Index Sync Invariant` — 1-line trigger + pointer to §R8
- supersedes `knowledge/diagrams/wiki-index-sync-current-vs-fixed.svg` (knowledge lane only)
