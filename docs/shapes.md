# Shapes and connectors

FrameSeq provides small diagram primitives for flowcharts, architecture maps, timelines, and annotations. The authoring API stays declarative: rectangles and circles render as editable HTML elements, while connectors and arrowheads render as inline SVG.

## Start with a canvas

Shapes can participate in ordinary layout, but diagrams normally need explicit coordinates:

```ts
slide({ name: "Pipeline" }).canvas();
```

Coordinates are relative to the slide's current canvas region. FrameSeq maps the finished presentation canvas as a single unit, so the composition keeps the same relative geometry in interactive HTML, PDF, and PPTX.

## Rectangles

```ts
rect("TypeScript")
  .position({ x: 80, y: 125 })
  .width(240)
  .height(110)
  .fill("#dbeafe")
  .stroke("#2563eb")
  .strokeWidth(3)
  .radius(18)
  .size(24)
  .color("#172554");
```

The label is optional. It is centered by default and supports the same inline `$...$` math syntax as `text()`.

## Circles

```ts
circle("FrameSeq")
  .position({ x: 520, y: 100 })
  .width(160)
  .fill("#cffafe")
  .stroke("#0891b2")
  .strokeWidth(3);
```

Set only `width()` when the object should remain circular. Setting both width and height to different values produces an ellipse.

## Lines and arrows

```ts
line({ x1: 320, y1: 180, x2: 520, y2: 180 })
  .stroke("#2563eb")
  .strokeWidth(4)
  .arrow("end");
```

Line coordinates are numeric pixels in the current canvas region. Supported arrow placements are:

```ts
.arrow("none")
.arrow("start")
.arrow("end")
.arrow("both")
```

Calling `.arrow()` without an argument is equivalent to `.arrow("end")`. Lines have no arrowhead unless `arrow()` is used.

## Names, anchors, and relative placement

Hand-computed coordinates break as soon as a diagram changes. Give an object a name with `as()`, then let other objects refer to it instead of to numbers:

```ts
slide({ name: "Training loop" }).canvas();

rect("Encoder").as("enc").position({ x: 80, y: 140 }).width(200).height(100);
rect("Decoder").as("dec").rightOf("enc", 140);
circle("Loss").as("loss").rightOf("dec", 140);

line().from("enc").to("dec").arrow("end");
line().from("dec").to("loss").arrow("end");
line().from("loss.bottom").to("enc.bottom").arrow("end");

text("shared vocabulary").caption().below("enc", 16);
```

Names are unique within a slide and may be referenced before the object they name, so connectors can still be written first for layering. Only `position()` and the placement modifiers are affected; nothing else about the object changes.

### Placement modifiers

| Modifier | Effect |
| --- | --- |
| `.rightOf(name, gap = 40)` | Left edge after the named object, vertically centred on it |
| `.leftOf(name, gap = 40)` | Right edge before the named object, vertically centred on it |
| `.below(name, gap = 24)` | Top edge under the named object, horizontally centred on it |
| `.above(name, gap = 24)` | Bottom edge over the named object, horizontally centred on it |
| `.centerOn(name)` | Centred on the named object |
| `.alignTop(name)` | Vertical only: matches the named object's top edge |
| `.alignLeft(name)` | Horizontal only: matches the named object's left edge |

`alignTop()` and `alignLeft()` change one axis, so they chain onto another placement:

```ts
rect("Cache").as("cache").rightOf("enc", 60).alignTop("enc");
```

The object being placed does not need a size of its own; FrameSeq centres it with CSS. The object being referenced does need one: `rect()` defaults to 240 x 96 and `circle()` to 160 x 160, and any explicit `width()` or `height()` overrides that.

### Connector anchors

`from()` and `to()` accept a name, or a name and an anchor:

```ts
line().from("enc").to("dec");                    // FrameSeq picks the facing edges
line().from("enc.right").to("dec.top-left");     // explicit anchors
line().from("enc.right", { dy: -20 }).to("dec"); // explicit anchor, shifted 20px up
```

Available anchors are `center`, `top`, `bottom`, `left`, `right`, `top-left`, `top-right`, `bottom-left`, and `bottom-right`, measured on the object's bounding box. Without an anchor FrameSeq compares the two centres and leaves from the edge that faces the other end, so connectors follow their nodes when coordinates change.

A connector may anchor one end only; the other end then keeps the coordinates passed to `line({ x1, y1, x2, y2 })`.

### What names can reach

References are resolved before rendering, from declared geometry, so both objects must share a coordinate system:

- Put the objects on the same `canvas()`, or inside a group that is itself positioned with `position()`.
- Objects laid out by the document flow — a `text()` after `bullets()`, a card inside a grid cell — have no coordinates until the browser lays them out, so they cannot be referenced.

FrameSeq reports unresolved references as errors that name the slide, the reference, and the objects that are available, rather than drawing a connector to the wrong place.

## Layering

Objects are painted in source order. Write connectors first when they should sit behind diagram nodes:

```ts
slide({ name: "Flow" }).canvas();

line({ x1: 300, y1: 200, x2: 520, y2: 200 }).arrow();

rect("Input").position({ x: 60, y: 150 }).width(240).height(100);
rect("Output").position({ x: 520, y: 150 }).width(240).height(100);
```

For explicit stacking control, use `.style({ zIndex: 2 })` on a node or connector.

## Reveals and transforms

Shapes use the normal element modifiers:

```ts
rect("Second step")
  .position({ x: 420, y: 160 })
  .rotate(-3)
  .showAt(2);
```

In interactive mode, `showAt()` follows the slide's reveal steps. PDF and PPTX output show every step.

## Custom SVG artwork

Use an SVG file through `image()` when a diagram needs an icon, logo, Bézier path, or other geometry beyond the built-in primitives:

```ts
const artwork = new URL("./assets/custom-shape.svg", import.meta.url).href;

image(artwork, "Custom vector diagram")
  .position({ x: 760, y: 80 })
  .width(280);
```

This keeps the artwork vector-based in the browser and PDF while leaving common boxes and connectors easy to edit in TypeScript. Editable PPTX export maps rectangles, circles, lines, and arrows to native PowerPoint shapes.
