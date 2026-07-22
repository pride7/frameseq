presentation({ title: "Inspectable talk" });

slide().cover().notes("Welcome.");
text("A cover").hero();
text("A subtitle").subtitle();

slide({ name: "Precise", title: "Exact placement" }).canvas();
text("Pinned").position({ x: 80, y: 120 });
rect("Box").position({ x: 400, y: 200 });

slide("Results").grid(2);
cell(0);
metric("94%", "Accuracy");
cell(1);
latexFile("./results.tex").width(640);

