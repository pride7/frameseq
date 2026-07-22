presentation({
  title: "Cambridge US",
  author: "FrameSeq",
  institute: "Declarative presentations",
  date: "2026",
  theme: "beamer-cambridge-us",
});

slide("A classic lecture with warmer contrast").split("56:44");
text("Beamer-inspired chrome, metadata, and automatic numbering.").lead();
bullets(
  "Strong burgundy title bar",
  "Warm academic palette",
  "No change to the document model",
);

right();
code(`slide("Results")
text("One clear claim")
  .lead()`, "ts");
