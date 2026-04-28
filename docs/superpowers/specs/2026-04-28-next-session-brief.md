# Next Session Brief: Skill Integration Brainstorming

**Date**: 2026-04-28
**Mode**: Plan / Discussion — do NOT implement yet
**Goal**: Refine the integration strategy for Figma's official MCP skills into figma-relay

---

## 1. Project Context

figma-relay is an HTTP Bridge wrapper over figma-console-mcp's WebSocket + Plugin system.
In practice, only the `POST /execute` endpoint is used — it sends arbitrary Plugin API
JavaScript to the Figma Desktop Plugin via WebSocket, where it's `eval`'d in the Plugin sandbox.

### What just shipped (previous session)

- **Timeout strategy (A+B+C+D)** — all tested and merged to main:
  - A: Heartbeat mechanism (Plugin → UI → WS Server timer reset, 15s sliding window)
  - B: Enriched timeout responses (HTTP 504, `timedOut`, `mayStillBeRunning`, `requestId`)
  - C: Raised limits (default 5s→15s, cap 30s→60s)
  - D: Plugin helper functions on `globalThis` (`__batchProcess`, `__loadFontsForNodes`,
    `__findNodes`, `__batchSetText`, `__reportProgress`)
- Plugin-side `Promise.race` timeout removed (WS Server now owns timeout management)
- Discovered: Figma Plugin sandbox `eval` cannot access top-level function declarations;
  must use `globalThis` for helpers
- Request logging (pino, session-based JSONL in `logs/`)
- Roadmap document created

### What was added

`reference/mcp-server-guide-main/` — Figma's official MCP server guide with 56 skill files
covering the full Plugin API surface, design system workflows, code generation, and more.

---

## 2. The Question Being Explored

Figma provides comprehensive, well-structured skills for their hosted MCP server
(`use_figma` tool at `https://mcp.figma.com/mcp`). The Plugin API code inside these
skills is **identical** to what we run via `/execute`. Only the transport differs:

```
Official:  use_figma(code: "figma.createFrame()", fileKey: "abc")
Ours:      POST /execute { "code": "figma.createFrame()", "fileKey": "abc" }
```

**Core question**: How should figma-relay integrate/adapt these skills to improve
the agent's Figma operations — without losing the simplicity of our HTTP Bridge approach?

A draft integration plan exists but needs refinement through discussion.

---

## 3. Key Files to Read

Read these in order of priority:

| Priority | File | What it contains |
|---|---|---|
| 1 | `docs/superpowers/specs/2026-04-28-skill-integration-plan.md` | Draft integration plan from this session |
| 2 | `docs/superpowers/roadmap.md` | Overall project roadmap with completed/pending items |
| 3 | `reference/mcp-server-guide-main/skills/figma-use/SKILL.md` | Core official skill — critical rules, page rules, efficient APIs, incremental workflow, error recovery, pre-flight checklist |
| 4 | `reference/mcp-server-guide-main/skills/figma-use/references/gotchas.md` | Every known Plugin API pitfall with WRONG/CORRECT examples |
| 5 | `reference/mcp-server-guide-main/skills/figma-use/references/common-patterns.md` | Working code examples for shapes, text, auto-layout, variables, components |
| 6 | `reference/mcp-server-guide-main/skills/figma-generate-design/SKILL.md` | Screen building workflow using design system components |
| 7 | `reference/mcp-server-guide-main/README.md` | Official MCP server overview, all available tools |
| 8 | `.claude/skills/` | Current figma-relay skills (3 files: figma-bridge.md, figma-structure.md, design-review.md) |

Also valuable but lower priority:
- `reference/mcp-server-guide-main/skills/figma-use/references/variable-patterns.md`
- `reference/mcp-server-guide-main/skills/figma-use/references/component-patterns.md`
- `reference/mcp-server-guide-main/skills/figma-use/references/working-with-design-systems/wwds.md`
- `reference/mcp-server-guide-main/skills/figma-implement-design/SKILL.md`
- `reference/mcp-server-guide-main/skills/figma-generate-library/SKILL.md`

---

## 4. Open Discussion Topics

