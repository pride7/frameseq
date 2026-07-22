# LaTeX integration

FrameSeq can compile a LaTeX table or other local body fragment into a normal presentation object. FrameSeq still owns slide structure, layout, themes, navigation, and export; Tectonic owns the fragment's LaTeX typesetting.

## Install the compiler

LaTeX support is optional:

```bash
npm install --save-dev node-tectonic
```

The package supplies a Tectonic binary for supported desktop and CI platforms. Tectonic downloads required LaTeX files on first use and keeps them in its operating-system cache. Later builds reuse both that package cache and FrameSeq's content-addressed fragment cache.

Because it uses a native build-time compiler, this integration is intended for local development and CI rather than browser-only environments such as the online StackBlitz playground.

## Write an inline table

Use a static tagged template so JavaScript preserves every backslash:

```ts
slide("Experimental results");

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

The result accepts the same modifiers as other content objects, including `.width()`, `.position()`, `.color()`, `.style()`, and `.showAt()`. Its height follows the compiled fragment's aspect ratio.

## Use a separate file

Put only the document-body fragment in the file:

```tex
% tables/results.tex
\begin{tabular}{lrr}
  \toprule
  Model & Accuracy & Latency \\
  \midrule
  Baseline & 91.2\% & 18 ms \\
  FrameSeq & \textbf{94.6\%} & 12 ms \\
  \bottomrule
\end{tabular}
```

Then attach it to the current slide:

```ts
latexFile("./tables/results.tex")
  .width(percent(80));
```

Paths are resolved relative to the `.slides.ts` entry file, must remain inside its directory, and are watched by Vite.

## Available preamble

FrameSeq wraps every fragment in a tightly fitted `standalone` document and loads these common packages:

- `amsmath` and `amssymb`
- `booktabs`
- `array`, `tabularx`, and `multirow`
- `xcolor` and `graphicx`

The public API accepts fragments rather than complete documents. Do not include `\documentclass`, `\begin{document}`, or `\end{document}`. Static templates also cannot contain JavaScript interpolation.

Use FrameSeq's KaTeX-backed `text` and `math` commands for ordinary formulas. The LaTeX integration is most useful when existing `tabular` source or package-based table layout is the object you want to preserve.

## Build and export behavior

```text
static LaTeX fragment
        ↓ Tectonic during the Vite transform
positioned HTML glyphs and rules
        ↓ FrameSeq embeds fonts and wraps the result
one scalable slide object
```

The browser receives no compiler and makes no package requests. HTML and PDF use the embedded result directly. Editable PPTX export preserves the fragment as a high-resolution image, while flattened PPTX captures it with the rest of the slide.

## Current restrictions

- `latex` and `latexFile()` require static source.
- The input is a body fragment, not a complete LaTeX document.
- The build machine needs a platform supported by `node-tectonic` and network access the first time Tectonic fetches a required package.
- LaTeX objects preserve their own TeX font metrics; FrameSeq theme font settings do not replace those fonts.
- PowerPoint treats the compiled fragment as one rendered object rather than editable table cells.
