---
name: plan-html
version: 3.0.0
description: |
  Plan a task, feature, or goal and render it as a hand-crafted dark-theme HTML
  artifact. NOT mermaid — every diagram is custom inline SVG with deterministic
  layout so positions are controllable. Rich component vocabulary: numbered
  milestone timeline, meta tables, custom SVG data flow + dependency graphs,
  risk matrix with severity badges, decision Q&A with stakeholder pills,
  sticky-note callouts. Outputs ./.claude-artifacts/plan.html.
license: MIT
compatibility: claude-code
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---

# /plan-html

Produce a hand-crafted implementation-plan HTML artifact. Dark theme, dense, scannable.
The goal is a document that reads like a thoughtful internal memo, not a generated
dashboard.

**Hard rules:**
- **No mermaid.** No JS rendering libraries. No CDN.
- **Every diagram is hand-laid SVG** — node coordinates and edge paths are computed by
  Claude from the PLAN data and emitted as static SVG. Predictable positions, full
  visual control. This is the whole point: you can't get layout precision from
  auto-routing tools.
- **Component vocabulary is fixed** (see below). Don't invent new visual treatments.
  Compose from the catalog.

## Usage

```
/plan-html                          # infer goal from conversation context
/plan-html "add rate limiting"      # explicit goal
/plan-html spec.md                  # read goal from file
```

## Component Catalog

The artifact is assembled from these components. Use them; don't invent new ones.

| # | Component | Use for |
|---|---|---|
| 1 | **Masthead** | Eyebrow tag + serif title + 1-sentence goal + intro paragraph |
| 2 | **Meta table** | Compact 2-column key/value — effort, scope, surfaces touched, flag name |
| 3 | **TL;DR card** | A single bordered card with the goal restated in one sentence |
| 4 | **Numbered milestones** | Vertical timeline of phases (01, 02, …) with serif numbers + colored left border + collapsible body |
| 5 | **Task list** | Within each milestone — checkbox + label + size badge + optional `depends on ↗` link |
| 6 | **Critical path callout** | Sticky-note style (slight rotation, paper shadow), highlights the longest chain |
| 7 | **Dataflow SVG** | Hand-laid: nodes in named lanes, labeled edges (solid/dashed), legend |
| 8 | **Dependency SVG** | Hand-laid: tasks in phase columns, arrows for `dependsOn`, critical path in clay |
| 9 | **Risk table** | 3-col (Risk · Sev · Mitigation), HIGH/MED/LOW badges, row striping |
| 10 | **Decisions Q&A** | Question + "Decide with:" stakeholder pills + optional context paragraph |
| 11 | **Sidenote** | Marginalia-style — small mono text, oat background, soft border |
| 12 | **Inline code / file ref** | Mono in subtle pill (paths, migration IDs, flag names) |

Components 4–9 are the load-bearing visuals. 1–3 orient. 10–12 are seasoning.

## What You Must Do When Invoked

### Step 1 — Gather Input

Check in order:
1. Quoted argument → use it directly as the goal
2. Filename argument → read the file, extract the goal
3. Conversation context → infer the goal from what's been discussed

Ask only if none of the above yields anything: "What's the goal or feature you want a plan for?"

### Step 2 — Check for Existing File

```bash
test -f ./.claude-artifacts/plan.html && echo "EXISTS"
```

If it exists, ask before overwriting: "`./.claude-artifacts/plan.html` already exists — overwrite it?"

### Step 3 — Build the Plan

Think through the work carefully and produce a `PLAN` object with the shape below.
**Every field marked required must be present.** Optional fields are honored when present
and skipped otherwise.

