# Content

Every content command adds an object to the current slide region and returns a chainable builder.

For a definition, signature, parameters, return value, and focused example for every common command, see the [Function reference](function-guide.md).

## Text

```ts
text("A normal paragraph");

text("A highlighted sentence")
  .size(pt(28))
  .color("#38bdf8")
  .bold();
```

Text roles apply presentation-aware defaults:

```ts
text("Main title").hero();
text("Supporting message").subtitle();
text("Ada Lovelace").author();
text("SECTION 01").eyebrow();
text("The important idea").lead();
text("Source: Example").caption();
text("A memorable sentence").quote();
```

Calling another text role replaces the previous role on that object.

### Fit text to its room

`.fit()` shrinks an object's text until the object holds it, down to half its size by default:

```ts
slide("Abstract");
text(abstract).fit();
references().fit(0.6);
```

Every size inside the object scales together, so a list, a card, or a reference list keeps its proportions, and inline math scales with the words around it. The object takes the room its region has left, so the rest of the slide keeps its place. What still does not fit at the smallest scale is clipped, and `frameseq check` reports it. Display equations do the same on their own: one wider than its region shrinks to fit across it.

## Inline math

Put inline formulas between `$` delimiters:

```ts
text`Euler's identity is $e^{i\pi} + 1 = 0$.`;
```

The tagged-template form preserves LaTeX backslashes. A literal dollar sign can be written as `\$`.

## Display math

Use the `math` template tag for a standalone equation:

```ts
math`\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}`;
```

The string form is also accepted, but JavaScript escape rules apply:

```ts
math("\\frac{a}{b}");
```

FrameSeq renders formulas with KaTeX. Unsupported LaTeX commands are displayed as an equation error rather than stopping the whole presentation.

For complex local typesetting, see [Typst integration](typst.md). To reuse a LaTeX `tabular` fragment directly, see [LaTeX integration](latex.md).

## Code

```ts
code(`const answer = 42;`, "ts");
```

The second argument records the language and defaults to `"ts"`. Version 0.1 renders code as literal preformatted text; it does not perform syntax highlighting.

## Images

```ts
image("https://example.com/diagram.png", "System diagram");
```

Always provide useful alternative text for meaningful images. For an asset stored beside the slide source, let Vite resolve the URL:

```ts
const diagram = new URL("./assets/diagram.png", import.meta.url).href;
image(diagram, "Compiler pipeline");
```

Image objects support the normal size and appearance modifiers:

```ts
image(diagram, "Compiler pipeline")
  .width(percent(100))
  .radius(18);
```

## Tables

`table(rows)` takes the rows as arrays of cells; the first row is the heading:

```ts
table([
  ["Model", "Accuracy", "Latency"],
  ["Baseline", "91.2%", "18 ms"],
  ["FrameSeq", "94.6%", "12 ms"],
]);
```

The table is ruled like a paper's, heavy above and below and light under the heading. A column whose cells are all quantities, such as `94.6%` or `12 ms`, aligns right, and every other column aligns left. Cells may hold inline math between `$` signs.

```ts
table(rows)
  .header(2)                       // two heading rows; 0 for none
  .columnAlign("left", "center")   // from the first column; the rest keep theirs
  .striped();                      // shade every other row
```

PowerPoint export makes it a PowerPoint table, whose cells stay editable text, and Typst export a native `#table`. A table with math in a cell is exported as a picture, since PowerPoint cells hold plain text. For a table already written in LaTeX, see [LaTeX integration](latex.md).

## Charts

`chart(kind, data)` draws a chart from the numbers written beside it:

```ts
chart("bar", { Q1: 12, Q2: 18, Q3: 25 }).unit("%");

chart("line", {
  labels: ["Jan", "Feb", "Mar", "Apr"],
  series: { Revenue: [3, 5, 4, 7], Cost: [2, 2, 3, 3] },
});

chart("donut", { Search: 52, Direct: 31, Social: 17 });
```

The kinds are `"bar"`, `"hbar"` (horizontal bars), `"line"`, `"pie"`, and `"donut"`. One series is written as `{ label: value }`; several as `{ labels, series: { name: values } }`, one value per label. The first series takes the theme's accent colour.

