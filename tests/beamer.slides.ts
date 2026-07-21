presentation({
  title: "Computing Machinery",
  author: "Ada Lovelace",
  institute: "Analytical Engine Institute",
  date: "2026",
  theme: "beamer-madrid",
});

slide().cover();
text("Computing Machinery").hero();
text("A Beamer-inspired FrameSeq theme").subtitle();
text("Ada Lovelace").author();

slide("Architecture");
text("The theme adds presentation chrome without changing the document model.");
bullets(
  "A generated frame title",
  "Author and institute metadata",
  "Automatic slide numbering",
);