```js
const PLAN = {
  // ── Masthead ──
  title: "Comment threads on task cards",         // required, short, no "Plan"
  subtitle: "Acme web client",                    // optional product context
  goal: "Let users discuss work in-place …",      // required, one sentence

  // ── Meta table ──
  meta: [                                         // required, 3–6 rows
    { label: "Effort",        value: "~12 days" },
    { label: "Surfaces",      value: "API · web · realtime" },
    { label: "New tables",    value: "1 (comments)" },
    { label: "Feature flag",  value: "comments.threads.v2" }
  ],

  // ── Numbered milestones ──
  phases: [
    {
      id: "research",                             // kebab-case, unique
      n: "01",                                    // serial display number
      name: "Research",
      when: "Week 1 · Mon–Tue",                   // optional
      accent: "clay",                             // clay | olive | slate | oat | rust
      milestone: "Approach decided",
      tasks: [
        { id: "audit-volume",  label: "Audit current comment-like patterns",   size: 2 },
        { id: "survey-libs",   label: "Survey 3 realtime libs",                size: 1, dependsOn: ["audit-volume"] },
        { id: "confirm-redis", label: "Confirm Redis in prod infra",           size: 1 }
      ],
      notes: "Bias toward libs already in the dependency graph."   // optional paragraph
    }
    // 2–5 phases total
  ],

  // ── Dataflow (optional) ──
  dataflow: {                                     // include only when the work has
                                                   // non-trivial cross-component flow
    lanes: ["Client", "API", "Storage"],
    nodes: [
      { id: "composer", label: "<Composer>",   lane: 0 },
      { id: "trpc",     label: "tRPC mutation", lane: 1 },
      { id: "db",       label: "Postgres",      lane: 2 },
      { id: "rt",       label: "Realtime ch.",  lane: 1 }
    ],
    edges: [
      { from: "composer", to: "trpc", label: "POST",   style: "solid" },
      { from: "trpc",     to: "db",   label: "INSERT", style: "solid" },
      { from: "db",       to: "rt",   label: "trigger", style: "dashed" },
      { from: "rt",       to: "composer", label: "fan-out", style: "dashed" }
    ]
  },

  // ── Risks ──
  risks: [                                        // required, 2–6
    { label: "Realtime fan-out backpressure under load",
      sev: "HIGH",                                // HIGH | MED | LOW
      mitigation: "Bound channel size; drop oldest with audit log" },
    { label: "Migration 0042 locks task_card",
      sev: "MED",
      mitigation: "Run during low-traffic; gate behind feature flag" }
  ],

  // ── Decisions Needed ──
  decisions: [                                    // required, 1–4
    {
      question: "Thread depth — flat replies or arbitrary nesting?",
      decideWith: ["design", "platform"],
      context: "Nesting complicates the schema and the read path; flat keeps it cheap."
    }
  ],

  // ── Sidenotes (optional) ──
  sidenotes: [
    { ref: "migration", text: "We don't backfill — old tasks start empty." }
  ]
};
```

**Self-check before generating HTML:**
- [ ] Title is specific, not "Plan" or "Implementation Plan"
- [ ] `meta` has 3–6 rows
- [ ] Every task has `id`, `label`, `size`; ids are unique across the whole plan
- [ ] At least 2 inter-task dependencies exist (real plans have them)
- [ ] Every phase has a `milestone` line and `accent` color
- [ ] Risks: every entry has `sev` and `mitigation`
- [ ] Decisions: every entry has `decideWith` (1–3 stakeholders) and a `context` paragraph
- [ ] Total tasks ≥ 6

### Step 4 — Generate the HTML

Write one HTML5 file. No CDN. No external resources. All CSS and SVG are inline.

#### Palette — dark theme (use these CSS vars; do not invent new colors)

Matches the `teach.html` aesthetic for consistency across artifacts.