### 4a. New API Availability

The official skills reference newer Plugin APIs:
- `node.query(selector)` — CSS-like node search (replaces verbose `findAll` + filter)
- `node.set(props)` — batch property updates in one call
- `figma.createAutoLayout(direction?, props?)` — auto-layout frame creation
- `node.placeholder` — shimmer overlay for in-progress feedback
- `await node.screenshot(opts?)` — inline screenshot capture

**Question**: Do these work in our Plugin? They depend on the Figma Desktop version.
Need to test by running them via `/execute`. If they work, our helpers like `__findNodes`
may be partially redundant (though `__findNodes` returns lightweight descriptors which
`node.query()` does not).

### 4b. search_design_system Alternative

The official MCP server has `search_design_system` — a hosted tool that searches across
all connected design libraries for components, variables, and styles. We don't have this.

Options:
- REST API proxy: `GET /api/files/:fileKey/components` (reads a specific library file)
- Plugin API: `figma.variables.getLocalVariableCollectionsAsync()` (local only)
- Plugin API: `figma.teamLibrary` (may not work in Plugin sandbox)
- Workaround: manually maintain a component key map in a skill file

**Question**: Is this a blocker for Phase 2, or can we work around it?

### 4c. Skill Architecture

Official structure: one SKILL.md + many `references/*.md` files.

Options for figma-relay:
1. **Mirror the official structure**: `.claude/skills/figma-use/SKILL.md` + `references/`
2. **Flat skills**: `.claude/skills/figma-plugin-api.md` (single file, references official)
3. **Hybrid**: adapter SKILL.md in `.claude/skills/`, point to `reference/` for details

**Question**: What's the right balance between completeness and token efficiency?
A 400-line skill file gets loaded every time — is that too much context?

### 4d. Agent Reads reference/ Directly?

The `reference/` folder has 56 markdown files. Options:
1. **Keep as-is**: Agent can grep/read from `reference/` on demand
2. **Extract + adapt**: Copy relevant content into `.claude/skills/` with transport layer translated
3. **Symlink/include**: Skills reference the files but don't copy

**Question**: Claude Code skills are loaded automatically when triggered. Agent reading
from `reference/` requires explicit grep. Is auto-loading worth the context cost?

### 4e. REST API Proxy Priority

Phase 2 of the integration plan depends on REST API access in HTTP Bridge.
The roadmap has it as a short-term item. Should it be done before or alongside
skill integration?

### 4f. Plugin Helpers + Official Patterns

Our helpers (`__batchProcess`, `__loadFontsForNodes`, `__batchSetText`, `__reportProgress`)
complement the official patterns. The official skills don't have batch processing or
heartbeat — those are unique to figma-relay.

**Question**: How to document both? Should skills mention our helpers alongside
official patterns? Or keep them separate?

---

## 5. What NOT to Do in This Session

- Do NOT start implementing skills
- Do NOT modify existing `.claude/skills/` files
- Do NOT modify code in `src/` or `figma-desktop-bridge/`
- Stay in Plan mode — brainstorm, discuss trade-offs, refine the integration plan
- If the discussion reaches a clear conclusion, update the plan document at
  `docs/superpowers/specs/2026-04-28-skill-integration-plan.md`

---

## 6. Conversation History Reference

The previous session (this one) covered:
1. Architecture deep-dive of figma-relay (WebSocket server, Plugin, connectors)
2. Log analysis: 79 requests in 16 min, all `/execute`, 19% timeout, agent uses
   medium-granularity code (300-1400 chars), retries by splitting after timeout
3. MCP vs HTTP Bridge discussion — concluded MCP adds overhead without value for
   this single-user, single-tool use case
4. Timeout strategy design and implementation (A+B+C+D), tested with real Figma file
5. Bug fix: globalThis for Plugin helpers, 3-layer heartbeat chain
6. Git workflow: 2 commits, PRs, merged to main
7. Initial read of official Figma MCP skills, draft integration plan written

The draft plan is at `docs/superpowers/specs/2026-04-28-skill-integration-plan.md`.
It proposes 4 phases but the details need refinement through discussion.
