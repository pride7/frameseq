presentation({ title: "Inspectable talk" });

slide().cover().notes("Welcome.");
text("A cover").hero();
text("A subtitle").subtitle();

slide({ name: "Precise", title: "Exact placement" }).canvas();
at("diagram").canvas().position({ x: 20, y: 30 }).width(800).height(500);
text("Pinned").position({ x: 80, y: 120 });
note("Point at the pinned object.");
rect("Box").position({ x: 400, y: 200 });
at("diagram");

slide("Results").grid(2);
cell(0);
metric("94%", "Accuracy");
cell(1);
latexFile("./results.tex").width(640);

