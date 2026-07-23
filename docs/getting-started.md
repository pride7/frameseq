# Getting started

## Try it online

Open the [FrameSeq Playground in StackBlitz](https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground) to edit `slides.ts` and use the live preview entirely in the browser. StackBlitz creates a personal fork when you save, so the repository example remains unchanged.

## Create a project

```bash
npm create frameseq@latest my-talk
cd my-talk
npm install
npm run dev
```

The generated project contains a `slides.ts` document and TypeScript configuration for FrameSeq's global authoring commands.

```text
my-talk/
├─ package.json
├─ slides.ts
└─ tsconfig.json
```

## Write the presentation

```ts
presentation("My Talk");

slide({ name: "Cover" }).cover();
text("Build presentations like interfaces").hero();
text("TypeScript → HTML → PDF").subtitle();
text("Your name").author();

slide("First idea")
  .notes("Introduce the main idea and pause before the three supporting points.");
text("Explain one idea per page.")
  .style("text-3xl font-semibold tracking-tight text-blue-600");
bullets(
  "Linear source code",
  "UI-style modifiers",
  "Browser preview and PDF export",
);

slide("Equation");
text`Inline math: $E = mc^2$`;
math`\int_0^\infty e^{-x}\,dx = 1`;
```

This starts with the neutral white `blank` theme. You can select a built-in theme with `presentation({ title: "My Talk", theme: "midnight" })`; see [Themes](themes.md) for custom themes.

The file needs no framework import, slides variable, wrapper, or default export. FrameSeq injects the common document commands into the entry file and exports the active presentation.

Tailwind CSS utilities passed to `style("...")` work without installing or configuring Tailwind in the generated project. See [Styling](styling.md) for arbitrary values, inline CSS, and modifier precedence.

## Preview

```bash
npm run dev
```

The browser opens automatically and updates when the source file changes. Use Arrow keys, Page Up, Page Down, or Space to navigate. Incremental content created with `steps()` or `showAt()` is revealed before navigation continues to the next page.

Press `P` to open the synchronized [presenter view](presenter.md) in a second window. Speaker notes never appear on the audience page or in PDF output; PPTX export preserves them as PowerPoint speaker notes.

To present with a phone remote, start the local-network server:

```bash
npm run present
```

Open the presentation on the computer, select the `R` control, and scan the displayed QR code from a phone on the same Wi-Fi. The phone can navigate slides and reveal steps or control the synchronized laser pointer.

Before presenting, check both TypeScript and the final browser geometry:

```bash
npm run check
```

Generated projects run [`frameseq check`](layout-checks.md) as part of this command and report slide-specific fixes for empty pages, overflow, clipping, and small text.

## Build static HTML

```bash
npm run build
```

The generated static presentation is written to `dist/`. Its relative asset paths work both at a domain root and at repository URLs such as `https://user.github.io/my-talk/`.

To generate a self-contained `dist/index.html` instead:

```bash
npm run build:single
```

New projects also include a GitHub Actions workflow that builds and deploys `dist/`. See [Deploy HTML](deployment.md) for the one-time GitHub Pages setting and alternative hosting options.

## Export PDF

```bash
npm run pdf
```

The default output is `output/pdf/slides.pdf`. Choose another path with the CLI directly:

```bash
npx frameseq pdf slides.ts --output output/my-talk.pdf
```

## Export PowerPoint

```bash
npm run pptx
```

The default output is `output/pptx/slides.pptx`. Text, code, shapes, connectors, and speaker notes remain editable PowerPoint objects where possible; formulas, Typst, and compiled LaTeX fragments use high-resolution image fallbacks. For the closest visual match to the browser, export one image per slide:

```bash
npx frameseq pptx slides.ts --flatten
```

See [Export PowerPoint](pptx.md) for details.

## Export Typst

```bash
npm run typst
```

The default output is `output/typst/slides.typ`. The file is editable Typst source: slide pages, text, grids, positions, shapes, and code remain native objects, LaTeX formulas and basic text use MiTeX, and common LaTeX `tabular` fragments become native Typst tables.

```bash
typst compile output/typst/slides.typ
```

See [Typst integration](typst.md) for the mapping and conversion notes.

## Add FrameSeq to an existing project

```bash
npm install --save-dev @pride7/frameseq
npx frameseq new talk.slides.ts
npx frameseq dev talk.slides.ts
```

For editor support in a zero-import slide file, add the global declarations to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@pride7/frameseq/globals"]
  },
  "include": ["*.slides.ts"]
}
```

Continue with the [document model](document-model.md).
