# Figma HTTP Bridge

How to interact with Figma via the HTTP Bridge REST API from curl, scripts, or Claude Code shell commands.

## Prerequisites

1. Start the HTTP Bridge: `npm run start:http`
2. Open Figma Desktop with the Desktop Bridge plugin running in your file
3. Verify connection: `curl http://localhost:3056/status`

The plugin auto-connects via WebSocket on ports 9223-9232. No channel join is needed if only one file is open.

## Endpoints

Base URL: `http://localhost:3056`

### GET /status

Check connection and list connected Figma files.

```bash
curl -s http://localhost:3056/status | jq .
```

Response:
```json
{
  "wsConnected": true,
  "wsPort": 9223,
  "connectedFiles": [
    {
      "fileName": "My Design File",
      "fileKey": "abc123",
      "currentPage": "Page 1",
      "isActive": true
    }
  ]
}
```

### POST /join-channel

Switch active file when multiple Figma files are open.

```bash
# List available channels (omit "channel" field)
curl -s -X POST http://localhost:3056/join-channel \
  -H "Content-Type: application/json" \
  -d '{}'

# Set active file
curl -s -X POST http://localhost:3056/join-channel \
  -H "Content-Type: application/json" \
  -d '{"channel": "abc123"}'
```

### POST /command

Send a named WebSocket command to the plugin. Commands use UPPER_SNAKE_CASE names.

```bash
curl -s -X POST http://localhost:3056/command \
  -H "Content-Type: application/json" \
  -d '{"command": "GET_FILE_INFO", "params": {}}'
```

Parameters:
- `command` (required): Command name (see Available Commands below)
- `params` (optional): Object of command parameters, defaults to `{}`
- `timeout` (optional): Timeout in ms, defaults to 15000
- `fileKey` (optional): Target a specific file instead of the active one

### POST /execute

Execute arbitrary Figma Plugin API JavaScript code. The code runs inside the plugin context with full access to the `figma` global object.

```bash
curl -s -X POST http://localhost:3056/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "return { name: figma.root.name, pages: figma.root.children.map(p => p.name) }"}'
```

Parameters:
- `code` (required): JavaScript code string. Runs inside `(async function() { ... })()`
- `timeout` (optional): Timeout in ms, defaults to 5000, max 30000

The code has access to `figma.*` Plugin API. Use `return` to send results back. Async/await is supported.

## Available Commands

### File & Document
| Command | Params | Description |
|---|---|---|
| `GET_FILE_INFO` | none | File name, key, current page, selection count |
| `CAPTURE_SCREENSHOT` | `nodeId`, `format?`, `scale?` | Screenshot of a node |

### Node Operations
| Command | Params | Description |
|---|---|---|
| `CREATE_CHILD_NODE` | `parentId`, `nodeType`, `properties` | Create a new child node |
| `CLONE_NODE` | `nodeId` | Clone an existing node |
| `DELETE_NODE` | `nodeId` | Delete a node |
| `RENAME_NODE` | `nodeId`, `newName` | Rename a node |
| `MOVE_NODE` | `nodeId`, `x`, `y` | Move a node |
| `RESIZE_NODE` | `nodeId`, `width`, `height`, `withConstraints?` | Resize a node |

### Node Styling
| Command | Params | Description |
|---|---|---|
| `SET_NODE_FILLS` | `nodeId`, `fills` | Set fill paints |
| `SET_NODE_STROKES` | `nodeId`, `strokes`, `strokeWeight?` | Set stroke paints |
| `SET_NODE_OPACITY` | `nodeId`, `opacity` | Set opacity (0-1) |
| `SET_NODE_CORNER_RADIUS` | `nodeId`, `radius` | Set corner radius |
| `SET_NODE_DESCRIPTION` | `nodeId`, `description` | Set node description |
| `SET_TEXT_CONTENT` | `nodeId`, `text` | Set text layer content |

### Components
| Command | Params | Description |
|---|---|---|
| `GET_LOCAL_COMPONENTS` | none | List all local components |
| `GET_COMPONENT` | `nodeId` | Get component data |
| `INSTANTIATE_COMPONENT` | `componentKey`, options | Create component instance |
| `SET_INSTANCE_PROPERTIES` | `nodeId`, `properties` | Set instance overrides |
| `ADD_COMPONENT_PROPERTY` | `nodeId`, `propertyName`, `propertyType`, `defaultValue` | Add property |
| `EDIT_COMPONENT_PROPERTY` | `nodeId`, `propertyName`, `newValue` | Edit property |
| `DELETE_COMPONENT_PROPERTY` | `nodeId`, `propertyName` | Delete property |