```css
:root {
  --bg:           #0d1117;   /* page background */
  --surface:      #161b22;   /* cards, milestone bodies */
  --surface-alt:  #21262d;   /* row stripe, pill bg, mono inline bg */
  --border:       #30363d;   /* card borders */
  --border-soft:  #21262d;   /* dashed task separators */
  --text:         #e6edf3;   /* primary text */
  --text-soft:    #c9d1d9;   /* body secondary */
  --muted:        #8b949e;   /* mono labels, axis, captions */
  --accent:       #f78166;   /* clay-like warm accent: milestone 01, critical path */
  --accent-d:     #d97757;   /* hovers, deeper accent */
  --ok:           #3fb950;   /* OK / success / LOW severity */
  --warn:         #d29922;   /* MED severity, sidenote highlight */
  --error:        #f85149;   /* HIGH severity, error path */
  --link:         #79c0ff;   /* internal anchor links */
  --sans:  system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --mono:  ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace;
}
body { background: var(--bg); color: var(--text); font-family: var(--sans);
       line-height: 1.55; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 0 32px 140px; }
```

#### Typography (dark theme — sans-first)

- **H1 (title):** `--sans`, 600 weight, `clamp(34px, 4.8vw, 52px)`, line-height 1.1,
  letter-spacing -0.015em, color `--text`. Accent word may be wrapped in `<em>`
  styled `color: var(--accent); font-style: normal;`.
- **H2 (section labels):** `--mono`, 12px, uppercase, letter-spacing 0.14em,
  color `--muted`, preceded by a 24px `--accent` rule.
- **Eyebrow tags:** `--mono`, 12px, uppercase, letter-spacing 0.12em, color `--muted`,
  prefixed by a 24px `--accent` rule (`::before { content: ""; width: 24px;
  height: 1.5px; background: var(--accent); }`).
- **Body:** `--sans`, 15.5px, color `--text-soft` for secondary, `--text` for primary.
- **Meta / labels / file refs:** `--mono`, 12–13px, color `--muted`.

#### Layout (top → bottom)

```
┌────────────────────────────────────────────────────────┐
│  [eyebrow] IMPLEMENTATION PLAN                         │
│  Title in serif (the verb is in italic clay)           │
│  Subtitle · short product context                      │
│  One-sentence goal in larger body text                 │
│                                                        │
│  ┌────────────┬─────────────────────────┐              │
│  │ Effort     │ ~12 days                │  meta table  │
│  │ Surfaces   │ API · web · realtime    │              │
│  │ New tables │ 1 (comments)            │              │
│  │ Flag       │ comments.threads.v2     │              │
│  └────────────┴─────────────────────────┘              │
├────────────────────────────────────────────────────────┤
│  ── MILESTONES ────────────────────────────────────    │
│                                                        │
│  01  Research                       Week 1 · Mon–Tue   │
│   │  • Audit comment-like patterns      [2d]           │
│   │  • Survey 3 realtime libs           [1d] ↗ depends │
│   │  • Confirm Redis in prod infra      [1d]           │
│   │  🏁 Approach decided                                │
│  02  Design                                            │
│   │  …                                                 │
│  ⋮                                                     │
│                                                        │
│   ┌──────────────────────────────────┐                 │
│   │ ✦ CRITICAL PATH                  │   sticky-note   │
│   │ audit → survey → algo → … (12d)  │   (rotate -1°)  │
│   └──────────────────────────────────┘                 │
│                                                        │
│  ── DEPENDENCIES ─────────────────────────────────     │
│  <hand-laid SVG: tasks in phase columns, arrows>       │
│                                                        │
│  ── DATA FLOW ────────────────────────────────────     │
│  <hand-laid SVG: lanes + nodes + solid/dashed edges>   │
│                                                        │
│  ── RISKS ────────────────────────────────────────     │
│  ┌────────────────────┬──────┬─────────────────────┐   │
│  │ Risk               │ Sev  │ Mitigation          │   │
│  ├────────────────────┼──────┼─────────────────────┤   │
│  │ Realtime backpres… │ HIGH │ Bound channel size…│   │
│  │ Migration locks …  │ MED  │ Run during low-tr.. │   │
│  └────────────────────┴──────┴─────────────────────┘   │
│                                                        │
│  ── OPEN QUESTIONS ───────────────────────────────     │
│  Q. Thread depth — flat or nested?                     │
│     Decide with: [design] [platform]                   │
│     Nesting complicates the schema and the read path…  │
└────────────────────────────────────────────────────────┘
```

