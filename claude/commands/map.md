# map

Generates a structured dependency and dataflow summary for a subsystem, output as `map.html` in the current directory.

Not the same as `/graphify`: `/map` is targeted (one subsystem), dataflow-focused, and outputs a human-readable HTML document. `/graphify` builds a persistent, queryable knowledge graph for the whole codebase. Use `/map` when you need to understand a specific area now; use `/graphify` when you'll query it across sessions.

## Usage

```
/map path/to/subsystem/     # analyze a directory
/map path/to/file.py        # analyze a single file's relationships
/map .                      # analyze current directory
```

## What You Must Do When Invoked

### Step 1 — Spawn the dependency-mapper agent

Use the Agent tool with `subagent_type: "dependency-mapper"`. Pass this prompt (replace PATH):

```
Analyze the dependency and dataflow structure of: PATH

Return structured JSON with these sections:
{
  "target": "what was analyzed",
  "modules": [{"name": "...", "file": "...", "description": "one-line role"}],
  "call_graph": [{"caller": "...", "callee": "...", "call_type": "direct|import|event|callback", "notes": "..."}],
  "shared_state": [{"name": "...", "owner": "...", "type": "global|singleton|shared-ref|config", "readers": [...], "writers": [...]}],
  "implicit_ordering": [{"before": "...", "after": "...", "reason": "..."}],
  "data_flows": [{"from": "...", "to": "...", "data": "...", "mechanism": "return|arg|event|shared-state|file|db"}],
  "entry_points": [{"name": "...", "file": "...", "description": "..."}],
  "external_deps": [{"name": "...", "used_by": [...], "purpose": "..."}],
  "notes": ["anything surprising, implicit, or non-obvious"]
}
```

### Step 2 — Generate the HTML

Take the JSON the agent returned and write `map.html` to the current directory. Self-contained — no CDN, no external assets. Inline CSS and vanilla JS only.

HTML structure:
- Fixed left sidebar with jump links to each section
- Main content area with sections: Overview, Modules, Call Graph, Shared State, Implicit Ordering, Data Flow, External Dependencies, Notes
- Each section has a toggle to collapse/expand (default expanded)
- Modules are color-tagged consistently across all sections (same module = same color dot/badge, 6-8 color palette cycling)
- Entry points highlighted prominently in Overview
- Empty sections are hidden, not shown as blank tables
- Notes section uses a yellow/amber callout style — this is where surprises land
- Dark sidebar, white content area, monospace for code elements

### Step 3 — Report

Tell the user: `map.html written — open in any browser.`

Then give a 3-5 bullet summary of the most important findings: key entry points, any shared state that crosses many modules, surprising implicit ordering, anything flagged in notes. Keep it tight — the HTML is the deliverable.
