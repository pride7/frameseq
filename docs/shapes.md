# Shapes and connectors

FrameSeq draws diagrams from a small set of primitives: `shape()` with 27 outlines, from flowchart symbols to block arrows; `polygon()` through corners of your own; the `rect()` and `circle()` boxes; and `line()` connectors that run straight, at right angles, or in a curve between named objects. Every one of them stays editable after export: PowerPoint receives its own preset shapes and lines, and Typst receives polygons and curves.

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

## Polygons

When no kind has the outline a diagram needs, such as an encoder that narrows from one side to the other, `polygon(points, label)` draws one through corners of your own:

```ts
polygon([[0, 0], [64, 47], [64, 153], [0, 200]], "Encoder")
  .position({ x: 190, y: 370 })
  .tone("gray");
```

The corners are `[x, y]` pixels, measured from any origin, in order around the outline. The polygon is as large as they span, here 64 x 200, and is placed like any shape, with `position()`, `anchor()`, or a placement such as `rightOf()`. `width()` and `height()` stretch it, and each corner keeps its place across the box. A polygon needs at least three corners, and they must span some width and some height.

In every other respect a polygon is a shape: `tone()`, `fill()`, `stroke()`, `dashed()`, and `shadow()` paint it, its label is centred in its box, and connectors meet the edges of that box.

## Cells

Figures about models are full of equal cells: tokens, embeddings, codes, attention masks, and similarity matrices. `cells(values)` draws a row of them from a list, or a grid from rows:

```ts
cells([0.3, 0.9, 0.1, 0.6]).tone("amber").framed().as("codes").position({ x: 80, y: 360 });
cells(["Madison", "Square", "Garden"]).cell(110, 40).position({ x: 80, y: 500 });

const pairs = [[1, 0.1, 0.1], [0.1, 1, 0.1], [0.1, 0.1, 1]];
cells(pairs).tone("indigo").cell(76).labels((r, c) => `$I_${r + 1} \\cdot T_${c + 1}$`).as("similarity");
```

- A number from 0 to 1 shades its cell in the tone, from a faint tint to the full colour, with a label that reads on it.
- Words are written in a cell of a faint tint of the tone, or of grey when no tone is set.
- `null` is a masked cell, a faint grey, as in an attention mask.

`tone()` takes the same colours as a shape's, `"accent"` unless set; `cell(width, height)` sizes each cell, 32 pixels square by default; `gap()` sets the space between them, 4 pixels unless set, and 0 makes them touch; `labels()` writes words in the cells from rows of words or a function of the row and column; `size()` sets those words' size; and `framed()` draws a rounded frame around the cells, as around a sequence of tokens. Rows must be the same length. The whole set is one object, as large as its cells, so it is named, placed, and connected like a shape, and each cell exports to PowerPoint as a rectangle of its own.

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

A `rect()` or `circle()` without a label has no padding, so a small one, such as a cell in a strip of colours, keeps the size it is given:

```ts
rect().width(30).height(30).radius(3).fill("#f4b42c").stroke("#e8a92a");
```

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
- `"elbow"` turns at right angles. It leaves and enters its objects square to their sides, and runs around the other objects on its canvas rather than through them, the way a flowchart's connectors do. A box drawn around either end, such as a panel or the outline of a repeated block, is a frame it runs inside, not something in its way, so a skip connection inside one still goes out to the side and back in.
- `"curve"` is a smooth curve that also leaves and enters square.

### Junctions and splits

A figure's connectors often meet or split: a skip connection leaves the main path, or one stream feeds three inputs. `junction()` is the point where that happens, a small dot in the connectors' colour that is named, placed, and connected like any object:

```ts
junction().as("split").above("plus", 50);
shape("rounded", "Attention").as("attention").above("split", 30).width(240).height(58);

line().from("plus").to("split");                                                        // the main path
line().from("split.left").to("attention.bottom", { dx: -60 }).route("elbow").arrow();   // queries
line().from("split").to("attention.bottom").arrow();                                    // keys
line().from("split.right").to("attention.bottom", { dx: 60 }).route("elbow").arrow();   // values
line().from("split.right").to("norm.right").route("elbow").arrow();                     // the skip
```

Given a sign, `junction("+")` is the small round operator where streams are added, and `junction("×")` where they are multiplied: a 32-pixel circle in the background colour, outlined like the connectors. `fill()`, `stroke()`, and `width()` change either kind.

### Stops on the way

`via()` runs a connector through points on its way, in order: named objects, which it passes at their centre or at the anchor named, or `[x, y]` coordinates on the canvas. A straight connector then runs from each point to the next, and an elbow turns at right angles between them:

```ts
line().from("output.right").via([640, 117], [640, 690]).to("embedding.right").dashed().arrow();
```

Each end of the connector faces the stop it heads for first. A curve takes no stops.


```ts
line().from("check").to("run").arrow().label("no");
line().from("worker").to("queue").route("curve").dashed().label("async");
```

`label()` writes a short text halfway along the connector, on the slide's background so the line stops behind it. `dashed()` dashes the line, as for an optional or asynchronous step.

## Drawing in FrameSeq Studio

In [FrameSeq Studio](studio.md#drawing-objects), **Insert** opens a gallery of every shape, a text box, a line, an arrow, a connector, and a polygon. Pick one and drag it out on the slide in the preview, or click in a polygon corner by corner: FrameSeq writes the command with the coordinates and size you drew, and you can go on dragging and resizing it. Dragging a connector from one object to another names both, if they have no names yet, and writes a `line().from().to()` that follows them.

## Composing a diagram

Names, automatic layout, and connectors are covered in [Diagrams](diagrams.md), which shows how to build a diagram whose objects carry no coordinates at all. A few habits make a diagram read well:

- Give objects of the same rank the same size, and lay them out with `row()` or `column()`, a `gap()`, and `align("center")` rather than with coordinates.
- Keep most boxes neutral, with `tone("gray")`, a thin outline, and a label of ordinary weight, as a figure in a paper does. Save colour for what it should mark, one hue for one kind of thing, and make only the one shape that matters most `solid`.
- Let the connectors recede: `stroke("var(--frameseq-muted)")` and `strokeWidth(2)` draw them thin and grey, with small arrowheads, in any theme.
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

Editable PPTX export turns each `shape()` into PowerPoint's own preset of the same outline, such as a diamond, a can, or a cloud, so it can still be recoloured, resized, or swapped for another shape there. A `polygon()` becomes a freeform through the same corners, whose points PowerPoint can edit. Rectangles, circles, and junctions become rectangles and ellipses, straight lines become lines, and elbow and curved connectors and connectors through stops become paths, all with their arrowheads, dashes, and labels.

Typst export draws shapes and polygons as `polygon` and `curve` elements and connectors as lines and curves with their arrowheads, all of it editable Typst. Shadows are left out.

## Custom SVG artwork

Use an SVG file through `image()` when a diagram needs a logo, an illustration, or other geometry beyond the built-in primitives:

```ts
const artwork = new URL("./assets/custom-shape.svg", import.meta.url).href;

image(artwork, "Custom vector diagram")
  .position({ x: 760, y: 80 })
  .width(280);
```

This keeps the artwork vector-based in the browser and PDF. [`icon()`](content.md#icons) covers the common symbols without a file of your own.
