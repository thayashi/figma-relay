# CLAUDE.md — Figma Automation Platform

## Project Overview

This is a fork of [southleft/figma-console-mcp](https://github.com/southleft/figma-console-mcp) (v1.11.2, 57+ tools).
The goal is to extend it into a domain-specific Figma automation platform for the Strata Cloud Manager Config Overview design project.

## What this project already has (from upstream)

- 57+ MCP tools for Figma read/write via Desktop Bridge plugin (WebSocket 9223-9232)
- `figma_execute` — runs **arbitrary Figma Plugin API code** directly (this is key — it means we can call any Plugin API without adding new handlers)
- 11 variable management tools with batch operations (up to 100 at once)
- Design System Kit extraction (`figma_get_design_system_kit`)
- CDP fallback (port 9222) if WebSocket is unavailable
- MCP Apps (Token Browser, Design System Dashboard)
- npm published, installable via `npx figma-console-mcp`
- Tests (Jest), ESLint, Prettier, TypeScript

## What we are adding

### 1. HTTP Bridge (Priority: HIGH)

An HTTP REST API server (port 3056) that proxies commands to the existing WebSocket broker.
This allows non-MCP tools (curl, Python scripts, Claude Code via shell) to interact with Figma
without going through the MCP stdio protocol.

**Why**: Bypasses the need for MCP Gateway approval in corporate environments.
Claude Code can call `curl` directly instead of needing MCP configuration.

**Architecture**:
```
curl / scripts → HTTP Bridge (localhost:3056) → WebSocket → Desktop Bridge Plugin → Figma API
```

**Implementation location**: `src/http-bridge.ts` (new file)

**Endpoints**:
```
POST /join-channel     { "channel": "figma-xxxxx" }
POST /command          { "command": "get_document_info", "params": {} }
POST /execute          { "code": "figma.createRectangle()" }  // wraps figma_execute
GET  /status           // connection status
```

**Key decisions**:
- Reuse the existing WebSocket client code in `src/` — don't duplicate
- The `/execute` endpoint is the most powerful — it proxies to `figma_execute`
- Add `npm run start:http` script to package.json
- Create `start-http-bridge.bat` for Windows convenience

**Reference**: See uxmynd/figma-desktop-bidirectional-mcp's `server/http-bridge.ts` for a working
example of this pattern. Their implementation is ~200 lines.

### 2. Claude Code Skills (Priority: HIGH)

Skills go in `.claude/skills/` and teach Claude Code domain-specific workflows.

#### `.claude/skills/figma-bridge.md`

Foundation skill. Teaches Claude Code how to talk to Figma via HTTP Bridge.

Must include:
- HTTP Bridge endpoint spec (join-channel, command, execute, status)
- curl templates for all common operations
- The `execute` endpoint pattern for arbitrary Plugin API calls
- Error handling (plugin disconnected, timeout, channel invalid)
- How to discover channel ID (user provides it after opening plugin)

Example pattern to document:
```bash
# Join channel
curl -s -X POST http://localhost:3056/join-channel \
  -H "Content-Type: application/json" \
  -d '{"channel":"figma-xxxxx"}'

# Create a frame
curl -s -X POST http://localhost:3056/command \
  -H "Content-Type: application/json" \
  -d '{"command":"create_frame","params":{"name":"MyFrame","x":0,"y":0,"width":800,"height":600}}'

# Run arbitrary Plugin API code via execute
curl -s -X POST http://localhost:3056/execute \
  -H "Content-Type: application/json" \
  -d '{"code":"const comp = await figma.importComponentByKeyAsync(\"abc123\"); const inst = comp.createInstance(); return { id: inst.id, name: inst.name }"}'
```

#### `.claude/skills/design-system-refs.md`

Maps Design System library components to their component keys.

Must include:
- Component Key mapping table (populated by running `get_local_components` on DS file)
- How to import library components via `figma_execute`:
  ```javascript
  const comp = await figma.importComponentByKeyAsync("COMPONENT_KEY");
  const instance = comp.createInstance();
  instance.x = 100;
  instance.y = 200;
  ```
- How to set instance overrides (text content, variant properties)
- How to read component properties: `instance.componentProperties`

The mapping table will look like:
```
| Component        | Key              | Variants                     |
|------------------|------------------|------------------------------|
| TableHeader      | <to be filled>   | size: S/M/L                  |
| TableCell        | <to be filled>   | type: text/number/status     |
| TableRow         | <to be filled>   | state: default/hover/active  |
```

**To populate keys**: Open the Design System file in Figma, run the plugin, then:
```bash
curl -s -X POST http://localhost:3056/execute \
  -H "Content-Type: application/json" \
  -d '{"code":"const components = figma.currentPage.findAll(n => n.type === \"COMPONENT\"); return components.map(c => ({ name: c.name, key: c.key, id: c.id }))"}'
```

#### `.claude/skills/table-builder.md`

Generates Figma tables from CSV data using Design System components.

Must include:
- CSV parsing approach (Claude Code parses CSV, then issues commands)
- Step-by-step construction sequence:
  1. Import TableHeader/TableCell/TableRow via component key
  2. Create outer container Frame with vertical Auto-Layout
  3. For header row: create instance of TableHeader, set text for each column
  4. For each data row: create instance of TableRow, populate cells
  5. Configure Auto-Layout (gap, padding, sizing)
- Adding columns to existing table (find table frame, add cell to each row)
- Adding rows to existing table (create new row instance, append to frame)
- All operations use `figma_execute` with Plugin API code

#### `.claude/skills/naming-conventions.md`

Defines and enforces frame/layer naming rules.

Must include:
- Naming convention rules:
  ```
  | Layer Type   | Convention    | Example              |
  |--------------|---------------|----------------------|
  | Page         | Title Case    | "Config Overview"    |
  | Frame        | PascalCase    | "TableContainer"     |
  | Component    | PascalCase    | "StatusBadge"        |
  | Instance     | camelCase     | "headerRow"          |
  | Text layer   | Descriptive   | "Page title text"    |
  | Group        | kebab-case    | "action-buttons"     |
  ```
- Audit mode: scan all nodes, report violations, don't rename
- Fix mode: scan and rename violations automatically
- Uses `figma_execute` with `figma.currentPage.findAll()` + name pattern matching
- Batch rename pattern to avoid excessive API calls

#### `.claude/skills/work-log.md`

Generates work summaries from multiple sources.

Must include:
- Auto-save version after major operations:
  ```javascript
  await figma.saveVersionHistoryAsync("AI: Created table from CSV data");
  ```
- Collect Figma comments (if REST API key available):
  ```
  GET https://api.figma.com/v1/files/{file_key}/comments
  ```
- Parse Claude Code conversation history for operation summaries
- Output format: Markdown summary with date, operations, components affected
- Template:
  ```markdown
  ## Work Session Summary — {date}
  ### Operations Performed
  - Created table layout from CSV (12 rows, 5 columns)
  - Applied naming conventions to 47 layers
  - Added 3 new columns to existing table
  ### Components Used
  - TableHeader (DS library)
  - TableCell (DS library)
  ### Open Items
  - Review spacing in mobile breakpoint
  ```

### 3. Full Plugin API Coverage (Priority: MEDIUM)

Thanks to `figma_execute`, we don't need to add individual handlers for most Plugin APIs.
However, for frequently used operations, dedicated commands are more token-efficient.

Add these as new MCP tools in `src/tools/` if usage is frequent:

| Tool Name | Plugin API | When to add |
|---|---|---|
| `figma_import_component_by_key` | `figma.importComponentByKeyAsync(key)` | When table-builder workflow is validated |
| `figma_save_version` | `figma.saveVersionHistoryAsync(title)` | When work-log workflow is validated |
| `figma_get_component_properties` | `instance.componentProperties` | When instance override workflow is validated |
| `figma_set_component_properties` | `instance.setProperties({})` | Same as above |

**Rule**: Start with `figma_execute` for everything. Only promote to a dedicated tool
when a pattern is used >10 times and the code is always the same.

## Development Phases

### Phase 1: Fork & HTTP Bridge (Do this first)

1. Fork southleft/figma-console-mcp
2. Clone locally, `npm install`, `npm run build:local`, verify base functionality works
3. Read the codebase structure:
   - `src/` — MCP server source (TypeScript)
   - `figma-desktop-bridge/` — Figma plugin source
   - `tests/` — Jest test suite
   - `docs/` — Documentation
4. Implement HTTP Bridge:
   - Create `src/http-bridge.ts`
   - Add Express or native http server on port 3056
   - Implement /join-channel, /command, /execute, /status endpoints
   - Wire into existing WebSocket client
   - Add `npm run start:http` script
   - Create `start-http-bridge.bat` for Windows
5. Test: verify `curl` commands work end-to-end with Figma
6. Create `.claude/skills/figma-bridge.md`

**Verification**: Run this and see a result in Figma:
```bash
curl -s -X POST http://localhost:3056/command \
  -d '{"command":"create_frame","params":{"name":"TestFrame","x":0,"y":0,"width":400,"height":300}}'
```

### Phase 2: Design System Integration

1. Open Design System file in Figma
2. Run plugin and extract component keys:
   ```bash
   curl -s -X POST http://localhost:3056/execute \
     -d '{"code":"return figma.currentPage.findAll(n => n.type === \"COMPONENT\").map(c => ({name: c.name, key: c.key}))"}'
   ```
3. Populate `.claude/skills/design-system-refs.md` with real keys
4. Test: import a library component into working file via `figma_execute`
5. Create `.claude/skills/table-builder.md`
6. Test end-to-end: CSV string → Table in Figma

### Phase 3: Naming Conventions & Work Log

1. Create `.claude/skills/naming-conventions.md`
2. Test: audit a page for naming violations
3. Test: batch rename violations
4. Create `.claude/skills/work-log.md`
5. Test: save version history after operation
6. Test: generate session summary

### Phase 4: Polish & Iterate

1. Promote frequently-used `figma_execute` patterns to dedicated MCP tools
2. Add tests for HTTP Bridge
3. Refine Skills based on actual usage friction
4. Consider upstream PR for HTTP Bridge (generic feature)
5. Document Windows-specific setup notes

## Environment

- **OS**: Windows 11
- **Node.js**: 18+
- **Figma**: Desktop app (v126+, no CDP patching needed — using WebSocket plugin)
- **AI Tools**: Claude Code (primary), Cursor (secondary)
- **Design System**: Separate Figma team, published as library

## Key Files to Understand First

Before making changes, read these files in order:

1. `package.json` — scripts, dependencies, project structure
2. `src/index.ts` or `src/local.ts` — MCP server entry point
3. `src/tools/` — how tools are defined (follow existing patterns for new tools)
4. `figma-desktop-bridge/` — plugin source (understand WebSocket protocol)
5. `docs/setup.md` — understand connection flow
6. `tests/` — existing test patterns

## Conventions

- Follow existing code style (Prettier + ESLint configured)
- TypeScript strict mode
- New tools go in `src/tools/` following existing module pattern
- Skills go in `.claude/skills/` as Markdown files
- Test new tools with Jest, matching existing test file patterns
- Commit messages: `feat:`, `fix:`, `docs:`, `refactor:`
- Always create a new branch from `main` before starting work. Never commit directly to `main`
- Branch naming: `feature/<description>`, `fix/<description>`, `docs/<description>`, `refactor/<description>`
  - Examples: `feature/add-http-bridge`, `fix/websocket-timeout`

## Important Constraints

- **No MCP Gateway needed** if using HTTP Bridge route
- **figma_execute is the escape hatch** — use it before adding new handlers
- **Design System is in a separate Figma team** — component keys are needed for cross-file references
- **Plugin API can save versions but cannot read version history** (REST API needed for reading)
- **Figma comments require REST API + API key** (not available via Plugin API)
- **Windows**: use `.bat` scripts for convenience, test paths with backslashes
