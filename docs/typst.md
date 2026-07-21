# Typst integration

FrameSeq owns the presentation structure; Typst owns complex local typesetting. A Typst fragment is a normal FrameSeq content object, so it can participate in slide layouts, receive chainable modifiers, and appear in both interactive HTML and PDF output.

## Install the optional compiler

Typst compilation happens during the Vite build and is optional for projects that do not use Typst:

```bash
npm install --save-dev @myriaddreamin/typst-ts-node-compiler
```

The compiler is not included in the browser bundle.

## Inline fragments

Use `typst` as a static tagged template:

```ts
slide("Optimization");
text("Objective function").lead();

typst`
  #set text(size: 22pt, fill: rgb("#2563eb"))

  $ min_theta sum_(i=1)^n
    loss(f_theta(x_i), y_i) + lambda norm(theta)^2 $
`
  .width(720);
```

FrameSeq automatically gives the Typst fragment a transparent, tightly fitted page before compiling it to inline SVG. A `#set page(...)` rule inside the fragment can override that behavior deliberately.

The string form is also accepted:

```ts
typst("#table(columns: 2, [A], [B], [C], [D])");
```

## External files

Use a `.typ` file when a diagram, table, or other fragment should be edited independently:

```ts
typstFile("./figures/architecture.typ")
  .width(percent(100));
```

Paths are resolved relative to the `.slides.ts` entry file and must remain inside that directory. The file is registered with Vite, so saving it triggers a rebuild during development. Typst imports inside the file resolve from the same workspace.

## Styling and layout

The returned object supports the usual modifiers:

```ts
typstFile("./results.typ")
  .width(840)
  .style("rounded-2xl bg-white p-5")
  .showAt(2);
```

FrameSeq styles the outer container. Colors, typefaces, table strokes, and other details inside the rendered fragment should be defined in Typst.

## Build pipeline

```text
Static Typst source
        ↓ typst.ts during Vite build
Inline SVG
        ↓ FrameSeq layout and runtime
Interactive HTML / PDF
```

The current SVG output keeps complex layout visually consistent across the browser and PDF paths without loading a Typst compiler at runtime.

## Current restrictions

- Tagged templates must be static. JavaScript interpolation is not supported yet.
- `typstFile()` requires a static string path.
- Typst is currently rendered as SVG rather than semantic HTML or MathML.
- FrameSeq themes do not automatically change styles inside a Typst fragment.
- Whole-slide Typst documents are intentionally outside the first integration: FrameSeq remains responsible for slide structure, navigation, themes, and responsive scaling.