#### Component patterns (use verbatim — adapt content, not structure)

**1. Masthead**
```html
<header class="mast">
  <div class="eyebrow">IMPLEMENTATION PLAN</div>
  <h1>Comment threads <em>on task cards</em></h1>
  <p class="sub">Acme web client</p>
  <p class="goal">Let users discuss work in-place — replies thread, mentions notify,
     resolves close the loop.</p>
</header>
```
```css
header.mast { padding: 64px 0 32px; border-bottom: 1px solid var(--border); }
.eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em;
           text-transform: uppercase; color: var(--muted); display: flex;
           align-items: center; gap: 12px; margin-bottom: 18px; }
.eyebrow::before { content: ""; width: 24px; height: 1.5px; background: var(--accent); }
h1 { font-family: var(--sans); font-weight: 600;
     font-size: clamp(34px, 4.8vw, 52px); line-height: 1.1;
     letter-spacing: -0.015em; margin: 0 0 8px; max-width: 22ch;
     color: var(--text); }
h1 em { font-style: normal; color: var(--accent); }
.sub { color: var(--muted); font-family: var(--mono); font-size: 13px; margin: 6px 0 0; }
.goal { font-size: 17px; color: var(--text-soft); margin: 22px 0 0; max-width: 620px; }
```

**2. Meta table**
```html
<table class="meta">
  <tr><th>Effort</th><td>~12 days</td></tr>
  <tr><th>Surfaces</th><td>API · web · realtime</td></tr>
  <tr><th>New tables</th><td>1 <code>(comments)</code></td></tr>
  <tr><th>Feature flag</th><td><code>comments.threads.v2</code></td></tr>
</table>
```
```css
table.meta { margin: 32px 0 0; border-collapse: collapse; font-size: 13px; }
table.meta th { text-align: left; padding: 8px 24px 8px 0; color: var(--muted);
                font-family: var(--mono); font-weight: 400; text-transform: uppercase;
                letter-spacing: 0.06em; font-size: 11px;
                border-bottom: 1px solid var(--border); }
table.meta td { padding: 8px 0; border-bottom: 1px solid var(--border);
                font-family: var(--mono); color: var(--text); }
table.meta code { background: var(--surface-alt); padding: 1px 6px; border-radius: 4px;
                  color: var(--link); }
```

**3. Section header** (`<section class="sec">` with eyebrow-style title)
```html
<section class="sec">
  <div class="sec-head">
    <span class="rule"></span>
    <h2>MILESTONES</h2>
  </div>
  …
</section>
```
```css
section.sec { margin-top: 64px; }
.sec-head { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
.sec-head .rule { width: 24px; height: 1.5px; background: var(--accent); }
.sec-head h2 { font-family: var(--mono); font-size: 12px; letter-spacing: 0.14em;
               text-transform: uppercase; color: var(--muted); font-weight: 500;
               margin: 0; }
```

