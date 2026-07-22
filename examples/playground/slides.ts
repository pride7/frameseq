presentation({
  title: "FrameSeq Playground",
  subtitle: "Edit this file and watch the presentation update",
  author: "Your name",
  theme: "midnight",
});

slide()
  .cover()
  .notes("Welcome to the FrameSeq online playground. Change any text and save the file.");

slide("Create an object, then control it").split("42:58");

text("Readable source").hero();
text("Everything stays in one linear TypeScript document.").lead();

right();
code(`text("A controllable object")
  .size(32)
  .bold()
  .color("#38bdf8");`, "ts");

slide("Layouts use presentation concepts").grid(3);

cell(0);
metric("1 file", "To edit");

cell(1);
metric("7", "Built-in themes");

cell(2);
metric("3", "HTML · PDF · PPTX");

slide("Math belongs in the document").center();
text`Inline math works too: $E = mc^2$.`.lead();
math`\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}`;
text("Try changing the equation, theme, or layout.").caption();
