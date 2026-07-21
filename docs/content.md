# Content

Every content command adds an object to the current slide region and returns a chainable builder.

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

For tables, diagrams, theorem blocks, or other content that benefits from Typst's layout engine, see [Typst integration](typst.md).

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

```ts
metric("42%", "Growth");
```

Metrics are most useful inside a grid:

```ts
slide("Results").grid(3);

cell(0); metric("42%", "Growth");
cell(1); metric("18K", "Users");
cell(2); metric("99.9%", "Uptime");
```
