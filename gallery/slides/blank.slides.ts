presentation({
  title: "Blank",
  author: "FrameSeq",
  theme: "blank",
});

slide("Start from a clean canvas").split("56:44");
text("A neutral foundation with no visual assumptions.").lead();
bullets(
  "Clear document structure",
  "Controllable content objects",
  "Your typography and color system",
);

right();
code(`text("Your idea")
  .size(30)
  .color("#2563eb")`, "ts");
