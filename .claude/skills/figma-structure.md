# Figma Structure Best Practices

How to create properly structured Figma designs via `figma_execute`. Every design created programmatically MUST follow these rules to produce production-quality Figma files.

## Core Rules

1. **Always use Frames, never Groups.** Groups don't support AutoLayout, constraints, or clipping. Always `figma.createFrame()`.

2. **Set `layoutMode` on every Frame.** Either `'VERTICAL'` or `'HORIZONTAL'`. A Frame without `layoutMode` is just a manual-positioning container — unusable in real Figma workflows.

3. **Set sizing modes on the Frame itself.** `primaryAxisSizingMode` and `counterAxisSizingMode` — either `'AUTO'` (hug contents) or `'FIXED'`.

4. **`appendChild()` BEFORE `layoutSizing`.** The child node MUST be inside an AutoLayout parent before you set `layoutSizingHorizontal` or `layoutSizingVertical`. This is the #1 source of silent failures — the property is silently ignored if the node isn't in an AutoLayout parent yet.

5. **Use `layoutSizingHorizontal`/`layoutSizingVertical` on children, not `resize()`.** After appending a child to an AutoLayout frame, set these to `'HUG'`, `'FILL'`, or `'FIXED'`. Only use `resize()` when the child is `'FIXED'` and you need to set the dimension value.

6. **No manual `x`/`y` positioning inside AutoLayout.** Children are positioned by the layout engine. Setting `x` or `y` on a child of an AutoLayout frame is silently ignored.

7. **Use `itemSpacing` for gaps, padding properties for insets.** `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` for frame padding. `itemSpacing` for uniform gaps between children.

8. **Load fonts before creating text.** `await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })` must be called before setting `.characters` on any text node using that font.

9. **Use transparent fills for structural frames.** `frame.fills = []` for frames that exist purely for layout, not as visual containers.

10. **Colors use normalized 0-1 RGB, not 0-255.** `{ r: 0.2, g: 0.4, b: 0.8 }` not `{ r: 51, g: 102, b: 204 }`. Values are clamped, so 0-255 creates invisible white-on-white.

## Canonical Frame Creation Pattern

Always follow this exact order of operations:

```javascript
// 1. Load fonts first (if text will be created)
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });

// 2. Create the outer container frame
const container = figma.createFrame();
container.name = 'CardContainer';
container.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
container.cornerRadius = 8;
container.layoutMode = 'VERTICAL';
container.primaryAxisSizingMode = 'AUTO';   // Hug contents vertically
container.counterAxisSizingMode = 'AUTO';   // Hug contents horizontally
container.paddingTop = 16;
container.paddingRight = 16;
container.paddingBottom = 16;
container.paddingLeft = 16;
container.itemSpacing = 12;

// 3. Create a child frame
const row = figma.createFrame();
row.name = 'ContentRow';
row.fills = [];                             // Transparent — structural only
row.layoutMode = 'HORIZONTAL';
row.primaryAxisSizingMode = 'AUTO';
row.counterAxisSizingMode = 'AUTO';
row.itemSpacing = 8;

// 4. appendChild() FIRST
container.appendChild(row);

// 5. THEN set layoutSizing on the child
row.layoutSizingHorizontal = 'FILL';       // Fill parent width
row.layoutSizingVertical = 'HUG';          // Hug own content height

// 6. Create text inside the row
const label = figma.createText();
label.name = 'Label';
label.characters = 'Hello World';
label.fontSize = 14;
label.fontName = { family: 'Inter', style: 'Regular' };
label.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];

// 7. Append text, THEN set sizing
row.appendChild(label);
label.layoutSizingHorizontal = 'FILL';
label.layoutSizingVertical = 'HUG';
```

## Common Layout Compositions

### Pattern A: Page Layout (vertical stack with full-width sections)