**4. Numbered milestone card**
```html
<article class="mile" data-accent="clay">
  <div class="n">01</div>
  <div class="body">
    <div class="row"><h3>Research</h3><span class="when">Week 1 · Mon–Tue</span></div>
    <ul class="tasks">
      <li><input type="checkbox"> Audit comment-like patterns <span class="size">2d</span></li>
      <li><input type="checkbox"> Survey 3 realtime libs <span class="size">1d</span>
          <a class="dep" href="#audit-volume">↗ depends</a></li>
    </ul>
    <div class="ms">🏁 Approach decided</div>
    <p class="notes">Bias toward libs already in the dependency graph.</p>
  </div>
</article>
```
```css
article.mile { display: grid; grid-template-columns: 64px 1fr; gap: 24px;
               padding: 22px 26px; background: var(--surface);
               border: 1px solid var(--border); border-radius: 8px;
               border-left: 3px solid var(--accent); margin-bottom: 14px; }
article.mile[data-accent="olive"] { border-left-color: var(--ok); }
article.mile[data-accent="slate"] { border-left-color: var(--muted); }
article.mile[data-accent="oat"]   { border-left-color: var(--warn); }
article.mile[data-accent="rust"]  { border-left-color: var(--error); }
.mile .n { font-family: var(--mono); font-size: 32px; line-height: 1;
           color: var(--accent); font-weight: 600; letter-spacing: -0.02em; }
.mile h3 { font-family: var(--sans); font-weight: 600; font-size: 19px; margin: 0;
           color: var(--text); }
.mile .when { font-family: var(--mono); font-size: 12px; color: var(--muted); }
.mile .row { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.mile ul.tasks { list-style: none; padding: 0; margin: 0; }
.mile ul.tasks li { padding: 7px 0; display: flex; align-items: center; gap: 10px;
                    border-bottom: 1px dashed var(--border-soft); color: var(--text); }
.mile .size { font-family: var(--mono); font-size: 11px; color: var(--muted);
              background: var(--surface-alt); padding: 1px 6px; border-radius: 4px; }
.mile .dep { font-family: var(--mono); font-size: 11px; color: var(--link);
             text-decoration: none; margin-left: auto; }
.mile .dep:hover { color: var(--accent); }
.mile .ms { margin-top: 14px; font-size: 13px; color: var(--ok);
            font-family: var(--mono); }
.mile .notes { margin: 12px 0 0; font-size: 14px; color: var(--text-soft); }
input[type="checkbox"]:checked + * { text-decoration: line-through; opacity: 0.45; }
```

**5. Critical-path sticky note**
```html
<aside class="sticky">
  <div class="tag">✦ CRITICAL PATH</div>
  <div class="path">audit → survey → choose-algo → draft-iface → build-mw → wire-config</div>
  <div class="dur">12 days · 6 tasks</div>
</aside>
```
```css
aside.sticky { background: var(--surface-alt); padding: 16px 20px; border-radius: 6px;
               box-shadow: 0 12px 32px rgba(0,0,0,.35); margin: 24px 0;
               transform: rotate(-0.4deg); max-width: 580px;
               border: 1px solid var(--border);
               border-left: 3px solid var(--accent); }
.sticky .tag { font-family: var(--mono); font-size: 11px; letter-spacing: 0.10em;
               color: var(--accent); margin-bottom: 8px; }
.sticky .path { font-family: var(--mono); font-size: 13px; color: var(--text); }
.sticky .dur  { font-family: var(--mono); font-size: 11px; color: var(--muted);
                margin-top: 6px; }
```

**6. Hand-laid dependency SVG** (compute coordinates from PLAN)

Layout algorithm (deterministic):
- **Columns** = phases (in order). Column width = 200px. Column x = 120 + phaseIdx * 200.
- **Rows** = task index within phase. Row height = 70px. Row y = 60 + taskIdx * 70.
- Each task is a `<rect>` width 160, height 50, centered at (col + 80, row + 25).
- Phase title sits above its column at y=24, mono small.
- Edges: for each task with `dependsOn`, draw a `<path>` from the right edge of the
  source rect to the left edge of the target. Use a cubic Bézier with horizontal control
  points so curves bend naturally:
  `M sx sy C sx+60 sy, tx-60 ty, tx ty`.
- The critical path (compute as the longest chain by summed `size` through the DAG)
  gets `class="crit"` on its nodes AND edges — stroke clay, fill oat.
- Other nodes: stroke g500, fill paper. Edges: stroke g500.

