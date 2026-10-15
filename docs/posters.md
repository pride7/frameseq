# Posters and print

A poster is a presentation made for paper: one page, laid out with the same commands as a slide, and printed at the size of the sheet.

```ts
poster({
  title: "Diffusion Language Models",
  subtitle: "From iterative recovery to continuous state spaces",
  author: "Ada Lovelace · Alan Turing",
  institute: "University of Cambridge",
  date: "NeurIPS 2026",
}).grid(3);

at("cell0/introduction").card();
text("Introduction").title();
text("Autoregressive models write one token at a time…");

at("cell1/method").card();
text("Method").title();
math`p_\theta(x_{t-1} \mid x_t)`;

at("cell2/results").card();
text("Results").title();
chart("bar", { Baseline: 31, Ours: 74 }).unit("%");
qr("https://example.com/paper").width(220);
```

The [live poster example](https://pride7.github.io/frameseq/examples/poster/) is built from [`gallery/slides/poster.slides.ts`](https://github.com/pride7/frameseq/blob/main/gallery/slides/poster.slides.ts), with tables, charts, a QR code, and citations from a BibTeX file.

`poster()` starts an A0 portrait presentation in the `poster` theme and begins its one page, so the call can go straight on to the page's layout. Its options are those of `presentation()`, so `size`, `orientation`, and `theme` change any of the three.

## Paper sizes

Any presentation can be made for paper with `size`:

```ts
presentation({ title: "Handout", size: "A4" });
presentation({ title: "Conference poster", size: "36x48in" });
presentation({ title: "Wall chart", size: "A1", orientation: "landscape" });
```

The named sizes are `"A0"` to `"A5"`, `"letter"`, `"legal"`, and `"tabloid"`; others are written as width by height with a unit, `"mm"`, `"cm"`, or `"in"`. A named sheet stands upright unless `orientation: "landscape"` turns it, and a written size stands as written.

## Canvas units and printed sizes

The canvas keeps units of its own: 1600 across the paper's short side, the long side following the paper, so an A0 sheet is 1600 × 2262. Numbers in `.position()`, `.width()`, and `.size()` are these units, and so are the theme's type and spacing, which is why a poster laid out with the commands of a slide also looks right. `width` or `height` in the options gives the canvas more or fewer units.

For a measurement on the printed sheet, use `mm()` and `pt()`:

```ts
image(logo).width(mm(60));          // 60 mm wide on the sheet
text("Contact").size(pt(28));       // 28 pt type on the sheet
line().strokeWidth(mm(1.5));
```

They convert to canvas units at the paper's scale, wherever they appear, including `calc()` expressions, `presentation({ font })`, and a theme's spacing. On a presentation for the screen, `pt()` and `mm()` keep CSS's meaning.

## The poster theme

The `poster` theme opens the page with a band holding the title, subtitle, authors, institute, and date, all taken from the presentation's options. Under it, the grid's cells are columns without a surface of their own, and each `card()` region is a block with an accent rule across its top; `.title()` text heads a block like a section of a paper.

The band comes from the theme option `chrome.header`, so a theme of your own can have one:

```ts
const lab = defineTheme({
  name: "lab-poster",
  extends: "poster",
  colors: { accent: "#0f766e" },
  chrome: { headerBackground: "#134e4a", headerForeground: "#f0fdfa" },
});

poster({ title: "…", theme: lab }).grid(4);
```

## Checking a poster

`frameseq check` measures a poster as it measures slides, and judges type by its printed size. The smallest readable type grows with the canvas: 14 units on a 1280-wide slide, and the same share of a poster's short side, which on an A0 sheet is about 21 pt. A finding on paper gives both sizes:

```text
WARNING Slide 1 "Poster" [font-too-small]
  Font size 10px (15pt printed) is below the recommended 14px (21pt printed) minimum.
```

## Printing

Every export prints the page at the paper's size:

- `frameseq pdf` makes a PDF of the sheet, 841 × 1189 mm for A0, still vector throughout, so a print shop can use it as it is.
- `frameseq pptx` makes a PowerPoint slide of that size, with editable text, tables, and charts.
- `frameseq typst` writes a Typst page of that size.

A poster is a single page, so the presentation's other features, presenter view and reveal steps among them, simply have nothing to do. A presentation made for paper may still have several pages, such as a set of handouts, each begun with `slide()`.
