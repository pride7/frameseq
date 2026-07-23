# Typst integration

FrameSeq owns the presentation structure; Typst owns complex typesetting. You can embed a Typst fragment as a normal FrameSeq object, or export the complete presentation as editable `.typ` source.

## Export the complete presentation

```bash
npm run typst
```

The default output is `output/typst/slides.typ`. To choose another path:

```bash
npx frameseq typst slides.ts --output reports/talk.typ
```

FrameSeq converts each slide into a fixed-size Typst `page`. Text, code, grids, split layouts, local grids, canvas positions, rectangles, circles, connectors, and local images remain native, editable Typst objects. Native `typst` and `typstFile()` fragments are placed directly into the generated source.

Inline `$...$` formulas use MiTeX's `mi()` function, while `math()` and equation-like `latex` fragments use `mitex()`. Basic LaTeX text fragments use MiTeX's experimental `mitext()` mode. The generated file imports `@preview/mitex:0.2.7` and can be compiled with:

```bash
typst compile output/typst/slides.typ
```

LaTeX `tabular`, `tabular*`, and `tabularx` fragments are converted to native Typst `table` objects. FrameSeq preserves `l`, `c`, and `r` alignment, fixed-width and expanding columns, common `booktabs` rules, `\multicolumn`, and LaTeX formatting inside cells through `mitext()`. Tables that depend on unsupported structures such as `\multirow`, nested tables, or package-specific commands keep their compiled SVG as a fidelity fallback.

MiTeX is not a complete TeX engine: its text mode supports common document text but does not implement arbitrary packages or every LaTeX environment. CSS and Typst also have different layout models. Tailwind classes, gradients, arrowheads, unsupported LaTeX structures, and other properties without a safe semantic mapping are therefore listed as conversion notes at the top of the `.typ` file.

## Embed Typst inside FrameSeq

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
HTML / PDF / PPTX
```

The current SVG output keeps complex layout visually consistent across the browser and PDF paths without loading a Typst compiler at runtime. Editable PPTX export captures the rendered fragment as a high-resolution image; `--flatten` captures the complete slide.

## Embedded-fragment restrictions

- Tagged templates must be static. JavaScript interpolation is not supported yet.
- `typstFile()` requires a static string path.
- Typst is currently rendered as SVG rather than semantic HTML or MathML.
- FrameSeq themes do not automatically change styles inside a Typst fragment.
- FrameSeq themes style the exported presentation structure, while declarations inside native Typst fragments remain under the fragment author's control.