```javascript
const page = figma.createFrame();
page.name = 'PageLayout';
page.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }];
page.layoutMode = 'VERTICAL';
page.primaryAxisSizingMode = 'FIXED';      // Fixed height page
page.counterAxisSizingMode = 'FIXED';      // Fixed width page
page.resize(1440, 900);
page.paddingTop = 32;
page.paddingRight = 64;
page.paddingBottom = 32;
page.paddingLeft = 64;
page.itemSpacing = 24;

// Each section fills width
const section = figma.createFrame();
section.name = 'Section';
section.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
section.cornerRadius = 8;
section.layoutMode = 'VERTICAL';
section.primaryAxisSizingMode = 'AUTO';    // Hug height
section.counterAxisSizingMode = 'AUTO';
section.paddingTop = 24;
section.paddingRight = 24;
section.paddingBottom = 24;
section.paddingLeft = 24;
section.itemSpacing = 16;

page.appendChild(section);
section.layoutSizingHorizontal = 'FILL';   // Fill parent width
section.layoutSizingVertical = 'HUG';
```

### Pattern B: Row with Label and Value (horizontal, space-between)

```javascript
const row = figma.createFrame();
row.name = 'LabelValueRow';
row.fills = [];
row.layoutMode = 'HORIZONTAL';
row.primaryAxisSizingMode = 'FIXED';       // Fixed width for space-between
row.counterAxisSizingMode = 'AUTO';
row.primaryAxisAlignItems = 'SPACE_BETWEEN';
row.counterAxisAlignItems = 'CENTER';      // Vertically center children
row.resize(400, 1);                        // Width matters, height auto

const labelText = figma.createText();
labelText.characters = 'Status';
labelText.fontSize = 14;
labelText.fontName = { family: 'Inter', style: 'Regular' };
labelText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
row.appendChild(labelText);
labelText.layoutSizingHorizontal = 'HUG';
labelText.layoutSizingVertical = 'HUG';

const valueText = figma.createText();
valueText.characters = 'Active';
valueText.fontSize = 14;
valueText.fontName = { family: 'Inter', style: 'Semi Bold' };
valueText.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
row.appendChild(valueText);
valueText.layoutSizingHorizontal = 'HUG';
valueText.layoutSizingVertical = 'HUG';
```

### Pattern C: Card Grid (horizontal wrap)

```javascript
const grid = figma.createFrame();
grid.name = 'CardGrid';
grid.fills = [];
grid.layoutMode = 'HORIZONTAL';
grid.layoutWrap = 'WRAP';                  // Enable wrapping
grid.primaryAxisSizingMode = 'FIXED';      // Fixed width to trigger wrap
grid.counterAxisSizingMode = 'AUTO';       // Hug total height
grid.resize(800, 1);
grid.itemSpacing = 16;                     // Horizontal gap
grid.counterAxisSpacing = 16;              // Vertical gap between wrapped rows

// Each card is fixed-width
for (let i = 0; i < 6; i++) {
  const card = figma.createFrame();
  card.name = `Card ${i + 1}`;
  card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  card.cornerRadius = 8;
  card.layoutMode = 'VERTICAL';
  card.primaryAxisSizingMode = 'AUTO';
  card.counterAxisSizingMode = 'FIXED';
  card.resize(240, 1);
  card.paddingTop = 16;
  card.paddingRight = 16;
  card.paddingBottom = 16;
  card.paddingLeft = 16;
  card.itemSpacing = 8;

  grid.appendChild(card);
  card.layoutSizingHorizontal = 'FIXED';
  card.layoutSizingVertical = 'HUG';
}
```

### Pattern D: Header / Content / Footer (vertical with fill-center)

