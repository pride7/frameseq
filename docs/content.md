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

## Shapes

Use `rect()`, `circle()`, and `line()` to build editable diagrams directly in the slide source:

```ts
slide({ name: "Pipeline" }).canvas();

line({ x1: 320, y1: 180, x2: 520, y2: 180 }).arrow("end");
rect("Input").position({ x: 80, y: 125 }).width(240).height(110);
circle("Model").position({ x: 520, y: 100 }).width(160);
```

See [Shapes and connectors](shapes.md) for fills, strokes, arrow directions, coordinate behavior, and custom SVG assets.

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
