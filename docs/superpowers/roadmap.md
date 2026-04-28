# Figma Relay — Roadmap

Task list derived from architecture review and session log analysis (2026-04-27).

## Context

This project forks figma-console-mcp (57+ MCP tools) but in practice uses only the
HTTP Bridge with a single `/execute` endpoint for AI-agent-driven batch automation.
Session log analysis (79 requests, 16 min) confirmed that the real bottleneck is
Plugin-side execution time, not transport overhead (HTTP vs MCP adds ~0.3 s total).

---

## Short Term

### Add REST API proxy to HTTP Bridge
- `FigmaAPI` class already exists in `src/core/figma-api.ts` — well-structured, standalone
- Currently only wired into MCP mode (`local.ts`); HTTP Bridge has no access
- Primary use case: read Design System data from a separate Figma file (components, variables, styles)
- Proposed endpoints:
  ```
  GET /api/files/:fileKey
  GET /api/files/:fileKey/components
  GET /api/files/:fileKey/variables/local
  GET /api/files/:fileKey/variables/published
  GET /api/files/:fileKey/styles
  GET /api/files/:fileKey/images
  GET /api/files/:fileKey/comments
  ```
- Enable only when `FIGMA_ACCESS_TOKEN` env var is set; otherwise Plugin API only
- Effort: small — instantiate `FigmaAPI`, add route handlers

### ~~Improve timeout strategy~~ DONE (2026-04-28)
- ~~Log analysis showed 19% of requests timed out (all at the 32 s cap)~~
- Implemented:
  - **(A) Heartbeat + timer reset**: Plugin helpers send `EXECUTE_CODE_PROGRESS` via UI→WebSocket; server resets timeout on each heartbeat (15 s sliding window). Long operations survive as long as they report progress.
  - **(B) Timeout response enrichment**: Timeout errors now return HTTP 504 with `timedOut`, `mayStillBeRunning`, `requestId` fields. `/status` exposes `pendingRequests` count for polling.
  - **(C) Raised limits**: Default timeout 5 s → 15 s; cap 30 s → 60 s.
  - **(D) Plugin helper functions**: `__batchProcess`, `__loadFontsForNodes`, `__findNodes`, `__batchSetText`, `__reportProgress` built into Plugin scope — agent code can call them directly.

---

## Medium Term

### Dead code cleanup
- ~90% of the codebase is unused for the HTTP Bridge use case:
  - MCP server + 57 tool registrations (`local.ts`, 5600 lines)
  - `WebSocketConnector` individual command methods (only `executeCodeViaUI` is called)
  - Legacy CDP connector (`figma-desktop-connector.ts`, 1500 lines)
  - Browser manager, MCP apps (token browser, design system dashboard)
- Decision needed: strip to a lean core, or keep upstream compatibility for merging
- If stripping: the essential modules are `http-bridge.ts`, `websocket-server.ts`, `port-discovery.ts`, `logger.ts`, `figma-api.ts`, and the Plugin files

### Plugin performance optimization
- `findAll` on large documents triggers 32 s timeouts — the single biggest bottleneck
- `loadFontAsync` called per-node instead of batched (collect unique fonts first, load once)
- Text property setting after font load is sequential — could batch
- Plugin sandbox constraints (no optional chaining, no top-level await) add friction
- Consider: Plugin-side helper functions that the agent can call for common heavy patterns

### Plugin simplification
- Current Plugin UI (`ui.html`) is complex — handles WebSocket, channel management, status display
- For the HTTP Bridge use case, the Plugin only needs: connect to WebSocket, receive code, execute, return result
- Potential to slim the Plugin to a minimal relay with no UI chrome
- Needs further discussion on what UX is still valuable (connection status? channel display?)

### Architecture decision: MCP mode
- MCP adds value when: multiple users, tool discovery needed, ecosystem integration, safety guardrails
- MCP adds overhead when: single user, one "execute" tool, agent already knows the API
- Options:
  1. **Keep both** — maintain MCP for community/upstream, HTTP Bridge for personal use
  2. **HTTP Bridge only** — fork diverges fully, simpler but no upstream sync
  3. **Extract shared core** — `websocket-server` + `figma-api` as a library, MCP and HTTP Bridge as thin wrappers
- No rush — current dual-mode works, just carries dead weight

---

## Long Term

### Desktop app (Tauri)
- Goal: eliminate `npm run start:http` — launch a native app instead
- Core components needed:
  1. WebSocket server (Plugin communication)
  2. HTTP endpoint (`/execute` + REST API proxy)
  3. Plugin files (code.js + ui.html)
- Tauri preferred over Electron for binary size and resource usage
- Could bundle the Figma Plugin installer/updater
- Prerequisite: finalize which features survive the cleanup above