| Modifier | What it does |
| --- | --- |
| `.unit(" ms")` | Writes values with a unit after them. |
| `.values(false)` | Hides the value beside each bar, point, or slice. |
| `.legend(true)` | Shows or hides the legend; it appears by itself for several series and for pies. |
| `.max(100)` | Fixes the top of the value axis, so several charts share one scale. |
| `.colors("#0f766e", "#f59e0b")` | Colours the series, or a pie's slices, in order. |

A chart fills its region's width at a 16:9 ratio until `.width()` or `.height()` says otherwise, and its text follows `.size()`. FrameSeq draws it at its real size, so labels stay readable in a narrow column. PowerPoint export makes it a PowerPoint chart from the same data, which can be edited there; Typst export embeds the drawing.

## QR codes

`qr(text)` turns a link, or any text, into a code the audience can scan with their phones:

```ts
qr("https://pride7.github.io/frameseq/").width(220);
```

It is 200 pixels square by default, drawn dark on light with the quiet margin scanners expect, and stays sharp at any size.

## Icons

`icon(name)` adds an icon from [Lucide](https://lucide.dev/icons), drawn in the text colour at the font size:

```ts
icon("rocket");
icon("chart-line").size(64).color("#0f766e");
```

TypeScript knows every icon name, so the editor completes them and a misspelled one is underlined before the slide runs. A preview has the whole set at hand; a built presentation carries only the icons its source names, so name icons with strings rather than building names at runtime.

## Citations

`cite()` numbers works from a bibliography, lists the works each slide cites at its foot, and `references()` adds the full list. See [Citations and references](citations.md).

## Shapes

Use `shape()` for diagram outlines such as diamonds, cylinders, and clouds, `rect()` and `circle()` for plain boxes, and `line()` for the connectors between them, all directly in the slide source:

```ts
slide({ name: "Pipeline" }).canvas();

rect("Input").as("input").position({ x: 80, y: 125 }).width(240).height(110);
shape("cylinder", "Orders").as("orders").position({ x: 760, y: 100 }).tone("purple");
line().from("input").to("orders").route("elbow").arrow();
```

See [Shapes and connectors](shapes.md) for every outline, colours, routes and labels, and custom SVG assets.

## Bullets

```ts
bullets(
  "Linear source code",
  "Useful layout defaults",
  "HTML and PDF output",
);
```

`bullets()` creates an unordered list that is visible immediately.

## Steps

```ts
steps(
  "Parse the document",
  "Build the page tree",
  "Render the presentation",
);
```

`steps()` creates a numbered list whose items are revealed one at a time during navigation.

For custom progressive disclosure, use `showAt()` on any content object:

```ts
text("First reveal").showAt(1);
image(diagram, "Diagram").showAt(2);
```

## Metrics

`metric(value, label)` creates a small data-emphasis object. The first argument is displayed as the large primary value; the second is a smaller label that explains the value.

```ts
metric("42%", "Growth");
```

This produces the visual idea “**42%** — Growth.” FrameSeq displays the supplied strings; it does not calculate or format the data. Use a metric for a short number-label pair, not for a sentence or paragraph.

Metrics are most useful when several comparable facts share a grid:

```ts
slide("Results").grid(3);

cell(0); metric("42%", "Growth");
cell(1); metric("18K", "Users");
cell(2); metric("99.9%", "Uptime");
```

When the grid should occupy only part of the slide, pass metric objects directly to `gridSection()`:

```ts
text("Quarterly results");

gridSection(
  3,
  metric("42%", "Growth"),
  metric("18K", "Users"),
  metric("99.9%", "Uptime"),
);

text("All targets were exceeded.");
```

`metric()` returns the metric object, so it can be styled or turned into a standard card:

```ts
metric("42%", "Revenue growth")
  .card()
  .background("#eff6ff");
```

## Cards

`card(title, content?)` creates a bordered title-and-copy surface for a short feature, option, or summary.

```ts
card("Portable", "Export HTML, PDF, and editable PPTX.");
```

Use `text()` for a normal paragraph and `metric()` for a key value. Use `card()` when the title and supporting sentence should read as one contained item.

## Groups

`group(...items)` combines multiple objects into one vertical object. It is useful when one grid cell needs children with different text roles or styles.

```ts
group(
  text("Revenue").bold(),
  text("$1.2M").size(42),
).card();
```

The child objects are created normally, then `group()` makes them one movable and styleable unit. See the [Function reference](function-guide.md) for a concise explanation and example of every common authoring function.
