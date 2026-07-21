presentation({ title: "FrameSeq", theme: "midnight" });

slide({ name: "Cover" }).cover();
text("A UI framework for presentations").eyebrow();
text("Build slides like building apps.").hero();
text("ArkUI-style TypeScript → HTML → PDF").subtitle();
text("One file. Useful defaults. Full control when needed.").author();
text("Tailwind utilities, without configuration.")
  .style("tailwind-smoke text-[31px] font-[750] tracking-[2px] text-[#f97316]");

slide("Write one file").split("38:62");

text("Use semantic components for common slides. Layout is expressed with named regions instead of nested UI trees.");
bullets(
  "Useful defaults",
  "No layout boilerplate",
  "Low-level escape hatch",
);

right();
code(`slide("Architecture").split("40:60")

text("The left column")
bullets("Useful defaults", "No boilerplate")

right()
text("Compiler").lead()
bullets("DSL", "HTML", "PDF")`);

slide("A fixed canvas with time");
text("Presentation structure stays shallow. Progressive reveals are expressed as content, not an animation timeline.");
steps(
  "Layout like an app",
  "Reveal as state",
  "Export from HTML",
);

slide("Layouts use named regions").grid(3);

cell(0);
metric("2", "named regions in split()");
cell(1);
metric("3", "cells in this grid()");
cell(2);
metric("0", "Flexbox rules to remember");

slide("LaTeX-compatible equations").center();
text`Math belongs in text too: $E = mc^2$.`.lead();
math`\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}`;
text("Rendered with KaTeX · exported with the rest of the page").caption();

slide("Typst for complex typesetting").center();
text("FrameSeq owns the slide; Typst owns the fragment.").lead();
typst`
  #set text(size: 15pt, fill: rgb("#67e8f9"))
  $ integral_0^1 x^2 dif x = 1/3 $
`
  .className("typst-inline-smoke")
  .width(420);
typstFile("./tests/typst-fragment.typ")
  .className("typst-file-smoke")
  .width(460);
