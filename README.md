# FrameSeq

FrameSeq is an experimental TypeScript framework for building presentations like app interfaces.

## Create one file

After installing or linking the package, create a deck with:

```bash
frameseq new my-talk.slides.ts
```

Inside this repository, the equivalent command is:

```bash
npm run frameseq -- new my-talk.slides.ts
```

The generated `.slides.ts` file is written from top to bottom like a document:

```ts
presentation("My Talk");

slide({ name: "Cover" }).cover();
text("Build slides like apps").hero();
text("TypeScript → HTML → PDF").subtitle();
text("Your name").author().size(pt(16));

slide("Why");
text("Common slides use useful defaults.");
bullets(
  "No layout boilerplate",
  "LaTeX-compatible math",
  "Browser preview and PDF export",
);

slide("Equation");
math`E = mc^2`;
```

The FrameSeq document compiler automatically provides the common commands and exports the presentation. A slide document therefore needs no framework import, `deck` variable, or `export default`.

`slide()` starts the current page. Every `text()`, `bullets()`, `code()`, `math()`, or `image()` after it belongs to that page, up to the next `slide()` call. There is no wrapper and no indentation tree.

Content functions create real objects, so modifiers remain chainable:

```ts
text("A smaller note")
  .size(pt(18))
  .color("#94a3b8");
```

Font sizes, spacing, and layout have useful defaults, so modifiers are optional.

LaTeX-style equations use `math` as a template tag, so backslashes need no extra escaping and `String.raw` is unnecessary:

```ts
math`\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}`;
```

Inline equations use `$...$` inside a tagged `text` template:

```ts
text`The identity $e^{i\pi} + 1 = 0$ appears inside this sentence.`;
```

Plain text without equations can still use `text("...")`.

## Common layouts

Use short region switches for split layouts. Content initially goes into the left region; `right()` changes the destination:

```ts
slide("Architecture").split("40:60");

image("diagram.png");

right();
text("Compiler").lead();
bullets("TypeScript DSL", "HTML renderer", "PDF export");
```

Use indexed cells for grids:

```ts
slide("Results").grid(3);

cell(0); metric("42%", "Growth");
cell(1); metric("18K", "Users");
cell(2); metric("99.9%", "Uptime");
```

`left()`, `right()`, and `cell(index)` only change where subsequent content is placed. A new `slide()` resets the destination automatically. Other layout helpers include `center()`, `fullBleed(image)`, and `canvas().place(element, bounds)`.

## Preview

```bash
frameseq dev my-talk.slides.ts
```

The browser opens automatically. Changes update immediately. Use Arrow keys, Page Up/Page Down, or Space to navigate.

For the included `slides.ts` example, run `npm run dev`.

## Export PDF

```bash
frameseq pdf my-talk.slides.ts
```

The generated file is written to `output/pdf/my-talk.pdf`. Use `--output path/to/file.pdf` to choose another path.

For the included example, `npm run export:pdf` writes `output/pdf/frameseq.pdf`.

## Low-level custom layouts

The original object API and low-level UI components remain available when a slide needs a special composition:

```ts
import { Column, Image, Row, Slides, Text } from "frameseq";

const customDeck = Slides("Custom layouts");

customDeck.slide("Architecture").custom(
  Row(
    Image("diagram.png"),
    Column(
      Text("Compiler").size(32).bold(),
      Text("DSL → HTML → PDF").size(20),
    ).gap(16),
  ).gap(40),
);

export default customDeck;
```

The low-level layer includes `Deck`, `Slide`, `Row`, `Column`, `Stack`, `Text`, `Image`, `Code`, `Equation`, and chainable style modifiers.

The explicit import/export form remains supported for ordinary TypeScript modules. Zero-boilerplate injection applies to the entry file passed to `frameseq dev` or `frameseq pdf`.
