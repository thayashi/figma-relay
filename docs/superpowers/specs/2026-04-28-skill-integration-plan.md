# Skill Integration Plan: Figma Official MCP Skills → figma-relay

Date: 2026-04-28
Status: Draft — to be refined and executed in a follow-up session.

## Context

Figma provides an official set of skills in `reference/mcp-server-guide-main/skills/` designed
for their hosted MCP server (`https://mcp.figma.com/mcp`). These skills are high-quality,
well-structured, and cover the full Figma Plugin API surface.

Our project (`figma-relay`) uses a local HTTP Bridge + WebSocket Plugin instead of Figma's
hosted MCP server. The key difference: we use `/execute` (arbitrary Plugin API code via eval)
while the official skills target `use_figma` (Figma's hosted equivalent). The underlying
Plugin API is the same — the transport differs.

## Official Skills Inventory

| Skill | SKILL.md | References | Purpose |
|---|---|---|---|
| **figma-use** | Core rules for Plugin API | 15+ reference files (gotchas, patterns, variables, components, text styles, effects, design systems) | Foundation skill for ANY write operation |
| **figma-generate-design** | Build screens from DS components | — | Screen/view composition workflow |
| **figma-implement-design** | Figma → Code translation | — | Design-to-code workflow |
| **figma-code-connect** | Code Connect mappings | 2 refs (API, advanced patterns) | Link Figma components to code |
| **figma-generate-library** | Build component libraries | 7 refs (discovery, naming, tokens, docs, errors) | Create design system in Figma |
| **figma-create-design-system-rules** | Generate rule files | — | Auto-generate AGENTS.md-style rules |
| **figma-use-figjam** | FigJam operations | 12 refs (stickies, connectors, tables, etc.) | FigJam board creation |
| **figma-generate-diagram** | Mermaid → FigJam diagrams | 7 refs (flowchart, ERD, gantt, sequence, etc.) | Diagram generation |
| **figma-create-new-file** | Create blank files | — | File creation |

### Key Reference Files (figma-use)

These are the most valuable for our use case:

| Reference | Content | Priority |
|---|---|---|
| `gotchas.md` | Every known pitfall with WRONG/CORRECT examples | **Critical** |
| `common-patterns.md` | Working code examples for shapes, text, auto-layout, variables | **Critical** |
| `plugin-api-patterns.md` | Fills, strokes, Auto Layout, effects, grouping | **High** |
| `variable-patterns.md` | Collections, modes, scopes, aliasing, binding | **High** |
| `component-patterns.md` | Variants, properties, INSTANCE_SWAP, metadata | **High** |
| `text-style-patterns.md` | Type ramps, font discovery, style application | **Medium** |
| `effect-style-patterns.md` | Shadows, blur, style application | **Medium** |
| `validation-and-recovery.md` | Error recovery, get_metadata vs get_screenshot | **Medium** |
| `api-reference.md` | Exact API surface | **Reference** |
| `plugin-api-standalone.d.ts` | Full TypeScript typings | **Reference** |
| `working-with-design-systems/` | 8 files covering DS components, variables, styles | **High** |

## Current figma-relay Skills

| Skill | Content |
|---|---|
| `figma-bridge.md` | HTTP Bridge connection (curl templates for /execute, /command, /status) |
| `figma-structure.md` | Figma node types, auto-layout, gotchas — **overlaps with official gotchas.md** |
| `design-review.md` | Screenshot-based review after visual changes |

## Integration Strategy

### Principle: Adapt, Don't Fork

The official skills reference `use_figma` tool calls. Our equivalent is `POST /execute`.
The Plugin API code inside is identical. We should:

1. **Keep the official skills as-is in `reference/`** — they are the upstream source of truth
2. **Create thin adapter skills in `.claude/skills/`** that reference the official content
   but translate the transport layer (use_figma → /execute)

### Phase 1: Foundation (Immediate Value)

**Goal: Give the agent the same Plugin API knowledge as Figma's official skills.**

1. **Create `.claude/skills/figma-plugin-api.md`** — Adapter skill that:
   - References `reference/mcp-server-guide-main/skills/figma-use/SKILL.md` critical rules
   - Maps `use_figma` patterns to `/execute` patterns
   - Includes the transport translation:
     ```
     Official: use_figma(code: "...", fileKey: "...")
     Ours:     POST /execute { code: "...", fileKey: "..." }
     ```
   - Points to reference files for gotchas, patterns, variables, components
   - Adds our Plugin helpers (__batchProcess, __reportProgress, etc.)

2. **Merge gotchas into `figma-structure.md`** (or replace):
   - Official `gotchas.md` is more comprehensive than our current `figma-structure.md`
   - Our `figma-structure.md` has some unique content (node type reference)
   - Merge: keep our node type reference, adopt official gotchas

3. **Keep `figma-bridge.md` as-is** — transport-specific, no official equivalent
4. **Keep `design-review.md` as-is** — unique to our workflow

### Phase 2: Design System Workflow

**Goal: Enable the agent to discover and use published DS components.**

1. **Create `.claude/skills/figma-design-system.md`** — Adapter for:
   - `figma-generate-design` workflow (build screens from DS components)
   - Component discovery patterns (Code Connect → existing screens → search)
   - Variable discovery (local vs library)
   - Style discovery (text styles, effect styles)
   - Adapted for /execute + REST API (when REST API proxy is added)

2. **REST API proxy prerequisite** — The official skills use `search_design_system`
   (a hosted MCP tool). We don't have that. Our equivalent will be:
   - REST API: `GET /api/files/:fileKey/components` for cross-file component discovery
   - Plugin API: `figma.variables.getLocalVariableCollectionsAsync()` for local variables
   - The REST API proxy (roadmap item) becomes more important here

### Phase 3: Code-to-Design and Design-to-Code

**Goal: Bidirectional workflow between code and Figma.**

1. **Adapt `figma-implement-design`** — This skill extracts design context and
   generates code. Our version would use REST API (get file data) + Plugin API
   (get screenshots via our screenshot endpoint).

2. **Adapt `figma-code-connect`** — Link codebase components to Figma components.
   Useful for the agent to know which DS component key to use for which code component.

### Phase 4: Advanced (Library Building, Diagrams)

Lower priority, adapt only if needed:
- `figma-generate-library` — building component libraries in Figma
- `figma-generate-diagram` — Mermaid → FigJam
- `figma-use-figjam` — FigJam operations
- `figma-create-new-file` — file creation

## Key Differences: Official MCP vs figma-relay

| Aspect | Official Figma MCP | figma-relay |
|---|---|---|
| Transport | `use_figma` hosted tool | `POST /execute` HTTP |
| Auth | OAuth via MCP | Local (no auth needed) |
| Rate limits | Tier 1 REST API limits | None (local) |
| `search_design_system` | Available (hosted) | Not available — need REST API proxy |
| `get_design_context` | Available (hosted, generates React+Tailwind) | Not available — use Plugin API directly |
| `get_screenshot` | Available (hosted) | `POST /screenshot` endpoint |
| `get_metadata` | Available (hosted) | Plugin API: `figma.currentPage.findAll(...)` |
| Atomic execution | Yes (failed scripts = no changes) | Yes (same — Plugin eval is atomic) |
| `node.query()` | Available (newer API) | Available if Figma Desktop is recent enough |
| `node.set()` | Available (newer API) | Available if Figma Desktop is recent enough |
| `figma.createAutoLayout()` | Available (newer API) | Available if Figma Desktop is recent enough |
| Plugin helpers | None | `__batchProcess`, `__loadFontsForNodes`, `__findNodes`, `__batchSetText`, `__reportProgress` |
| Heartbeat/timeout | Managed by hosted server | Our heartbeat mechanism (A+B+C+D) |

## Immediate Action Items

1. [ ] Read ALL reference files in `figma-use/references/` thoroughly
2. [ ] Create `figma-plugin-api.md` adapter skill (Phase 1, item 1)
3. [ ] Merge gotchas into existing skills (Phase 1, item 2)
4. [ ] Test with a real task: build a DataTable using DS components
5. [ ] Implement REST API proxy in HTTP Bridge (enables Phase 2)
6. [ ] Create `figma-design-system.md` adapter skill (Phase 2)

## Open Questions

- Should we check if `node.query()`, `node.set()`, `figma.createAutoLayout()` work
  in our Plugin version? These are newer APIs from the official skills.
- Do we want to keep the reference folder in the repo permanently, or extract
  only what we need into our skills?
- Should `figma-plugin-api.md` be a single large skill or split into sub-skills
  matching the official structure?
