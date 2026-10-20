# LaTeX integration

FrameSeq can compile a LaTeX table, a TikZ or PGFPlots picture, an algorithm, or another local body fragment into a normal presentation object. FrameSeq still owns slide structure, layout, themes, navigation, and export; Tectonic owns the fragment's LaTeX typesetting.

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
- `unicode-math`, so math is set in Latin Modern Math

The public API accepts fragments rather than complete documents. Do not include `\documentclass`, `\begin{document}`, or `\end{document}`. Static templates also cannot contain JavaScript interpolation.

To use another package, write its `\usepackage` line in the fragment, as you would at the top of a document. FrameSeq moves each line that starts with `\usepackage` or `\RequirePackage` into the preamble, ahead of its own packages, so options such as `\usepackage[table]{xcolor}` take effect:

```ts
latex`
  \usepackage{algorithm}
  \usepackage{algpseudocode}
  \begin{minipage}{9cm}
  \begin{algorithmic}[1]
  \Procedure{Euclid}{$a,b$}
  \While{$r\neq 0$}
  \State $a \gets b$
  \EndWhile
  \State \Return $b$
  \EndProcedure
  \end{algorithmic}
  \end{minipage}
`.width(700);
```

Tectonic fetches a package the first time a fragment loads it. Other preamble-only commands, such as `\DeclareMathOperator`, are not moved; define a macro with `\newcommand` in the fragment instead.

Use FrameSeq's KaTeX-backed `text` and `math` commands for ordinary formulas. The LaTeX integration is most useful when existing LaTeX source, a package-based table, or a TikZ picture is the object you want to preserve.

## Draw with TikZ

Load TikZ, and any of its libraries, in the fragment:

```ts
latex`
  \usepackage{tikz}
  \usetikzlibrary{arrows.meta,positioning}
  \begin{tikzpicture}[node distance=14mm, every node/.style={draw, rounded corners}]
    \node[fill=blue!10] (in) {Input};
    \node[right=of in, fill=orange!15] (enc) {Encoder};
    \draw[-{Stealth}] (in) -- (enc);
  \end{tikzpicture}
`.width(640);
```

PGFPlots works the same way, with `\usepackage{pgfplots}`. Shadings, patterns, opacity, and arrow tips come through.

## Colour

Colours set with `xcolor`, such as `\textcolor`, `\rowcolor`, `\colorbox`, and TikZ's `fill=`, keep their colour. Black, LaTeX's default, follows the slide's text colour instead, so a fragment reads on a dark theme too. On a dark theme, text on a light fill then turns light as well; give that text a dark colour that is not pure black, such as `\color{gray!20!black}`.

## Build and export behavior

```text
static LaTeX fragment
        ↓ Tectonic during the Vite transform
an XDV page of glyphs, rules, colours, and TikZ drawing
        ↓ FrameSeq draws each glyph from its font's outline
one scalable SVG slide object
```

The browser receives no compiler, no fonts, and makes no package requests. HTML and PDF use the vector result directly. Editable PPTX export preserves the fragment as a high-resolution image, while flattened PPTX captures it with the rest of the slide.

## Current restrictions

- `latex` and `latexFile()` require static source.
- The input is a body fragment, not a complete LaTeX document.
- The build machine needs a platform supported by `node-tectonic` and network access the first time Tectonic fetches a required package.
- LaTeX objects preserve their own TeX font metrics; FrameSeq theme font settings do not replace those fonts.
- Fonts must be OpenType. FrameSeq loads `unicode-math`, so the default text and math fonts are; a package that switches to an old TeX font, such as a Type 1 symbol font, stops the build with an error.
- Images placed with `\includegraphics` are not supported yet; use `image()` beside the fragment instead.
- PowerPoint treats the compiled fragment as one rendered object rather than editable table cells.
