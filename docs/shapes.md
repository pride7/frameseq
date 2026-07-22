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
