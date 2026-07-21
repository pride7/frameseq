presentation({ title: "FrameSeq", theme: "midnight" });

slide({ name: "Cover" })
  .cover()
  .notes("Welcome the audience and introduce FrameSeq as a UI-style presentation framework.");
text("A UI framework for presentations").eyebrow();
text("Build slides like building apps.").hero();
text("ArkUI-style TypeScript → HTML → PDF").subtitle();
text("One file. Useful defaults. Full control when needed.").author();
text("Tailwind utilities, without configuration.")
  .style("tailwind-smoke text-[31px] font-[750] tracking-[2px] text-[#f97316]");

slide("Write one file")
  .split("38:62")
  .notes("Emphasize that source order replaces nested callbacks and layout boilerplate.");

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

slide("A fixed canvas with time")
  .notes("Reveal the three points one at a time. Pause after each step.");
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

slide("Shapes and connectors")
  .canvas()
  .notes("Explain that nodes are HTML while connectors and arrowheads remain vector SVG.");

line({ x1: 320, y1: 200, x2: 460, y2: 200 })
  .className("shape-line-smoke")
  .stroke("#38bdf8")
  .strokeWidth(4)
  .arrow("end");

line({ x1: 620, y1: 200, x2: 760, y2: 200 })
  .stroke("#38bdf8")
  .strokeWidth(4)
  .arrow("end");

rect("TypeScript")
  .className("shape-rect-smoke")
  .position({ x: 80, y: 145 })
  .width(240)
  .height(110)
  .fill("#172554")
  .stroke("#3b82f6")
  .strokeWidth(3)
  .radius(18);

circle("FrameSeq")
  .className("shape-circle-smoke")
  .position({ x: 460, y: 120 })
  .width(160)
  .fill("#164e63")
  .stroke("#22d3ee")
  .strokeWidth(3);

rect("HTML + PDF")
  .position({ x: 760, y: 145 })
  .width(240)
  .height(110)
  .fill("#14532d")
  .stroke("#22c55e")
  .strokeWidth(3)
  .radius(18);
