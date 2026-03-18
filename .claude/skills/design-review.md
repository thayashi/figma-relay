# Design Review Loop

After making visual changes to a Figma file, ALWAYS capture a screenshot and review the result before considering the task complete. This is the core quality assurance step for all design work.

## When to Use

- After creating any new frames, layouts, or visual elements
- After modifying styling (fills, spacing, typography, sizing)
- After restructuring layout hierarchy
- After importing or instantiating components

## Workflow

### Step 1: Capture Screenshot

After completing design changes, take a screenshot of the affected node (or the parent frame containing all changes):

```bash
curl -s -X POST http://localhost:3056/screenshot -H "Content-Type: application/json" -d '{"nodeId": "NODE_ID", "format": "PNG", "scale": 2}'
```

The response returns a `filepath` (e.g., `/tmp/figma-screenshots/figma-1741890000000.png`). Use the `Read` tool to view this image.

If you don't know the node ID, capture the full current page:

```bash
curl -s -X POST http://localhost:3056/execute -H "Content-Type: application/json" -d '{"code": "return { pageId: figma.currentPage.id, pageName: figma.currentPage.name }"}'
```

Then use the page ID as the `nodeId`.

### Step 2: Review the Screenshot

After viewing the screenshot, check for these common issues:

**Layout**
- Are elements aligned correctly?
- Is spacing consistent and intentional?
- Does AutoLayout flow in the right direction?
- Are FILL/HUG sizing modes producing the expected result?

**Typography**
- Is text readable (size, color contrast)?
- Are fonts loaded correctly (not falling back to default)?
- Does text wrap appropriately in FILL containers?

**Visual**
- Are colors correct (not white-on-white from 0-255 mistake)?
- Are corner radii consistent?
- Are fills/strokes rendering as intended?
- Is clipping (`clipsContent`) working where needed?

**Structure**
- Does the hierarchy look correct in the layers panel?
- Are elements named according to naming conventions?

### Step 3: Fix Issues

If the screenshot reveals problems:

1. Identify the specific node(s) causing the issue
2. Fix using `/execute` or `/command` endpoints
3. **Take another screenshot** to verify the fix
4. Repeat until the design matches expectations

### Step 4: Final Confirmation

Once the design looks correct:

1. Take a final screenshot at `scale: 2` for clear detail
2. Show the screenshot to the user with a brief summary of what was built
3. If the changes are significant, save a Figma version:

```bash
curl -s -X POST http://localhost:3056/execute -H "Content-Type: application/json" -d '{"code": "await figma.saveVersionHistoryAsync(\"AI: <description of changes>\"); return { saved: true }", "timeout": 10000}'
```

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `nodeId`  | (required) | ID of the node to capture. Use page ID for full page. |
| `format`  | `PNG`   | `PNG` or `JPG` |
| `scale`   | `2`     | Export scale (1-4). Use 2 for review, 1 for quick checks. |
| `save`    | `true`  | Set to `false` to get base64 instead of a temp file. |

## Rules

- **Never skip the screenshot step.** Even if you're confident the code is correct, visual verification catches silent failures (see `figma-structure.md` gotchas).
- **Minimum one screenshot per task.** Take a final screenshot before reporting completion to the user.
- **Multiple screenshots for complex work.** For multi-step design tasks (e.g., building a table), screenshot after each major milestone, not just at the end.
- **Always show the final screenshot to the user.** The user should see what was created without needing to switch to Figma.
