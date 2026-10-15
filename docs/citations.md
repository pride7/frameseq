# Citations and references

Give the presentation a bibliography, cite works where the text mentions them, and FrameSeq numbers the citations, lists the works each slide cites at its foot, and builds the reference list.

```ts
import bibliography from "./references.bib";

presentation({ title: "Diffusion Language Models", bibliography });

slide("Background");
text(`Attention replaced recurrence ${cite("vaswani2017")}.`);

slide("References");
references();
```

## The bibliography

Import a BibTeX file, as a reference manager such as Zotero, Mendeley, or JabRef exports it:

```ts
import bibliography from "./references.bib";
```

FrameSeq reads the entries at build time: `@string` abbreviations, braced and quoted values, and LaTeX accents such as `{\"o}` become plain text. A saved change to the file updates the preview.

Name the import `bibliography`, not `references`: that would hide the `references()` command.

A presentation without a BibTeX file can write its works out instead, by key:

```ts
presentation({
  title: "Literate slides",
  bibliography: {
    knuth1984: "Knuth, D. E. (1984). Literate programming. The Computer Journal, 27(2).",
    vaswani2017: {
      author: "Vaswani, Ashish and Shazeer, Noam",
      title: "Attention Is All You Need",
      booktitle: "NeurIPS",
      year: "2017",
    },
  },
});
```

A string is used as the reference exactly as written. An object uses BibTeX's field names, and is formatted like a `.bib` entry.

## Citing

`cite(...keys)` returns the marker to write into the text:

```ts
text(`Attention replaced recurrence ${cite("vaswani2017")}.`);
bullets(`Earlier work ${cite("bahdanau2015", "graves2013")}`, "Our approach");
```

Works are numbered in the order they are first cited, across the whole presentation: `[1]`, then `[2, 3]`, and a work cited again keeps its number. Because the marker is ordinary text, it works anywhere text does, in `text()`, `bullets()`, `card()`, table cells, and shape labels. Use a template string, with backticks, to place it inside a sentence.

A key that is not in the bibliography stops the document with an error that names the line, and suggests the closest key when one is near.

## The foot of each slide

Each slide lists the works it cites below its content, in the order it cites them:

```text
[1] Vaswani, A., Shazeer, N., Parmar, N., & Uszkoreit, J. (2017). Attention Is All You Need. In NeurIPS.
```

The list takes its room from the slide like any other object, so content above it shrinks rather than sliding underneath, and the layout check sees both. To cite without the per-slide list:

```ts
presentation({ bibliography, citations: { footnotes: false } });
```

## Footnotes

`footnote(text)` adds a note to the foot of the slide and returns its marker, a superscript number:

```ts
text(`Measured on one GPU${footnote("An NVIDIA A100 with batch size 32.")}.`);
```

Footnotes are numbered from ¹ on each slide and share the foot with the slide's cited works.

## The reference list

`references()` adds every cited work, numbered as `cite()` numbered it:

```ts
slide("References");
references();
```

It is filled once the whole document has run, so it lists citations made after it as well. `references({ all: true })` adds the works the bibliography holds but the talk never cited, after the cited ones. A long list can be shrunk to its slide with [`.fit()`](content.md#fit-text-to-its-room):

```ts
references().fit();
```

## Author and year

For citations written as names and years instead of numbers:

```ts
presentation({ bibliography, citations: { style: "author-year" } });

text(`Attention replaced recurrence ${cite("vaswani2017")}.`);
// Attention replaced recurrence (Vaswani et al., 2017).
```

The reference list is then sorted alphabetically. A work given as a plain string has no author to show, so it keeps its number.

## In exports

Markers, footnotes, and reference lists are text, so PDF, PowerPoint, and Typst carry them as they appear in the browser, and PowerPoint keeps them editable.