### Variables
| Command | Params | Description |
|---|---|---|
| `GET_VARIABLES_DATA` | none | Get cached variables data |
| `REFRESH_VARIABLES` | none | Refresh variables cache |
| `CREATE_VARIABLE` | `name`, `collectionId`, `resolvedType` | Create variable |
| `UPDATE_VARIABLE` | `variableId`, `modeId`, `value` | Update variable value |
| `DELETE_VARIABLE` | `variableId` | Delete variable |
| `RENAME_VARIABLE` | `variableId`, `newName` | Rename variable |
| `SET_VARIABLE_DESCRIPTION` | `variableId`, `description` | Set description |
| `CREATE_VARIABLE_COLLECTION` | `name` | Create collection |
| `DELETE_VARIABLE_COLLECTION` | `collectionId` | Delete collection |
| `ADD_MODE` | `collectionId`, `modeName` | Add mode to collection |
| `RENAME_MODE` | `collectionId`, `modeId`, `newName` | Rename mode |

### System
| Command | Params | Description |
|---|---|---|
| `CLEAR_CONSOLE` | none | Clear console buffer |
| `RELOAD_UI` | none | Reload plugin UI |

## Common Patterns with /execute

### Get all nodes on current page
```bash
curl -s -X POST http://localhost:3056/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "const nodes = figma.currentPage.children; return nodes.map(n => ({ id: n.id, name: n.name, type: n.type }))"}'
```

### Create a frame
```bash
curl -s -X POST http://localhost:3056/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "const frame = figma.createFrame(); frame.name = \"MyFrame\"; frame.resize(800, 600); frame.x = 0; frame.y = 0; return { id: frame.id, name: frame.name }"}'
```

### Import a library component by key
```bash
curl -s -X POST http://localhost:3056/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "const comp = await figma.importComponentByKeyAsync(\"COMPONENT_KEY\"); const inst = comp.createInstance(); inst.x = 100; inst.y = 200; return { id: inst.id, name: inst.name }"}'
```

### Find nodes by name
```bash
curl -s -X POST http://localhost:3056/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "const nodes = figma.currentPage.findAll(n => n.name.includes(\"Header\")); return nodes.map(n => ({ id: n.id, name: n.name, type: n.type }))"}'
```

### Set auto-layout on a frame
```bash
curl -s -X POST http://localhost:3056/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "const frame = figma.getNodeById(\"NODE_ID\"); frame.layoutMode = \"VERTICAL\"; frame.primaryAxisSizingMode = \"AUTO\"; frame.counterAxisSizingMode = \"AUTO\"; frame.itemSpacing = 8; frame.paddingTop = 16; frame.paddingBottom = 16; frame.paddingLeft = 16; frame.paddingRight = 16; return { id: frame.id, layoutMode: frame.layoutMode }"}'
```

### Save a version
```bash
curl -s -X POST http://localhost:3056/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "await figma.saveVersionHistoryAsync(\"AI: Updated table layout\"); return { saved: true }", "timeout": 10000}'
```

## Error Handling

| HTTP Status | Meaning |
|---|---|
| 200 | Success |
| 400 | Bad request (invalid JSON, missing required fields) |
| 404 | Unknown endpoint |
| 502 | Figma-side error (command failed, code threw exception) |
| 503 | No plugin connected — open Desktop Bridge in Figma |

When you get a 503, check:
1. Is Figma Desktop running?
2. Is the Desktop Bridge plugin open in a file?
3. Is the HTTP Bridge running (`npm run start:http`)?

When you get a 502, check the `error` field in the response for the Figma error message. Common causes:
- Node ID not found (deleted or wrong page)
- Timeout (increase `timeout` parameter)
- Invalid Plugin API usage (check Figma Plugin API docs)

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HTTP_BRIDGE_PORT` | `3056` | HTTP server port |
| `FIGMA_WS_PORT` | `9223` | Preferred WebSocket port |
| `FIGMA_WS_HOST` | `localhost` | WebSocket host |
