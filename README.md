# FrameSeq

**Write slides as an editable TypeScript document—not a tree of presentation markup.**

FrameSeq is an AI-friendly presentation framework with a linear authoring model, useful design defaults, chainable styling, and HTML/PDF output. It feels like building an interface, but the source stays as direct and readable as a document.

```ts
presentation({
  title: "A Better Way to Write Slides",
  author: "Ada Lovelace",
  theme: "minimal-academic",
});

slide().cover();

slide("Why FrameSeq");
text("Presentation code should describe ideas, not boilerplate.").lead();
bullets(
  "One linear TypeScript file",
  "Semantic layouts with useful defaults",
  "Tailwind styling without configuration",
  "Interactive HTML and PDF from the same source",
);

slide("Results").grid(3);
cell(0); metric("12 min", "To first draft");
cell(1); metric("1 file", "To maintain");
cell(2); metric("2 formats", "HTML + PDF");

slide("The model");
text`Every command belongs to the current slide until the next $\operatorname{slide}()$ call.`;
```

No imports, wrapper components, nested DOM, or export statement are required in a `.slides.ts` entry file.

## Why FrameSeq

### Easier to edit than raw HTML

HTML is an excellent rendering target, but presentation source written directly as HTML quickly mixes content, nesting, layout, and styling. FrameSeq keeps the author's intent visible:

```ts
slide("Architecture").split("40:60");

image("pipeline.png", "Compiler pipeline");

right();
text("Three clear stages").lead();
bullets("Parse the document", "Build the page tree", "Render HTML or PDF");
```

A slide starts with `slide()`; everything after it belongs to that slide until the next `slide()`. Layout changes are named operations such as `split()`, `grid()`, `right()`, and `cell()`. A local visual change stays attached to the object it affects.

This makes presentation code easier to read, rearrange, diff, and revise than a large hierarchy of generic elements.

### A strong target language for AI

FrameSeq is deliberately small and regular, which makes it well suited to AI-generated presentations:

- The source expresses presentation intent instead of DOM implementation details.
- Slide boundaries are explicit and require no indentation tree.
- Semantic commands such as `lead()`, `bullets()`, `metric()`, and `split()` reduce arbitrary design decisions.
- Local edits usually change a few lines without rebuilding an HTML structure.
- TypeScript catches misspelled APIs and invalid arguments.
- `frameseq check --json` gives agents measured overflow, clipping, and readability diagnostics they can correct directly.
- Themes and presentation-wide typography let AI change the visual system without rewriting every slide.
- The FrameSeq runtime owns rendering, navigation, responsive scaling, and PDF output.

An AI can generate a useful first draft with the semantic API, then a person can edit the same compact source. When a page needs more control, both can progressively add Tailwind utilities, custom themes, or low-level objects without abandoning the document.

### Progressive control

Start with defaults:

```ts
slide("One idea");
text("A normal slide already has spacing and typography.");
bullets("First point", "Second point");
```

Add a structured layout:

```ts
slide("Results").grid(3);
cell(0); metric("42%", "Growth");
cell(1); metric("18K", "Users");
cell(2); metric("99.9%", "Uptime");
```

Style one object:

```ts
text("Important")
  .style("text-4xl font-bold tracking-tight text-blue-600");
```

Or drop down to the explicit object API for a completely custom composition. FrameSeq does not force every slide into the same abstraction level.

## Quick start

Create a presentation project:

```bash
npm create frameseq@latest my-talk
cd my-talk
npm install
npm run dev
```

The generated project contains:

```text
my-talk/
├── slides.ts
├── package.json
└── tsconfig.json
```

Edit `slides.ts`; the browser preview updates as the file changes.

To use FrameSeq in an existing TypeScript project:

```bash
npm install --save-dev @pride7/frameseq
npx frameseq new my-talk.slides.ts
npx frameseq dev my-talk.slides.ts
```

## The document model

```ts
presentation("My Talk");

slide().cover();
text("Build slides like apps").hero();
text("Keep them as easy to edit as documents").subtitle();
text("Your name").author();

slide("Why");
text("Common slides use useful defaults.");
bullets(
  "No layout boilerplate",
  "KaTeX-powered formulas",
  "Browser preview and PDF export",
);

slide("Equation");
math`\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}`;
```

`presentation()` defines deck-wide metadata and design options. `slide()` starts a page. Content commands add objects to the current page and return chainable builders.