```html
<svg class="dag" viewBox="0 0 [computed-w] [computed-h]" role="img" aria-label="Task dependency graph">
  <defs>
    <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#8b949e"/>
    </marker>
    <marker id="ah-c" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#f78166"/>
    </marker>
  </defs>
  <text class="col-title" x="200" y="24">RESEARCH</text>
  <text class="col-title" x="400" y="24">DESIGN</text>
  …
  <path class="edge"      d="M280,85 C340,85 340,85 360,85" marker-end="url(#ah)"/>
  <path class="edge crit" d="M280,155 C340,155 340,155 360,155" marker-end="url(#ah-c)"/>
  <g class="node">
    <rect x="120" y="60" width="160" height="50" rx="6"/>
    <text x="200" y="84" text-anchor="middle">Audit volume</text>
    <text x="200" y="100" text-anchor="middle" class="sub">2d</text>
  </g>
  <g class="node crit">
    <rect x="120" y="130" width="160" height="50" rx="6"/>
    <text x="200" y="154" text-anchor="middle">Survey libs</text>
    <text x="200" y="170" text-anchor="middle" class="sub">1d</text>
  </g>
  …
</svg>
```
```css
svg.dag { width: 100%; height: auto; font-family: var(--sans); }
svg.dag .col-title { font-family: var(--mono); font-size: 10px; fill: var(--muted);
                     letter-spacing: 0.14em; text-anchor: start;
                     text-transform: uppercase; }
svg.dag .node rect { fill: var(--surface); stroke: var(--border); stroke-width: 1.5; }
svg.dag .node text { fill: var(--text); font-size: 13px; }
svg.dag .node .sub { fill: var(--muted); font-family: var(--mono); font-size: 11px; }
svg.dag .node.crit rect { fill: var(--surface-alt); stroke: var(--accent);
                          stroke-width: 1.5; }
svg.dag .node.crit text { fill: var(--text); }
svg.dag .edge { fill: none; stroke: var(--muted); stroke-width: 1.5; opacity: 0.7; }
svg.dag .edge.crit { stroke: var(--accent); stroke-width: 2; opacity: 1; }
```

**7. Hand-laid dataflow SVG**

Layout algorithm:
- **Lanes** are horizontal bands. Lane height = 90px. Each lane has a title at left
  (mono small, `--g500`). Node y = laneIdx * 90 + 50.
- Nodes are placed left-to-right in **insertion order** within each lane, spaced
  evenly across the canvas width. If a node is referenced by an edge crossing 2+
  lanes, place it horizontally so the edge has minimal jog.
- Node rect: width 140, height 44, rx 6, fill `--surface`, stroke `--border`.
  Lane background subtle stripe (`--surface-alt` / `--bg` alternating).
- Edges: solid = primary flow (stroke `--muted`, marker arrow). Dashed = side effect /
  async (`stroke-dasharray: 5 4`, stroke `--ok` for success-side fan-out or `--warn`
  for retry/error paths, matching marker color).
- Edge labels in mono, 10px, fill `--text-soft`, positioned along the midpoint with a
  small `--bg` background rect for legibility.
- Legend below: small key for solid vs dashed in `--muted` mono.

(Same `<defs>` for markers as the dag.)

**8. Risk table**
```html
<table class="risks">
  <thead><tr><th>Risk</th><th>Sev</th><th>Mitigation</th></tr></thead>
  <tbody>
    <tr><td>Realtime fan-out backpressure under load</td>
        <td><span class="badge sev-HIGH">HIGH</span></td>
        <td>Bound channel size; drop oldest with audit log</td></tr>
    <tr><td>Migration 0042 locks <code>task_card</code></td>
        <td><span class="badge sev-MED">MED</span></td>
        <td>Run during low-traffic window; gate behind flag</td></tr>
  </tbody>
</table>
```
```css
table.risks { width: 100%; border-collapse: collapse; font-size: 14px;
              border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
table.risks th { text-align: left; padding: 10px 14px; background: var(--surface-alt);
                 font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em;
                 text-transform: uppercase; color: var(--muted); font-weight: 500;
                 border-bottom: 1px solid var(--border); }
table.risks td { padding: 12px 14px; border-bottom: 1px solid var(--border);
                 vertical-align: top; color: var(--text); background: var(--surface); }
table.risks tr:nth-child(even) td { background: var(--bg); }
table.risks tr:last-child td { border-bottom: none; }
table.risks code { background: var(--surface-alt); padding: 1px 5px; border-radius: 3px;
                   color: var(--link); font-size: 12px; }
.badge { font-family: var(--mono); font-size: 10px; font-weight: 600;
         padding: 2px 8px; border-radius: 4px; letter-spacing: 0.06em;
         color: var(--bg); }
.sev-HIGH { background: var(--error); }
.sev-MED  { background: var(--warn); }
.sev-LOW  { background: var(--ok); }
```