```javascript
const layout = figma.createFrame();
layout.name = 'AppLayout';
layout.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
layout.layoutMode = 'VERTICAL';
layout.primaryAxisSizingMode = 'FIXED';
layout.counterAxisSizingMode = 'FIXED';
layout.resize(1440, 900);
layout.itemSpacing = 0;

// Header - hugs height, fills width
const header = figma.createFrame();
header.name = 'Header';
header.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
header.layoutMode = 'HORIZONTAL';
header.primaryAxisSizingMode = 'AUTO';
header.counterAxisSizingMode = 'AUTO';
header.counterAxisAlignItems = 'CENTER';
header.paddingTop = 12;
header.paddingRight = 24;
header.paddingBottom = 12;
header.paddingLeft = 24;
layout.appendChild(header);
header.layoutSizingHorizontal = 'FILL';
header.layoutSizingVertical = 'HUG';

// Content - fills remaining space
const content = figma.createFrame();
content.name = 'Content';
content.fills = [];
content.layoutMode = 'VERTICAL';
content.primaryAxisSizingMode = 'AUTO';
content.counterAxisSizingMode = 'AUTO';
content.paddingTop = 32;
content.paddingRight = 64;
content.paddingBottom = 32;
content.paddingLeft = 64;
content.itemSpacing = 16;
layout.appendChild(content);
content.layoutSizingHorizontal = 'FILL';
content.layoutSizingVertical = 'FILL';     // FILL = takes remaining space

// Footer - hugs height, fills width
const footer = figma.createFrame();
footer.name = 'Footer';
footer.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.96 } }];
footer.layoutMode = 'HORIZONTAL';
footer.primaryAxisSizingMode = 'AUTO';
footer.counterAxisSizingMode = 'AUTO';
footer.counterAxisAlignItems = 'CENTER';
footer.paddingTop = 12;
footer.paddingRight = 24;
footer.paddingBottom = 12;
footer.paddingLeft = 24;
layout.appendChild(footer);
footer.layoutSizingHorizontal = 'FILL';
footer.layoutSizingVertical = 'HUG';
```

### Pattern E: Overlay / Badge (absolute positioning inside AutoLayout)

Use `layoutPositioning = 'ABSOLUTE'` for elements that float over AutoLayout content — badges, close buttons, notification dots, floating action buttons. These children are excluded from the layout flow but still respect `constraints`.

```javascript
const card = figma.createFrame();
card.name = 'CardWithBadge';
card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
card.cornerRadius = 12;
card.layoutMode = 'VERTICAL';
card.primaryAxisSizingMode = 'AUTO';
card.counterAxisSizingMode = 'FIXED';
card.resize(300, 1);
card.paddingTop = 16;
card.paddingRight = 16;
card.paddingBottom = 16;
card.paddingLeft = 16;
card.itemSpacing = 8;
card.clipsContent = true;

// Normal flow children
const title = figma.createText();
title.characters = 'Card Title';
title.fontSize = 16;
title.fontName = { family: 'Inter', style: 'Semi Bold' };
title.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
card.appendChild(title);
title.layoutSizingHorizontal = 'FILL';
title.layoutSizingVertical = 'HUG';

// Absolute-positioned badge (top-right corner)
const badge = figma.createFrame();
badge.name = 'NotificationBadge';
badge.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.2, b: 0.2 } }];
badge.cornerRadius = 10;
badge.resize(20, 20);
badge.layoutMode = 'HORIZONTAL';
badge.primaryAxisAlignItems = 'CENTER';
badge.counterAxisAlignItems = 'CENTER';

// Append FIRST, then set absolute positioning
card.appendChild(badge);
badge.layoutPositioning = 'ABSOLUTE';    // Ignores auto layout flow
badge.constraints = {
  horizontal: 'MAX',                     // Pin to right edge
  vertical: 'MIN'                        // Pin to top edge
};
badge.x = 274;                           // Position from left (card width - padding - badge)
badge.y = 6;                             // Position from top

const badgeText = figma.createText();
badgeText.characters = '3';
badgeText.fontSize = 11;
badgeText.fontName = { family: 'Inter', style: 'Semi Bold' };
badgeText.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
badge.appendChild(badgeText);
badgeText.layoutSizingHorizontal = 'HUG';
badgeText.layoutSizingVertical = 'HUG';
```

