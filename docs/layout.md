# Layout

FrameSeq starts with useful single-column defaults. Add a layout only when a page needs a meaningful composition.

For the signature, parameters, behavior, and a compact example of every layout function, see the [Function reference](function-guide.md).

## Standard page

```ts
slide("One idea");
text("A standard page has a heading and a vertical content region.");
bullets("First point", "Second point");
```

## Centered page

```ts
slide({ name: "Quote" }).center();
text("Simplicity is a feature.").quote();
```

`center()` centers the normal content region horizontally and vertically.

## Split page

```ts
slide("Architecture").split("40:60");

image(diagram, "Compiler diagram");

right();
text("Compiler").lead();
bullets("TypeScript DSL", "HTML renderer", "PDF export");
```

Content written before `split()` moves into the left region. Subsequent content also starts on the left. Use `right()` and `left()` to switch destinations.

Accepted ratios include:

```ts
slide("A").split();            // 1:1
slide("B").split("40:60");    // ratio string
slide("C").split([2, 3]);      // number pair
slide("D").split(0.4);         // left fraction
slide("E").split(40);          // left percentage
```

Both sides of the ratio must be positive.

## Grid page

```ts
slide("Results").grid(3, 20);

cell(0);
metric("42%", "Growth");

cell(1);
metric("18K", "Users");

cell(2);
metric("99.9%", "Uptime");
```

Grid indices start at zero. A grid accepts 1–12 columns. Content written before `grid()` moves into cell `0`.

## Local grid section

Use `gridSection()` when only part of a slide should use a grid. Each supplied object becomes one cell, and the section stays between the normal content written before and after it:

```ts
slide("Results");
text("Performance this quarter");

gridSection(
  3,
  metric("42%", "Growth"),
  metric("18K", "Users"),
  metric("99.9%", "Uptime"),
).gap(20);

text("All targets were exceeded.");
```

Cells are filled in source order and wrap into additional rows when there are more items than columns. A string template supports unequal columns:

```ts
gridSection(
  "1fr 2fr",
  card("Context", "A compact supporting point"),
  card("Main result", "Give the primary result more room"),
);
```

For a cell made from multiple objects, use `group()`:

```ts
gridSection(
  2,
  group(text("Revenue").bold(), text("$1.2M").size(42)).card(),
  group(text("Users").bold(), text("18K").size(42)).card(),
);
```

`gridSection()` expresses a local parent-child relationship without requiring manual cell selection. Prefer it over a canvas for card rows, metrics, feature comparisons, and other regular two-dimensional arrangements.

## Return to the primary region

```ts
main();
```

`main()` selects the normal body, the left side of a split, or the first grid cell. Starting another slide resets the region automatically.

## Region spacing

```ts
gap(24);
```

`gap()` changes the spacing between children in the current region. Numbers are pixels; unit helpers are also accepted.

## Full-bleed image

```ts
slide({ name: "Landscape" }).fullBleed(photo, "Mountain landscape");
```

Use an object-form slide without `title` when the image should occupy the page without a standard heading.

## Freeform canvas

Change the current slide body into a positioned canvas, then set exact coordinates on any element:

```ts
slide({ name: "System map" }).canvas();

text("Compiler")
  .position({ x: 80, y: 90 })
  .width(320)
  .size(32)
  .bold();

image("diagram.png", "Compiler diagram")
  .position({ x: 500, y: 80 })
  .width(620);
```

The `x` and `y` coordinates are relative to the current canvas region. Plain numbers are pixels; unit helpers are also accepted. FrameSeq maps the fixed presentation canvas as one unit, so positioned elements retain their relative placement in interactive HTML, PDF, and PPTX.

The explicit object API is also available when an element should be created before it is attached:

```ts
import { Slides, Text, Image, px } from "@pride7/frameseq";

const slides = Slides("Diagram");
const page = slides.slide({ name: "Canvas" }).canvas();

page.place(
  Text("Compiler").size(32).bold(),
  { x: px(80), y: px(90), width: px(300) },
);
page.place(
  Image(diagram, "Compiler diagram"),
  { x: px(520), y: px(120), width: px(620) },
);

export default slides;
```

Prefer structured layouts for most pages. Use a canvas for diagrams and custom compositions that genuinely need exact placement.

For diagram primitives designed for this canvas, see [Shapes and connectors](shapes.md).
