# Figma Relay

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io/)

> **Control Figma from any tool — no MCP client required.** An HTTP Bridge + automation platform that lets `curl`, Python scripts, and AI coding agents (Claude Code, Cursor, etc.) read and write Figma designs through a simple REST API.

**Based on [figma-console-mcp](https://github.com/southleft/figma-console-mcp)** (v1.11.2, 57+ MCP tools) by [southleft](https://github.com/southleft). Figma Relay extends it with an HTTP REST bridge and domain-specific automation skills.

---

## Why Figma Relay?

The upstream [figma-console-mcp](https://github.com/southleft/figma-console-mcp) is an excellent MCP server for Figma — 57+ tools for design extraction, creation, debugging, and variable management. But it requires an MCP-compatible client (Claude Desktop, Cursor, etc.) to use.

**Figma Relay removes that requirement** by adding an HTTP Bridge server that any tool can talk to:

```
curl / Python / Claude Code ──→ HTTP Bridge (localhost:3056) ──→ WebSocket ──→ Figma Desktop Bridge Plugin ──→ Figma
```

This means:
- **Claude Code** can control Figma via `curl` — no MCP Gateway approval needed
- **Python scripts** can automate Figma design workflows
- **Any HTTP client** can create, read, and modify Figma designs
- **All 57+ upstream MCP tools** still work as before for MCP clients

---

## What's Added on Top of Upstream

| Feature | Description |
|---------|-------------|
| **HTTP Bridge** | REST API server (port 3056) that proxies commands to Figma via WebSocket |
| **Claude Code Skills** | Markdown skill files that teach AI agents Figma automation workflows |
| **Auto-approve Hooks** | Pre-configured hooks so Claude Code can call the HTTP Bridge without manual approval |

Everything from the upstream project is preserved — MCP tools, Desktop Bridge plugin, MCP Apps, variable management, design system extraction, etc.

---

## Quick Start

### Prerequisites

- **Node.js 18+**
- **Figma Desktop** with the Desktop Bridge plugin installed
- A **Figma Personal Access Token** ([how to get one](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens))

### 1. Clone and Build

```bash
git clone https://github.com/thayashi/figma-relay.git
cd figma-relay
npm install
npm run build:local
```

### 2. Install the Desktop Bridge Plugin

1. Open Figma Desktop
2. Go to **Plugins > Development > Import plugin from manifest...**
3. Select `figma-desktop-bridge/manifest.json` from this repo
4. Run the plugin in your Figma file — it auto-connects via WebSocket (ports 9223-9232)

### 3. Start the HTTP Bridge

```bash
npm run start:http
```

The bridge starts on `http://localhost:3056`.

### 4. Connect and Use

```bash
# Check status
curl -s http://localhost:3056/status

# Join a channel (get the channel ID from the Desktop Bridge plugin UI)
curl -s -X POST http://localhost:3056/join-channel -H "Content-Type: application/json" -d '{"channel":"figma-xxxxx"}'

# Get document info
curl -s -X POST http://localhost:3056/command -H "Content-Type: application/json" -d '{"command":"get_document_info","params":{}}'

# Create a frame
curl -s -X POST http://localhost:3056/command -H "Content-Type: application/json" -d '{"command":"create_frame","params":{"name":"MyFrame","x":0,"y":0,"width":800,"height":600}}'

# Run arbitrary Figma Plugin API code
curl -s -X POST http://localhost:3056/execute -H "Content-Type: application/json" -d '{"code":"const rect = figma.createRectangle(); rect.name = \"Hello\"; return { id: rect.id }"}'
```

---

## HTTP Bridge Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/status` | Connection status and channel info |
| `POST` | `/join-channel` | Join a Figma plugin channel: `{"channel": "figma-xxxxx"}` |
| `POST` | `/command` | Execute an MCP command: `{"command": "...", "params": {...}}` |
| `POST` | `/execute` | Run arbitrary Figma Plugin API code: `{"code": "..."}` |
| `GET` | `/screenshot` | Capture a screenshot of the current Figma canvas |

The `/execute` endpoint is the most powerful — it can run any [Figma Plugin API](https://www.figma.com/plugin-docs/) code, making it possible to do anything the Plugin API supports without adding new handlers.

---

## Using with Claude Code

Figma Relay is designed to work seamlessly with Claude Code. Start the HTTP Bridge, then ask Claude Code to interact with Figma using `curl`:

```
Create a 800x600 frame called "Dashboard" in Figma
```

Claude Code will use the HTTP Bridge endpoints via `curl` to execute the request.

### Skills

The `.claude/skills/` directory contains domain-specific skill files that teach Claude Code how to work with Figma through the HTTP Bridge:

| Skill | Description |
|-------|-------------|
| `figma-bridge.md` | Foundation skill — HTTP Bridge endpoints, curl templates, error handling |
| `design-system-refs.md` | Component key mappings for importing library components |
| `table-builder.md` | Generate Figma tables from CSV data using Design System components |
| `naming-conventions.md` | Frame/layer naming rules, audit mode, and batch rename |
| `work-log.md` | Auto-save versions and generate work session summaries |

---

## Using as an MCP Server

Figma Relay retains full MCP server compatibility from upstream. You can use it with any MCP client exactly as documented in [figma-console-mcp](https://github.com/southleft/figma-console-mcp).

### Claude Code (MCP mode)

```bash
claude mcp add figma-relay -s user -e FIGMA_ACCESS_TOKEN=figd_YOUR_TOKEN_HERE -e ENABLE_MCP_APPS=true -- node /absolute/path/to/figma-relay/dist/local.js
```

### Cursor / Windsurf / Claude Desktop

```json
{
  "mcpServers": {
    "figma-relay": {
      "command": "node",
      "args": ["/absolute/path/to/figma-relay/dist/local.js"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "figd_YOUR_TOKEN_HERE",
        "ENABLE_MCP_APPS": "true"
      }
    }
  }
}
```

---

## Available MCP Tools (57+)

All tools from upstream [figma-console-mcp](https://github.com/southleft/figma-console-mcp) are included:

### Navigation & Status
- `figma_navigate` - Open Figma URLs
- `figma_get_status` - Check connection status

### Console Debugging
- `figma_get_console_logs` / `figma_watch_console` / `figma_clear_console` / `figma_reload_plugin`

### Visual Debugging
- `figma_take_screenshot` - Capture UI screenshots

### Design System Extraction
- `figma_get_design_system_kit` - Full design system in one call
- `figma_get_variables` / `figma_get_component` / `figma_get_styles` / `figma_get_file_data`

### Design Creation
- `figma_execute` - Run any Figma Plugin API code
- `figma_arrange_component_set` - Organize variants into component sets
- `figma_set_description` - Document components with rich descriptions

### Design-Code Parity
- `figma_check_design_parity` - Compare Figma specs against code
- `figma_generate_component_doc` - Generate component documentation

### Variable Management
- Full CRUD: `figma_create_variable`, `figma_update_variable`, `figma_rename_variable`, `figma_delete_variable`
- Collections: `figma_create_variable_collection`, `figma_delete_variable_collection`
- Modes: `figma_add_mode`, `figma_rename_mode`
- Batch: `figma_batch_create_variables`, `figma_batch_update_variables`
- `figma_setup_design_tokens` - Create complete token system atomically

See the [upstream documentation](https://github.com/southleft/figma-console-mcp) for full tool details.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Clients                                            │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │
│  │  curl     │  │  Python  │  │  Claude Code      │ │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘ │
│       │              │                 │            │
│       └──────────────┼─────────────────┘            │
│                      │ HTTP (port 3056)             │
│               ┌──────▼──────┐                       │
│               │ HTTP Bridge │                       │
│               └──────┬──────┘                       │
│                      │                              │
│               ┌──────▼──────┐                       │
│               │  WebSocket  │ (ports 9223-9232)     │
│               │   Broker    │                       │
│               └──────┬──────┘                       │
│                      │                              │
└──────────────────────┼──────────────────────────────┘
                       │
            ┌──────────▼──────────┐
            │  Figma Desktop      │
            │  Bridge Plugin      │
            │  ┌────────────────┐ │
            │  │ Figma Plugin   │ │
            │  │ API            │ │
            │  └────────────────┘ │
            └─────────────────────┘
```

---

## Development

```bash
# Install dependencies
npm install

# Start HTTP Bridge (development)
npm run start:http

# Start MCP server (development)
npm run dev:local

# Build
npm run build:local

# Test
npm run test
```

---

## Credits

This project is a fork of **[figma-console-mcp](https://github.com/southleft/figma-console-mcp)** by [southleft](https://github.com/southleft), licensed under MIT. The upstream project provides the MCP server foundation, 57+ Figma tools, the Desktop Bridge plugin, and MCP Apps. Figma Relay builds on this foundation to add HTTP Bridge access and AI agent automation workflows.

---

## License

MIT - See [LICENSE](LICENSE) file for details.
