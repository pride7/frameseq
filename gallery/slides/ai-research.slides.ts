presentation({
  title: "Adaptive Inference at the Edge",
  subtitle: "A confidence-aware route between local and cloud models",
  author: "Research Systems Group",
  institute: "Illustrative AI-generated example",
  date: "2026",
  theme: "minimal-academic",
  font: {
    family: '"Segoe UI", sans-serif',
    size: 23,
    heading: { family: "Georgia, serif", size: 39, weight: 700 },
    code: { family: '"Cascadia Code", monospace', size: 17 },
  },
});

slide()
  .cover()
  .notes("Introduce this as an illustrative research story generated from a short brief. No measurements on these slides are real benchmark claims.");

slide("Why cloud-only inference stalls")
  .split("40:60")
  .notes("Lead with the user-visible delay. Emphasize that the numbers are illustrative and that the method targets the shape of the tradeoff.");

metric("118 ms", "Illustrative round-trip latency");
text("Network time can dominate a short model call.").caption();

right();
text("A fixed route pays the same cost for every input.").lead();
bullets(
  "Latency changes with congestion",
  "Private inputs leave the device",
  "Easy examples do not need the largest model",
);

slide("A confidence-aware controller")
  .canvas()
  .notes("Follow the arrows from left to right. The controller keeps confident predictions local and escalates uncertain inputs.");

line({ x1: 270, y1: 190, x2: 420, y2: 190 })
  .stroke("#35588a")
  .strokeWidth(4)
  .arrow("end");
line({ x1: 640, y1: 190, x2: 790, y2: 190 })
  .stroke("#35588a")
  .strokeWidth(4)
  .arrow("end");

rect("Input")
  .position({ x: 50, y: 130 })
  .width(220)
  .height(120)
  .fill("#eef3f9")
  .stroke("#35588a")
  .radius(16);

circle("Confidence\ncontroller")
  .position({ x: 420, y: 95 })
  .width(220)
  .fill("#dbe7f4")
  .stroke("#35588a")
  .strokeWidth(3);

rect("Local model\nor cloud model")
  .position({ x: 790, y: 130 })
  .width(250)
  .height(120)
  .fill("#f8ece8")
  .stroke("#a4493d")
  .radius(16);

text("route by uncertainty, not by a fixed rule")
  .position({ x: 330, y: 330 })
  .width(430)
  .textAlign("center")
  .style("rounded-full bg-slate-100 px-6 py-3 text-[20px] font-semibold text-slate-700");

slide("Training objective")
  .split("38:62")
  .notes("Explain the three terms: prediction quality, expected latency, and a calibration penalty for reliable routing.");

text("Optimize accuracy and system cost together.").lead();
bullets(
  "Task loss protects prediction quality",
  "Route cost discourages unnecessary escalation",
  "Calibration keeps confidence meaningful",
);

right();
math`\mathcal{L}=\mathcal{L}_{task}+\lambda\,\mathbb{E}[C(r)]+\beta\,\mathcal{L}_{cal}`
  .size(28);
text`The route $r$ remains local when confidence exceeds a learned threshold.`
  .caption();

slide("Illustrative outcome")
  .grid(3)
  .notes("These values are synthetic. Use them to explain the intended evaluation dimensions, not as evidence of a measured improvement.");

cell(0);
metric("−34%", "Median latency");
text("Compared with a cloud-only route").caption();

cell(1);
metric("72%", "Inputs kept local");
text("At the selected confidence threshold").caption();

cell(2);
metric("−0.6 pt", "Accuracy change");
text("Illustrative tradeoff, not a benchmark").caption();

slide("What the example demonstrates")
  .center()
  .notes("Close by separating the presentation claim from the research claim: FrameSeq can turn a structured brief into readable, editable slides that remain easy to validate.");

text("AI can draft the structure. People keep control of every object.").lead();
steps(
  "Generate a linear, readable first pass",
  "Validate the rendered geometry",
  "Revise the same source and export anywhere",
);
text("All measurements in this example are illustrative.").caption();
