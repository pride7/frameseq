presentation({
  title: "Minimal Academic Theme",
  subtitle: "A restrained presentation style",
  author: "Ada Lovelace",
  institute: "Analytical Engine Institute",
  date: "2026",
  theme: "minimal-academic",
  font: {
    family: '"Segoe UI", sans-serif',
    size: 24,
    weight: 450,
    lineHeight: 1.6,
    heading: {
      family: "Georgia, serif",
      size: 40,
      weight: 700,
      lineHeight: 1.2,
    },
    code: {
      family: "Consolas, monospace",
      size: 17,
      weight: 500,
      lineHeight: 1.4,
    },
  },
});

slide().cover();

slide("Design principles");
text("A restrained academic theme keeps the structure visible and the decoration quiet.");
bullets(
  "Blue structure and frame titles",
  "A minimal title-and-number footline",
  "A single red alert accent",
);
code("const theme = 'minimal-academic';", "ts");
text("This line uses a local override")
  .size(30)
  .weight(800)
  .className("font-override");

slide().cover();
text("A manually authored cover").hero();
