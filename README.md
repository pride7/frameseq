# FrameSeq

FrameSeq is an experimental TypeScript framework for building presentations like app interfaces.

## Quick start

Create a complete presentation project:

```bash
npm create frameseq@latest my-talk
cd my-talk
npm install
npm run dev
```

The generated project includes a `slides.ts` document, editor type support, HTML builds, and PDF export commands.

To add FrameSeq to an existing TypeScript project instead:

```bash
npm install --save-dev @pride7/frameseq
npx frameseq new my-talk.slides.ts
npx frameseq dev my-talk.slides.ts
```

## Documentation

- [Getting started](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/getting-started.md)
- [Document model](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/document-model.md)
- [Content](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/content.md)
- [Layout](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/layout.md)
- [Themes](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/themes.md)
- [Styling](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/styling.md)
- [API reference](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/api-reference.md)
- [CLI reference](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/cli.md)
- [Advanced composition](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/advanced.md)

Start with the document model to understand how `presentation()`, `slide()`, and region selection work in a linear slide file.

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

slide().cover();
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

Presentations start with a neutral white `blank` theme. Select a built-in theme or create your own:

```ts
presentation({ title: "My Talk", theme: "midnight" });
```

Academic themes can generate a title bar, metadata footer, and slide number:

```ts
presentation({
  title: "My Talk",
  author: "Your Name",
  institute: "Your Institute",
  date: "2026",
  theme: "beamer-madrid",
});
```

The bundled `minimal-academic` theme can generate a restrained academic title page from presentation metadata:

```ts
presentation({
  title: "My Talk",
  subtitle: "A concise subtitle",
  author: "Your Name",
  institute: "Your Institute",
  date: "2026",
  theme: "minimal-academic",
});

slide().cover();
```

```ts
const ocean = defineTheme({
  name: "ocean",
  colors: { background: "#effcff", accent: "#007c91" },
});
presentation({ title: "Ocean Research", theme: ocean });
```

See [Themes](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/themes.md) for built-in themes and every customizable token.

Override typography for one presentation without creating a new theme:

```ts
presentation({
  title: "My Talk",
  theme: "minimal-academic",
  font: {
    family: '"Noto Sans SC", sans-serif',
    size: 24,
    heading: { family: '"Noto Serif SC", serif', weight: 700 },
    code: { family: '"JetBrains Mono", monospace', size: 18 },
  },
});
```

Element modifiers such as `text("Note").size(18)` override these presentation defaults.

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

## Build HTML

```bash
frameseq build my-talk.slides.ts
```

The static presentation is written to `dist/`. Use `--output path/to/directory` to choose another directory. The result can be hosted on any static web server.

## Export PDF

```bash
frameseq pdf my-talk.slides.ts
```

The generated file is written to `output/pdf/my-talk.pdf`. Use `--output path/to/file.pdf` to choose another path.

For the included example, `npm run export:pdf` writes `output/pdf/frameseq.pdf`.

## Low-level custom layouts

The original object API and low-level UI components remain available when a slide needs a special composition:

```ts
import { Column, Image, Row, Slides, Text } from "@pride7/frameseq";

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

The explicit import/export form remains supported for ordinary TypeScript modules. Zero-boilerplate injection applies to the entry file passed to `frameseq dev`, `frameseq build`, or `frameseq pdf`.

## Maintainer release check

Before publishing, run:

```bash
npm run release:check
```

This builds the library and demo, runs the browser smoke test, creates the npm tarballs, installs them in a clean project, checks the generated TypeScript document, and builds static HTML through the installed CLI.
