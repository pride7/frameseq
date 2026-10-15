import bibliography from "./poster.bib";

poster({
  title: "Diffusion Language Models",
  subtitle: "Recovering whole sequences from noise, one refinement at a time",
  author: "Ada Lovelace · Alan Turing",
  institute: "Analytical Engine Institute",
  date: "FrameSeq poster example",
  bibliography,
}).grid(3);

at("cell0/introduction").card();
text("Introduction").title();
text(`Autoregressive models write one token at a time ${cite("vaswani2017")}. Diffusion models start from noise and revise every position at every step ${cite("austin2021", "li2022")}.`);
bullets(
  "Parallel decoding: every token per step",
  "Global revision: early words can change",
  "Controllable length and infilling",
);

at("cell0/idea").card();
text("Key idea").title();
at("cell0/idea/points").row().gap(28);
icon("shuffle").size(72);
text("Corrupt text by masking tokens, then learn to restore it step by step.").grow();
at("cell0/idea");
text("The same network denoises at every step, so quality grows with the steps spent.").caption();

at("cell0/why").card();
text("Why it matters").title();
bullets(
  "Editing and infilling come for free",
  "Decoding cost no longer grows with length",
  "One model serves many prompts at once",
);

at("cell1/method").card();
text("Method").title();
text("Each step predicts the clean sequence from its noisy version:");
math`p_\theta(x_{t-1} \mid x_t) = \sum_{x_0} q(x_{t-1} \mid x_t, x_0)\, p_\theta(x_0 \mid x_t)`;
text(`Training minimises a weighted cross-entropy over masked positions${footnote("Weights follow the masking schedule; see the paper for details.")}.`);

at("cell1/setup").card();
text("Setup").title();
table([
  ["Model", "Parameters", "Steps", "Data"],
  ["Autoregressive", "350M", "—", "OpenWebText"],
  ["Diffusion (ours)", "350M", "256", "OpenWebText"],
  ["Diffusion (large)", "1.3B", "256", "OpenWebText"],
]).striped();

at("cell1/takeaways").card();
text("Takeaways").title();
steps(
  "Masking is a simple, effective corruption",
  "Quality rises steadily with refinement steps",
  "Parallel decoding pays off on long outputs",
);

at("cell2/results").card();
text("Results").title();
chart("bar", { Autoregressive: 31, "Diffusion (ours)": 47, "Diffusion (large)": 58 })
  .unit("%")
  .max(100)
  .height(420);
text("Infilling accuracy on held-out passages; illustrative numbers.").caption();
chart("line", {
  labels: ["16", "32", "64", "128", "256"],
  series: { Quality: [22, 34, 43, 49, 52], Speed: [60, 44, 31, 18, 9] },
}).height(380);
text("More steps trade speed for quality; illustrative numbers.").caption();

at("cell2/more").card();
text("Read the paper").title();
at("cell2/more/link").row().gap(32).align("center");
qr("https://pride7.github.io/frameseq/").width(190);
text("Scan for the paper, the code, and this poster's FrameSeq source.").grow();
at("cell2/more");
references();
