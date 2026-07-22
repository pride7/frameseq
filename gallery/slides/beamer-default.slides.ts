presentation({
  title: "Beamer Default",
  author: "FrameSeq",
  institute: "Declarative presentations",
  date: "2026",
  theme: "beamer-default",
});

slide("A familiar academic baseline").split("56:44");
text("Classic lecture styling without LaTeX document boilerplate.").lead();
bullets(
  "Simple hierarchy",
  "Research-friendly defaults",
  "HTML, PDF, and PowerPoint output",
);

right();
math`E = mc^2`;
text("LaTeX-compatible math").caption();