The FrameSeq compiler injects the authoring commands and exports the presentation automatically. Ordinary TypeScript imports, variables, URLs, and functions remain available when a deck needs them.

## Content

### Text roles

```ts
text("Main title").hero();
text("Supporting message").subtitle();
text("SECTION 01").eyebrow();
text("The important idea").lead();
text("Source: Example").caption();
text("A memorable sentence").quote();
```

Text roles provide consistent, theme-aware styling while remaining individually customizable.

### Formulas

Use a tagged template for display math:

```ts
math`\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}`;
```

Use `$...$` inside a tagged `text` template for inline math:

```ts
text`Euler's identity is $e^{i\pi} + 1 = 0$.`;
```

The tagged forms preserve backslashes, so `String.raw` is unnecessary.

### Typst for complex typesetting

Keep FrameSeq in control of the presentation structure and use Typst for a complex local fragment. Install the optional build-time compiler:

```bash
npm install --save-dev @myriaddreamin/typst-ts-node-compiler
```

Then use a static tagged template:

```ts
slide("Optimization");
text("Objective function").lead();

typst`
  #set text(size: 22pt)
  $ min_theta sum_(i=1)^n
    loss(f_theta(x_i), y_i) + lambda norm(theta)^2 $
`
  .width(720);
```

For larger fragments, keep Typst in its own file:

```ts
typstFile("./figures/architecture.typ")
  .width(percent(100));
```

FrameSeq compiles Typst to an inline SVG during the Vite build. The browser receives no Typst compiler or WASM, and the fragment participates in normal FrameSeq layout, styling, HTML, and PDF output. See [Typst integration](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/typst.md) for the current static-source restrictions.

### Code, lists, images, and reveals

```ts
code(`const answer = 42;`, "ts");

bullets("Readable source", "Useful defaults", "Flexible styling");

steps("Introduce the problem", "Reveal the model", "Show the result");

image("diagram.png", "System diagram");
```

`steps()` reveals items during navigation. In PDF output, all reveal steps remain visible.

## Layout

FrameSeq uses a single-column layout by default. Add structure only where it communicates something useful.

### Split

```ts
slide("Architecture").split("40:60");

image("diagram.png", "Compiler diagram");

right();
text("Compiler").lead();
bullets("TypeScript DSL", "HTML renderer", "PDF export");
```

### Grid

```ts
slide("Comparison").grid(3);

cell(0);
text("Simple").lead();
text("Useful defaults");

cell(1);
text("Flexible").lead();
text("Tailwind or object styles");

cell(2);
text("Portable").lead();
text("HTML and PDF");
```

### Freeform positioning

Switch the slide body to a canvas when an object needs exact coordinates:

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

Coordinates are relative to the current canvas region. Numbers are pixels in FrameSeq's fixed presentation coordinate system; the default presentation canvas is 1280 x 720, and the runtime scales the finished slide as one unit for interactive HTML and PDF. Prefer structured layouts for most pages, then use `canvas()` with `position()` for diagrams and custom compositions.

### Shapes and connectors

Create editable diagram nodes directly in the slide source. FrameSeq renders boxes and circles as HTML, while lines and arrowheads remain vector SVG:

```ts
slide({ name: "Pipeline" }).canvas();

line({ x1: 320, y1: 180, x2: 520, y2: 180 })
  .stroke("#2563eb")
  .strokeWidth(4)
  .arrow("end");

rect("TypeScript")
  .position({ x: 80, y: 125 })
  .width(240)
  .height(110)
  .fill("#dbeafe")
  .stroke("#2563eb")
  .radius(18);

circle("FrameSeq")
  .position({ x: 520, y: 100 })
  .width(160)
  .fill("#cffafe")
  .stroke("#0891b2");
```

Write connectors before nodes when the lines should appear behind them. See [Shapes and connectors](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/shapes.md) for arrow directions, layering, and custom SVG assets.

Other layout tools include `center()`, `fullBleed()`, `left()`, and `main()`.

## Styling

### Tailwind, built in

Pass Tailwind utilities directly to `style()`; no Tailwind config is required:

```ts
text("Designed in the source")
  .style("rounded-2xl bg-slate-900 px-8 py-5 text-3xl font-semibold text-white");