**9. Decision Q&A**
```html
<article class="q">
  <div class="qline"><span class="qmark">Q.</span> Thread depth — flat replies or arbitrary nesting?</div>
  <div class="decide">Decide with:
    <span class="pill">design</span>
    <span class="pill">platform</span>
  </div>
  <p class="ctx">Nesting complicates the schema and the read path; flat keeps it cheap.</p>
</article>
```
```css
article.q { padding: 18px 0; border-bottom: 1px solid var(--border); }
article.q:last-child { border-bottom: none; }
.qline { font-size: 16px; color: var(--text); margin-bottom: 8px; }
.qmark { font-family: var(--sans); font-weight: 700; color: var(--accent);
         margin-right: 6px; }
.decide { font-family: var(--mono); font-size: 11px; color: var(--muted);
          letter-spacing: 0.06em; }
.pill { display: inline-block; background: var(--surface-alt);
        border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px;
        margin-left: 6px; color: var(--text-soft); }
.ctx { font-size: 14px; color: var(--text-soft); margin: 10px 0 0; max-width: 640px; }
```

**10. Sidenote**
```html
<aside class="side">
  <span class="sn">[1]</span> We don't backfill — old tasks start empty.
</aside>
```
```css
aside.side { background: var(--surface-alt); border: 1px solid var(--border);
             border-left: 2px solid var(--warn); border-radius: 4px;
             padding: 8px 12px; margin: 12px 0; font-family: var(--mono);
             font-size: 12px; color: var(--text-soft); max-width: 480px; }
.sn { color: var(--warn); margin-right: 4px; font-weight: 600; }
```

**Interactivity — vanilla JS only:**
- Milestone card body collapse-toggle on click of the header row
- Checkbox change recomputes a small "X / Y tasks complete" counter shown near the
  Milestones section header
- No mermaid, no library load, no fetch

#### Choosing which components to include

| Always | Conditionally | Omit if |
|---|---|---|
| Masthead | Dataflow SVG | No cross-component interactions |
| Meta table | Sticky-note callout | Plan is < 3 phases |
| Numbered milestones | Sidenotes | No marginalia worth pulling out |
| Dependency SVG | | No `dependsOn` edges in PLAN |
| Risk table | | |
| Decisions Q&A | | |

If a section is omitted, do not emit a blank `<section>` for it — skip entirely.

### Step 5 — Write and Report

Ensure the artifact directory exists, then write the file:

```bash
mkdir -p ./.claude-artifacts
```

Write to `./.claude-artifacts/plan.html`. The directory is git-ignored globally via
`~/.config/git/ignore` — no per-project `.gitignore` edits needed.

Print this and nothing else after writing:

```
✓ .claude-artifacts/plan.html written
  Title:        <title>
  Phases:       <N>
  Tasks:        <total>  (deps: <N>)
  Crit path:    <N> days through <N> tasks
  Diagrams:     dependency [, dataflow]   ← list which SVGs were emitted
  Risks:        <N>  (HIGH <N> · MED <N> · LOW <N>)
  Decisions:    <N>

Open: xdg-open ./.claude-artifacts/plan.html
```

Do NOT print the HTML source.
