# Layout

FrameSeq starts with useful single-column defaults. Add a layout only when a page needs a meaningful composition.

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

Freeform placement is part of the advanced object API because placed objects must be created before they are attached:

```ts
import { Slides, Text, Image, px } from "@pride7/frameseq";

const deck = Slides("Diagram");
const page = deck.slide({ name: "Canvas" }).canvas();

page.place(
  Text("Compiler").size(32).bold(),
  { x: px(80), y: px(90), width: px(300) },
);
page.place(
  Image(diagram, "Compiler diagram"),
  { x: px(520), y: px(120), width: px(620) },
);

export default deck;
```

Prefer structured layouts for most pages. A canvas uses absolute positioning and therefore needs more deliberate sizing.