```

Arbitrary utilities such as `text-[30px]`, `left-[80px]`, and `bg-[#0f172a]` are supported.

### Chainable modifiers

```ts
text("A precise annotation")
  .size(18)
  .weight(600)
  .color("#475569")
  .margin(12, 0);
```

The object overload of `style()` accepts inline CSS when needed:

```ts
text("Custom").style({
  letterSpacing: "0.08em",
  textTransform: "uppercase",
});
```

## Themes and typography

FrameSeq starts with a neutral `blank` theme. Choose a bundled theme:

```ts
presentation({ title: "My Talk", theme: "midnight" });
```

Academic themes can build title bars, metadata footers, and slide numbers from presentation metadata:

```ts
presentation({
  title: "Diffusion Language Models",
  subtitle: "From iterative recovery to continuous state spaces",
  author: "Your Name",
  institute: "Your Institute",
  date: "2026",
  theme: "minimal-academic",
});

slide().cover();
```

Override presentation-wide typography without creating a theme:

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

Or define a reusable design system:

```ts
const ocean = defineTheme({
  name: "ocean",
  colors: {
    background: "#effcff",
    foreground: "#15343b",
    accent: "#007c91",
  },
});

presentation({ title: "Ocean Research", theme: ocean });
```

## Preview, build, and export

```bash
# Live browser preview
frameseq dev my-talk.slides.ts

# Static interactive website in dist/
frameseq build my-talk.slides.ts

# PDF in output/pdf/
frameseq pdf my-talk.slides.ts
```

The static HTML can be hosted on any static web server. Arrow keys, Page Up/Page Down, and Space navigate the interactive presentation.

## AI-friendly layout checks

FrameSeq can inspect the final browser geometry and return actionable diagnostics instead of asking an AI agent to guess from source code:

```bash
frameseq check my-talk.slides.ts
frameseq check my-talk.slides.ts --json
frameseq check my-talk.slides.ts --strict
```

The checker reports objects outside the canvas, clipped text, and unreadably small type. Each issue includes the slide label, FrameSeq object type and path, measured overflow, and suggested corrections. `--json` produces stable machine-readable output for coding agents and CI. See [AI-friendly layout checks](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/layout-checks.md).

## Presenter view

Attach private notes to any slide:

```ts
slide("Architecture")
  .notes("Explain why FrameSeq owns structure while Typst owns complex local layout.");
```

While viewing the presentation, press `P` or use the `P` button to open presenter view in a second window. It shows the current slide, next slide, speaker notes, timer, page selector, navigation controls, and a synchronized virtual laser pointer. Press `Ctrl+L` in presenter view to toggle the laser. The audience and presenter windows stay synchronized in both directions without a server.

You can also append `?presenter=1` to the audience page's current URL. For example, if the audience page is running on port `5174`:

```text
http://localhost:5174/?presenter=1
```

Use the port printed by `npm run dev`; Vite does not always use `5173` when that port is occupied.

Synchronization uses `BroadcastChannel`, so both windows must use the same browser origin and device. See [Presenter view](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/presenter.md).

## Advanced object API

The linear authoring layer is recommended for most slides. The low-level UI layer is available for special compositions:

```ts
import { Column, Image, Row, Slides, Text } from "@pride7/frameseq";

const deck = Slides("Custom layouts");

deck.slide("Architecture").custom(
  Row(
    Image("diagram.png"),
    Column(
      Text("Compiler").size(32).bold(),
      Text("DSL → HTML → PDF").size(20),
    ).gap(16),
  ).gap(40),
);

export default deck;
```

This layer includes `Deck`, `Slide`, `Row`, `Column`, `Stack`, `Text`, `Image`, `Code`, `Equation`, and chainable modifiers.

## Documentation

- [Getting started](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/getting-started.md)
- [Document model](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/document-model.md)
- [Content](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/content.md)
- [Layout](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/layout.md)
- [AI-friendly layout checks](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/layout-checks.md)
- [Themes](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/themes.md)
- [Styling](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/styling.md)
- [Shapes and connectors](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/shapes.md)
- [Presenter view](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/presenter.md)
- [Typst integration](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/typst.md)
- [API reference](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/api-reference.md)
- [CLI reference](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/cli.md)
- [Advanced composition](https://app.unpkg.com/@pride7/frameseq@latest/files/docs/advanced.md)

## Development

Before publishing a FrameSeq release:

```bash
npm run release:check
```

The release check builds the library and demo, runs browser tests at desktop and mobile viewport sizes, packs and installs the npm tarballs in a clean project, type-checks the generated document, builds static HTML, and exports a PDF.
