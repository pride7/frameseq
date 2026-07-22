# FrameSeq

**Write slides as an editable TypeScript document—not a tree of presentation markup.**

FrameSeq is an AI-friendly presentation framework with a linear authoring model, useful design defaults, chainable styling, and HTML/PDF/PPTX output. It feels like building an interface, but the source stays as direct and readable as a document.

[![CI](https://github.com/pride7/frameseq/actions/workflows/ci.yml/badge.svg)](https://github.com/pride7/frameseq/actions/workflows/ci.yml)
[![Gallery](https://github.com/pride7/frameseq/actions/workflows/gallery.yml/badge.svg)](https://pride7.github.io/frameseq/)

[Try FrameSeq online](https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground) · [Explore the live Gallery](https://pride7.github.io/frameseq/) · [Read the documentation](https://github.com/pride7/frameseq/tree/main/docs) · [See what changed](https://github.com/pride7/frameseq/blob/main/CHANGELOG.md)

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
  "Interactive HTML, PDF, and editable PowerPoint",
);

slide("Results").grid(3);
cell(0); metric("12 min", "To first draft");
cell(1); metric("1 file", "To maintain");
cell(2); metric("3 formats", "HTML · PDF · PPTX");

slide("The model");
text`Every command belongs to the current slide until the next $\operatorname{slide}()$ call.`;
```

No imports, wrapper components, nested DOM, or export statement are required in a `.slides.ts` entry file.

## Table of contents

- [Live Gallery](#live-gallery)
- [Why FrameSeq](#why-frameseq)
  - [Easier to edit than raw HTML](#easier-to-edit-than-raw-html)
  - [A strong target language for AI](#a-strong-target-language-for-ai)
  - [Progressive control](#progressive-control)
- [Quick start](#quick-start)
- [The document model](#the-document-model)
- [Content](#content)
  - [Formulas](#formulas)
  - [Typst for complex typesetting](#typst-for-complex-typesetting)
  - [LaTeX tables](#latex-tables)
  - [Code, lists, images, and reveals](#code-lists-images-and-reveals)
- [Layout](#layout)
  - [Split](#split)
  - [Grid](#grid)
  - [Freeform positioning](#freeform-positioning)
  - [Shapes and connectors](#shapes-and-connectors)
- [Styling](#styling)
- [Themes and typography](#themes-and-typography)
- [Preview, build, and export](#preview-build-and-export)
- [AI-friendly layout checks](#ai-friendly-layout-checks)
- [Presenter view](#presenter-view)
- [Advanced object API](#advanced-object-api)
- [Documentation](#documentation)
- [Continuous integration and changelog](#continuous-integration-and-changelog)
- [Development](#development)

## Live Gallery

The [FrameSeq Gallery](https://pride7.github.io/frameseq/) contains live, clickable presentations built from this repository: a product tour, a complete AI-oriented research example, and previews of all seven built-in themes. The previews are compiled FrameSeq pages rather than screenshots, so they always track the current runtime and themes.

## Why FrameSeq

### Easier to edit than raw HTML

HTML is an excellent rendering target, but presentation source written directly as HTML quickly mixes content, nesting, layout, and styling. FrameSeq keeps the author's intent visible:

```ts
slide("Architecture").split("40:60");

image("pipeline.png", "Compiler pipeline");

right();
text("Three clear stages").lead();
bullets("Parse the document", "Build the page tree", "Render HTML, PDF, or PPTX");
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
- `frameseq check --json` gives agents empty-slide, measured overflow, clipping, and readability diagnostics they can correct directly.
- Themes and presentation-wide typography let AI change the visual system without rewriting every slide.
- The FrameSeq runtime owns rendering, navigation, responsive scaling, and HTML, PDF, and PPTX output.

An AI can generate a useful first draft with the semantic API, then a person can edit the same compact source. When a page needs more control, both can progressively add Tailwind utilities, custom themes, or low-level objects without abandoning the document.

Give a coding agent the compact [`llms.txt`](https://github.com/pride7/frameseq/blob/main/llms.txt) contract, then use the [AI generation guide](https://github.com/pride7/frameseq/blob/main/docs/ai-generation.md) for prompting, validation, and correction loops. The Gallery includes a [complete AI-oriented research example](https://pride7.github.io/frameseq/examples/ai-research/) and its [editable source](https://github.com/pride7/frameseq/blob/main/gallery/slides/ai-research.slides.ts).

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

Open the editable [FrameSeq Playground in StackBlitz](https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground) to change `slides.ts` and see the live presentation without installing anything.

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

`presentation()` defines presentation-wide metadata and design options. `slide()` starts a page. Content commands add objects to the current page and return chainable builders.

The FrameSeq compiler injects the authoring commands and exports the presentation automatically. Ordinary TypeScript imports, variables, URLs, and functions remain available when the slides need them.

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

FrameSeq compiles Typst to an inline SVG during the Vite build. The browser receives no Typst compiler or WASM, and the fragment participates in normal FrameSeq layout and styling across HTML, PDF, and PPTX output. In editable PPTX export, the rendered fragment is preserved as a high-resolution image. See [Typst integration](https://github.com/pride7/frameseq/blob/main/docs/typst.md) for the current static-source restrictions.

### LaTeX tables

Keep KaTeX for ordinary formulas and use the optional Tectonic backend when a slide needs a real LaTeX table. Install it locally:

```bash
npm install --save-dev node-tectonic
```

Then place the table like any other FrameSeq object:

```ts
slide("Results");

latex`
  \begin{tabular}{lrr}
    \toprule
    Model & Accuracy & Latency \\
    \midrule
    Baseline & 91.2\% & 18 ms \\
    FrameSeq & \textbf{94.6\%} & 12 ms \\
    \bottomrule
  \end{tabular}
`
  .width(820)
  .position({ x: 180, y: 210 });
```

`latexFile("./tables/results.tex")` keeps larger fragments in their own files. FrameSeq compiles static fragments at build time, embeds the generated fonts, caches the result by content, and preserves it across HTML, PDF, and PPTX export. See [LaTeX integration](https://github.com/pride7/frameseq/blob/main/docs/latex.md) for supported packages and restrictions.

### Code, lists, images, and reveals

```ts
code(`const answer = 42;`, "ts");

bullets("Readable source", "Useful defaults", "Flexible styling");

steps("Introduce the problem", "Reveal the model", "Show the result");

image("diagram.png", "System diagram");
```

`steps()` reveals items during navigation. PDF and PPTX export include the fully revealed slide.

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

Coordinates are relative to the current canvas region. Numbers are pixels in FrameSeq's fixed presentation coordinate system; the default presentation canvas is 1280 x 720, and FrameSeq maps that finished geometry consistently to interactive HTML, PDF, and PPTX. Prefer structured layouts for most pages, then use `canvas()` with `position()` for diagrams and custom compositions.

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

Write connectors before nodes when the lines should appear behind them. See [Shapes and connectors](https://github.com/pride7/frameseq/blob/main/docs/shapes.md) for arrow directions, layering, and custom SVG assets.

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

# One self-contained dist/index.html
frameseq build my-talk.slides.ts --single-file

# PDF in output/pdf/
frameseq pdf my-talk.slides.ts

# Editable PowerPoint in output/pptx/
frameseq pptx my-talk.slides.ts

# Pixel-faithful PowerPoint with one image per slide
frameseq pptx my-talk.slides.ts --flatten
```

The default static build uses relative asset paths, so `dist/` can be hosted at a domain root or a repository subpath such as GitHub Pages. New projects include an Actions workflow that publishes `dist/` on pushes to `main` or `master`. The single-file build embeds the framework's scripts, styles, fonts, and favicon into one directly openable HTML file. PPTX export keeps normal text and shapes editable while using high-resolution image fallbacks for math, Typst, and LaTeX fragments; `--flatten` turns each complete slide into one image for maximum fidelity. See [Deploy HTML](https://github.com/pride7/frameseq/blob/main/docs/deployment.md) and [Export PowerPoint](https://github.com/pride7/frameseq/blob/main/docs/pptx.md).

Arrow keys, Page Up/Page Down, and Space navigate the interactive presentation.

## AI-friendly layout checks

FrameSeq can inspect the final browser geometry and return actionable diagnostics instead of asking an AI agent to guess from source code:

```bash
frameseq check my-talk.slides.ts
frameseq check my-talk.slides.ts --json
frameseq check my-talk.slides.ts --strict
```

The checker reports empty slides, objects outside the canvas, clipped text, and unreadably small type. Each issue includes the slide label, FrameSeq object type and path, relevant measurements, and suggested corrections. Mark a deliberate blank page with `slide().allowEmpty()`; `--json` produces stable machine-readable output for coding agents and CI. See [AI-friendly layout checks](https://github.com/pride7/frameseq/blob/main/docs/layout-checks.md).

## Presenter view

Attach private notes to any slide:

```ts
slide("Architecture")
  .notes("Explain why FrameSeq owns structure while Typst owns complex local layout.");
```

While viewing the presentation, press `P` or use the `P` button to open presenter view in a second window. It shows the current slide, next slide, speaker notes, timer, page selector, navigation controls, and a synchronized virtual laser pointer. Press `Ctrl+L` in presenter view to toggle the laser. The audience and presenter windows stay synchronized in both directions without a server.

For a phone remote on the same Wi-Fi, run:

```bash
npm run present
```

Select the `R` control and scan the QR code. The phone starts with large navigation controls, a current-slide preview, and a touch laser surface. Select **Presenter view** on the phone to see speaker notes, the next-slide preview, timer, and page selector; **Simple remote** returns to the touch-friendly controller without losing the pairing session. FrameSeq relays navigation, reveal steps, and pointer coordinates through the local presentation server—no account, internet connection, or cloud service is required.

You can also append `?presenter=1` to the audience page's current URL. For example, if the audience page is running on port `5174`:

```text
http://localhost:5174/?presenter=1
```

Use the port printed by `npm run dev`; Vite does not always use `5173` when that port is occupied.

Same-device synchronization uses `BroadcastChannel`; phone pairing uses a local WebSocket only while `npm run present` is active. See [Presenter view](https://github.com/pride7/frameseq/blob/main/docs/presenter.md).

## Advanced object API

The linear authoring layer is recommended for most slides. The low-level UI layer is available for special compositions:

```ts
import { Column, Image, Row, Slides, Text } from "@pride7/frameseq";

const slides = Slides("Custom layouts");

slides.slide("Architecture").custom(
  Row(
    Image("diagram.png"),
    Column(
      Text("Compiler").size(32).bold(),
      Text("DSL → HTML → PDF").size(20),
    ).gap(16),
  ).gap(40),
);

export default slides;
```

This layer includes `SlidesRoot`, `Slide`, `Row`, `Column`, `Stack`, `Text`, `Image`, `Code`, `Equation`, and chainable modifiers.

## Documentation

- [Live Gallery](https://pride7.github.io/frameseq/)
- [Getting started](https://github.com/pride7/frameseq/blob/main/docs/getting-started.md)
- [Document model](https://github.com/pride7/frameseq/blob/main/docs/document-model.md)
- [Content](https://github.com/pride7/frameseq/blob/main/docs/content.md)
- [Layout](https://github.com/pride7/frameseq/blob/main/docs/layout.md)
- [Generate presentations with AI](https://github.com/pride7/frameseq/blob/main/docs/ai-generation.md)
- [AI-friendly layout checks](https://github.com/pride7/frameseq/blob/main/docs/layout-checks.md)
- [Deploy HTML](https://github.com/pride7/frameseq/blob/main/docs/deployment.md)
- [Themes](https://github.com/pride7/frameseq/blob/main/docs/themes.md)
- [Styling](https://github.com/pride7/frameseq/blob/main/docs/styling.md)
- [Shapes and connectors](https://github.com/pride7/frameseq/blob/main/docs/shapes.md)
- [Presenter view](https://github.com/pride7/frameseq/blob/main/docs/presenter.md)
- [Typst integration](https://github.com/pride7/frameseq/blob/main/docs/typst.md)
- [LaTeX integration](https://github.com/pride7/frameseq/blob/main/docs/latex.md)
- [API reference](https://github.com/pride7/frameseq/blob/main/docs/api-reference.md)
- [CLI reference](https://github.com/pride7/frameseq/blob/main/docs/cli.md)
- [Advanced composition](https://github.com/pride7/frameseq/blob/main/docs/advanced.md)
- [Release automation](https://github.com/pride7/frameseq/blob/main/docs/releasing.md)
- [Version changelog](https://github.com/pride7/frameseq/blob/main/CHANGELOG.md)

## Continuous integration and changelog

Every push and pull request runs the complete `release:check` suite on GitHub Actions: types, themes, desktop and mobile browser behavior, layout diagnostics, remote control, Gallery, static and single-file HTML, PDF, editable and flattened PPTX, and installation from packed npm tarballs. A separate least-privilege workflow builds the live Gallery and deploys it to GitHub Pages only from `main`.

User-visible changes are recorded in [CHANGELOG.md](https://github.com/pride7/frameseq/blob/main/CHANGELOG.md). Add new work under **Unreleased**, then move it into a dated semantic-version section when publishing.

## Development

Before publishing a FrameSeq release locally:

```bash
npm run release:check
```

The release check builds the library, demo, and Gallery, runs browser tests at desktop and mobile viewport sizes, packs and installs the npm tarballs in a clean project, type-checks the generated document, builds static HTML, and exports PDF and PPTX files.

Maintainers can instead publish both npm packages from a matching version tag through GitHub OIDC. See [Release FrameSeq](https://github.com/pride7/frameseq/blob/main/docs/releasing.md) for the one-time Trusted Publisher configuration and tag workflow.
