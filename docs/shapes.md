# Shapes and connectors

FrameSeq draws diagrams from a small set of primitives: `shape()` with 27 outlines, from flowchart symbols to block arrows; the `rect()` and `circle()` boxes; and `line()` connectors that run straight, at right angles, or in a curve between named objects. Every one of them stays editable after export: PowerPoint receives its own preset shapes and lines, and Typst receives polygons and curves.

## Start with a canvas

Shapes can participate in ordinary layout, but diagrams normally need explicit coordinates:

```ts
slide({ name: "Pipeline" }).canvas();
```

Coordinates are relative to the slide's current canvas region. FrameSeq maps the finished presentation canvas as a single unit, so the composition keeps the same relative geometry in interactive HTML, PDF, and PPTX.

## Shapes

`shape(kind, label)` draws an outline with an optional label:

```ts
shape("diamond", "Valid?").position({ x: 520, y: 200 });
shape("cylinder", "Orders").position({ x: 900, y: 180 }).width(180).height(160);
```

| Group | Kinds |
| --- | --- |
| Basic | `rect`, `rounded`, `pill`, `ellipse`, `circle`, `diamond`, `triangle`, `pentagon`, `hexagon`, `octagon`, `parallelogram`, `trapezoid`, `star`, `plus` |
| Diagram symbols | `cylinder` (a database), `document`, `note`, `cube`, `cloud`, `callout` |
| Arrows and steps | `chevron`, `step`, `arrow-right`, `arrow-left`, `arrow-up`, `arrow-down`, `arrow-both` |

Each kind has a usual size, such as 200 x 140 for a diamond or 160 x 150 for a cylinder, which `width()` and `height()` replace. A `circle` given only a width stays round.

The label sits in the outline's own room: the middle half of a diamond, below a cylinder's top, along an arrow's shaft. It supports the same inline `$...$` math as `text()`, and `size()`, `weight()`, and `color()` style it.

Proportions follow PowerPoint's preset shapes, so a chevron's point or a cylinder's rim keeps its depth when the shape is stretched, and an exported shape looks as it did on the slide.

## Colour with `tone()`

One colour paints a whole shape: its fill, its outline, and its label.

```ts
shape("rounded", "Ingest").tone("blue");               // a soft tint, the default
shape("pill", "Start").tone("green", "solid");         // filled with the colour itself
shape("hexagon", "Gateway").tone("indigo", "outline"); // the colour around the background
```

The named colours are `accent` (the theme's own), `blue`, `sky`, `teal`, `green`, `lime`, `amber`, `orange`, `red`, `pink`, `purple`, `indigo`, and `gray`; any CSS colour such as `"#0f766e"` works too. Tints are worked out against the theme, so a dark theme gets deeper fills and lighter labels from the same document. A `shape()` with no tone is a soft tint of the accent.

`fill()`, `stroke()`, and `color()` still decide the parts they name, and `strokeWidth()` sets the outline's width. Two more modifiers finish a shape:

```ts
shape("cloud", "Internet").tone("sky").shadow(); // a soft shadow beneath
shape("rounded", "Optional").dashed();           // a dashed outline
```

`tone()`, `shadow()`, and `dashed()` work on `rect()` and `circle()` as well.

## Rectangles and circles

`rect()` and `circle()` are boxes with a border, which take part in a row or a column like any other content:

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

A rectangle without a height is 240 x 96, its minimum. Setting `height()` releases that minimum, so a shorter shape is rendered as asked; set `minHeight()` before `height()` to keep a floor of your own.

```ts
circle("FrameSeq")
  .position({ x: 520, y: 100 })
  .width(160)
  .fill("#cffafe")
  .stroke("#0891b2")
  .strokeWidth(3);
```

Set only `width()` when the circle should remain circular. Setting both width and height to different values produces an ellipse.

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

### Connectors between objects

A line usually connects two named objects, and follows them when they move:

```ts
line().from("cache").to("reply").arrow();
```

See [Diagrams](diagrams.md) for names, anchors, and automatic layout.

### Routes

`route()` decides how a connector travels:

```ts
line().from("check.right").to("reply.right").route("elbow").arrow();
line().from("service").to("database").route("curve").arrow();
```

- `"straight"`, the default, is the shortest line between the two ends.
- `"elbow"` turns at right angles. It leaves and enters its objects square to their sides, and runs around the other objects on its canvas rather than through them, the way a flowchart's connectors do.
- `"curve"` is a smooth curve that also leaves and enters square.

### Labels and dashes

```ts
line().from("check").to("run").arrow().label("no");
line().from("worker").to("queue").route("curve").dashed().label("async");
```

`label()` writes a short text halfway along the connector, on the slide's background so the line stops behind it. `dashed()` dashes the line, as for an optional or asynchronous step.

## Drawing in FrameSeq Studio

In [FrameSeq Studio](studio.md#drawing-objects), **Insert** opens a gallery of every shape, a text box, a line, an arrow, and a connector. Pick one and drag it out on the slide in the preview: FrameSeq writes the command with the coordinates and size you drew, and you can go on dragging and resizing it. Dragging a connector from one object to another names both, if they have no names yet, and writes a `line().from().to()` that follows them.

## Composing a diagram

Names, automatic layout, and connectors are covered in [Diagrams](diagrams.md), which shows how to build a diagram whose objects carry no coordinates at all. A few habits make a diagram read well:

- Give objects of the same rank the same size, and lay them out with `row()` or `column()`, a `gap()`, and `align("center")` rather than with coordinates.
- Use a tone for each role, such as inputs, processing, storage, and decisions, and no more than three or four on a slide. `solid` draws the eye to the one shape that matters, such as a start or an end.
- Use elbow connectors in flowcharts and trees, curves for looser relationships, and straight lines between neighbours. Keep labels to a word or two.

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

## In PowerPoint and Typst

Editable PPTX export turns each `shape()` into PowerPoint's own preset of the same outline, such as a diamond, a can, or a cloud, so it can still be recoloured, resized, or swapped for another shape there. Rectangles and circles become rectangles and ellipses, straight lines become lines, and elbow and curved connectors become paths, all with their arrowheads, dashes, and labels.

Typst export draws shapes as `polygon` and `curve` elements and connectors as lines and curves with their arrowheads, all of it editable Typst. Shadows are left out.

## Custom SVG artwork

Use an SVG file through `image()` when a diagram needs a logo, an illustration, or other geometry beyond the built-in primitives:

```ts
const artwork = new URL("./assets/custom-shape.svg", import.meta.url).href;

image(artwork, "Custom vector diagram")
  .position({ x: 760, y: 80 })
  .width(280);
```

This keeps the artwork vector-based in the browser and PDF. [`icon()`](content.md#icons) covers the common symbols without a file of your own.
