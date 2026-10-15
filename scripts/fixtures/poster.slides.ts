poster({
  title: "Poster fixture",
  subtitle: "Printed at the paper's size",
  author: "Ada Lovelace",
  institute: "Analytical Engines",
}).grid(2);

at("cell0/intro").card();
text("Introduction").title();
text("A poster is a presentation made for paper, laid out like a slide.");
rect("100 mm").as("ruler").width(mm(100)).height(mm(20));

at("cell1/notes").card();
text("Notes").title();
text("Printed 12 pt is too small for an A0 sheet.").size(pt(12));