Key rules for absolute positioning:
- `layoutPositioning = 'ABSOLUTE'` only works on children of AutoLayout frames
- `constraints` only work on absolute-positioned children (or children of non-AutoLayout frames)
- `x`/`y` ARE respected for absolute children (unlike normal AutoLayout children)
- Constraint values: `horizontal` → `'MIN'` (left), `'CENTER'`, `'MAX'` (right), `'STRETCH'`, `'SCALE'`
- Constraint values: `vertical` → `'MIN'` (top), `'CENTER'`, `'MAX'` (bottom), `'STRETCH'`, `'SCALE'`
- Use for: badges, close/dismiss buttons, floating icons, status indicators, decorative elements

### Pattern F: Reusable Components and Variants

Create components from finished frames, then combine related components into variant sets. Use slash-separated naming (`Button/Primary`, `Button/Secondary`) — Figma converts slash groups into variant properties.

```javascript
// 1. Create individual component states
const states = ['Default', 'Hover', 'Disabled'];
const components = [];

for (const state of states) {
  const btn = figma.createFrame();
  btn.name = 'Button/' + state;            // Slash naming for variant conversion
  btn.fills = [{ type: 'SOLID', color:
    state === 'Default'  ? { r: 0.20, g: 0.36, b: 0.84 } :
    state === 'Hover'    ? { r: 0.16, g: 0.29, b: 0.67 } :
                           { r: 0.80, g: 0.80, b: 0.80 }
  }];
  btn.cornerRadius = 8;
  btn.layoutMode = 'HORIZONTAL';
  btn.primaryAxisSizingMode = 'AUTO';
  btn.counterAxisSizingMode = 'AUTO';
  btn.primaryAxisAlignItems = 'CENTER';
  btn.counterAxisAlignItems = 'CENTER';
  btn.paddingTop = 12;
  btn.paddingRight = 24;
  btn.paddingBottom = 12;
  btn.paddingLeft = 24;

  const label = figma.createText();
  label.characters = 'Button';
  label.fontSize = 14;
  label.fontName = { family: 'Inter', style: 'Semi Bold' };
  label.fills = [{ type: 'SOLID', color: state === 'Disabled'
    ? { r: 0.5, g: 0.5, b: 0.5 }
    : { r: 1, g: 1, b: 1 }
  }];
  btn.appendChild(label);
  label.layoutSizingHorizontal = 'HUG';
  label.layoutSizingVertical = 'HUG';

  // 2. Convert frame to component
  const comp = figma.createComponentFromNode(btn);
  components.push(comp);
}

// 3. Combine into a variant set (all must have same slash count)
const variantSet = figma.combineAsVariants(components, figma.currentPage);
variantSet.name = 'Button';
```

Key rules for components/variants:
- `figma.createComponentFromNode(node)` converts any frame into a reusable component
- `figma.combineAsVariants(components, parent)` groups components into a variant set
- All components MUST have the same number of slashes in their names (e.g., `Button/Primary`, `Button/Secondary`)
- Slash groups become variant property values — `Button/Large/Primary` → Property1=Large, Property2=Primary
- Create instances with: `const instance = componentNode.createInstance()`
- Set variant properties on instances: `instance.setProperties({ 'Property1': 'Large' })`
- Only create variants when states are well-defined — avoid combinatorial explosion

## Alignment & Sizing Reference

### Frame Properties (control the frame's own behavior)

