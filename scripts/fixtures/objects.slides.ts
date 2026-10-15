import bibliography from "./references.bib";

presentation({ title: "Objects fixture", bibliography });

slide("Results").split();
table([
  ["Model", "Accuracy", "Latency"],
  ["Baseline", "91.2%", "18 ms"],
  ["FrameSeq", "94.6%", "12 ms"],
]).as("results");
right();
chart("bar", { Q1: 12, Q2: 18, Q3: 25 }).unit("%").as("growth");

slide("Mix").grid(3);
cell(0);
chart("line", { labels: ["Jan", "Feb", "Mar"], series: { Revenue: [3, 5, 4], Cost: [2, 2, 3] } });
cell(1);
chart("donut", { Search: 52, Direct: 31, Social: 17 });
cell(2);
icon("rocket").size(64).as("rocket");
qr("https://pride7.github.io/frameseq/").width(180).as("code");

slide("Cited");
text(`Attention replaced recurrence ${cite("vaswani2017")}, and proofs met their limits ${cite("goedel1931", "vaswani2017")}${footnote("Two works, one footnote.")}.`);

slide("Fitted");
text("A long paragraph that cannot fit at its own size, so fit() shrinks it until it does. ".repeat(24)).fit().as("long");

slide("References");
references();
