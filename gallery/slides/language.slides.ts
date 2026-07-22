presentation({
  title: "A clear argument",
  theme: "paper",
});

slide("A clear argument").split("42:58");
text("42%")
  .hero()
  .color("#b45309");
text("faster to revise").lead();
bullets(
  "Linear source order",
  "Named layout regions",
  "Controllable objects",
);

right();
text("One source, three destinations").eyebrow();
text("FrameSeq keeps the idea editable from first draft to final delivery.").lead();
code(`npm run build
npm run pdf
npm run pptx`, "sh");