| Property | Values | CSS Equivalent | Notes |
|---|---|---|---|
| `layoutMode` | `'VERTICAL'`, `'HORIZONTAL'` | `flex-direction` | Required on every frame |
| `primaryAxisSizingMode` | `'AUTO'` (hug), `'FIXED'` | Frame's own size on main axis | AUTO = shrink-wrap |
| `counterAxisSizingMode` | `'AUTO'` (hug), `'FIXED'` | Frame's own size on cross axis | AUTO = shrink-wrap |
| `primaryAxisAlignItems` | `'MIN'`, `'CENTER'`, `'MAX'`, `'SPACE_BETWEEN'` | `justify-content` | Aligns children along main axis |
| `counterAxisAlignItems` | `'MIN'`, `'CENTER'`, `'MAX'`, `'BASELINE'` | `align-items` | Aligns children along cross axis |
| `itemSpacing` | number | `gap` | Uniform spacing between children |
| `layoutWrap` | `'NO_WRAP'`, `'WRAP'` | `flex-wrap` | Enable wrapping |
| `counterAxisSpacing` | number | `row-gap` (when wrapped) | Gap between wrapped rows |

### Child Properties (control how a child behaves in its parent)

| Property | Values | CSS Equivalent | Notes |
|---|---|---|---|
| `layoutSizingHorizontal` | `'HUG'`, `'FILL'`, `'FIXED'` | `width: auto / 100% / Npx` | Set AFTER appendChild |
| `layoutSizingVertical` | `'HUG'`, `'FILL'`, `'FIXED'` | `height: auto / 100% / Npx` | Set AFTER appendChild |
| `layoutPositioning` | `'AUTO'`, `'ABSOLUTE'` | `position: relative / absolute` | ABSOLUTE ignores flow, enables constraints + x/y |
| `constraints` | `{ horizontal, vertical }` | — | Only on ABSOLUTE children or non-AutoLayout frame children |

### Axis Orientation Quick Reference

| layoutMode | Primary Axis | Counter Axis |
|---|---|---|
| `'VERTICAL'` | Y (top-to-bottom) | X (left-to-right) |
| `'HORIZONTAL'` | X (left-to-right) | Y (top-to-bottom) |

So for a `VERTICAL` frame: `primaryAxisAlignItems = 'CENTER'` centers children **vertically**, `counterAxisAlignItems = 'CENTER'` centers children **horizontally**.

## Gotchas & Silent Failures

These fail **silently** (no error thrown, wrong visual result):

| Mistake | What Happens | Fix |
|---|---|---|
| `layoutSizingHorizontal` before `appendChild()` | Property silently ignored | Always append to parent first |
| `resize()` on a HUG/FILL child | Overridden by layout engine | Use `layoutSizing*` instead |
| `x`/`y` on AutoLayout children | Silently ignored | Remove manual positioning |
| Colors with 0-255 values | Clamped — creates white/invisible | Use 0-1 range: `r/255` |
| `figma.getNodeById()` across pages | Returns null | Use `figma.getNodeByIdAsync()` |
| Empty frame with `layoutSizing: 'HUG'` | HUG not available for childless frames | Use `'FIXED'` or `'FILL'` for empty frames |

## Text Node Best Practices

```javascript
// Always load the exact font+style BEFORE creating text
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

const text = figma.createText();
text.name = 'DescriptionText';
text.fontName = { family: 'Inter', style: 'Regular' };  // Must match loaded font
text.characters = 'Hello world';                         // Set AFTER fontName
text.fontSize = 14;
text.lineHeight = { value: 20, unit: 'PIXELS' };        // Optional: explicit line height
text.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];

// Append FIRST, then set sizing
parent.appendChild(text);
text.layoutSizingHorizontal = 'FILL';   // Text fills parent width (enables wrapping)
text.layoutSizingVertical = 'HUG';      // Height wraps content
```

Key text rules:
- `fontName` must be set before `characters` if changing from default
- Load every font+style combination you use (Regular, Bold, Semi Bold are separate loads)
- Use `'FILL'` for `layoutSizingHorizontal` on text to enable multi-line wrapping
- Use `textAlignHorizontal`: `'LEFT'`, `'CENTER'`, `'RIGHT'`, `'JUSTIFIED'`
- Use `textAlignVertical`: `'TOP'`, `'CENTER'`, `'BOTTOM'`
