presentation({
  title: "Typst export fixture",
  subtitle: "FrameSeq structure, native Typst output",
  author: "FrameSeq",
  theme: "minimal-academic",
});

slide().cover().notes("Automatic title page and speaker note fixture.");

slide("Math and layout").split("40:60");
text`Inline formula: $E = mc^2$.`.lead();
math`\int_0^\infty e^{-x}\,dx = 1`;

right();
typst`#table(columns: 2, [A], [B], [C], [D])`.width(420);
text("A custom class becomes a conversion note.")
  .style("text-blue-600");

slide("LaTeX becomes native Typst").center();
latex`
  \begin{tabular}{lrr}
    \toprule
    Model & Accuracy & Latency \\
    \midrule
    Baseline & 91.2\% & 18 ms \\
    FrameSeq & \textbf{94.6\%} & 12 ms \\
    \multicolumn{3}{c}{Editable native cells} \\
    \bottomrule
  \end{tabular}
`.width(720);

slide("Canvas").canvas();
rect("Input")
  .position({ x: 80, y: 100 })
  .width(240)
  .height(120)
  .fill("#dbeafe")
  .stroke("#2563eb")
  .strokeWidth(3);
circle("Output")
  .position({ x: 760, y: 100 })
  .width(140)
  .height(140)
  .fill("#dcfce7")
  .stroke("#16a34a");
line({ x1: 320, y1: 160, x2: 760, y2: 170 })
  .stroke("#475569")
  .strokeWidth(4)
  .arrow();
