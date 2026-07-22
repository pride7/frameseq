presentation({
  title: "Local grid fixture",
  theme: "paper",
});

slide("A grid inside the normal flow");
text("Content above the local grid remains in the standard vertical flow.");

gridSection(
  3,
  card("Declarative", "Create objects, then control their properties."),
  card("Portable", "Export HTML, PDF, and editable PPTX."),
  group(
    text("AI-friendly").bold(),
    text("Straightforward to generate and revise."),
  ).card(),
).gap(20);

text("Content below the local grid continues naturally.");
