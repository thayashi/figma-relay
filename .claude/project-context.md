# Figma Relay - Project Context

## Project Overview

**Name:** Figma Relay
**Type:** HTTP Bridge + MCP Server for Figma
**Language:** TypeScript
**Runtime:** Node.js >= 18
**Based on:** [figma-console-mcp](https://github.com/southleft/figma-console-mcp) (v1.11.2, 57+ tools)

## Purpose

Enable AI coding assistants (Claude Code, Cursor, etc.) and any HTTP client to interact with Figma in real-time through a three-tier architecture:

1. **HTTP Bridge Mode** - REST API (port 3056) that proxies commands to Figma via WebSocket — no MCP client required
2. **MCP Mode** - Full MCP server with 57+ tools for MCP-compatible clients
3. **Desktop Bridge Mode** - Full read/write access via a Figma plugin that executes commands locally

## Key Technologies

- **@modelcontextprotocol/sdk** - MCP protocol implementation
- **Figma Plugin API** - Design manipulation via Desktop Bridge
- **TypeScript** - Type-safe development
- **Biome** - Formatting and linting
- **Jest** - Testing framework

## Architecture

```
curl / Python / Claude Code → HTTP Bridge (localhost:3056) → WebSocket → Desktop Bridge Plugin → Figma
```

Three deployment modes:

### HTTP Bridge Mode (New in Figma Relay)
- REST API on port 3056
- Endpoints: /status, /join-channel, /command, /execute, /screenshot
- Any HTTP client can control Figma
- No MCP Gateway approval needed

### Local Mode (Desktop Bridge)
- Connects to Figma Desktop via plugin
- Full read/write capabilities
- Execute arbitrary Figma Plugin API code via `figma_execute`

### Cloudflare Mode
- REST API for read-only operations
- Scalable cloud deployment

## Core Tool Categories

### Console & Debugging
- `figma_get_console_logs` - Retrieve plugin console output
- `figma_take_screenshot` - Capture plugin UI
- `figma_watch_console` - Stream logs in real-time
- `figma_reload_plugin` - Reload after code changes

### Design System (Read)
- `figma_get_file_data` - File structure and metadata
- `figma_get_variables` - Design tokens and variables
- `figma_get_component` - Component definitions
- `figma_get_styles` - Color, text, effect styles

### Design Manipulation (Desktop Bridge)
- `figma_execute` - Run arbitrary Plugin API code
- `figma_create_child` - Add nodes to frames
- `figma_set_fills` / `figma_set_strokes` - Modify appearance
- `figma_resize_node` / `figma_move_node` - Transform nodes
- Component property management tools

## Development Workflow

1. Write code → Follow MCP SDK patterns
2. Format → `npm run format`
3. Lint → `npm run lint:fix`
4. Test → `npm test`
5. Build → `npm run build`

## References

- [README](../README.md) - Setup and usage
- [docs/](../docs/) - Detailed documentation
- [Upstream: figma-console-mcp](https://github.com/southleft/figma-console-mcp)
