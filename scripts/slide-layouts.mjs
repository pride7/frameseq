/**
 * What a new slide can start as. Each layout is one of the recipes in the documentation, with
 * placeholders in English or Chinese, and passes the layout check as it is inserted. The Studio
 * draws and names them; this module only writes them, so they can be tested without a page.
 */

const q = (value) => JSON.stringify(value);
const list = (items) => items.map((item) => `  ${q(item)},`).join("\n");
/** Names for the flow's boxes, far enough apart that the layout check never takes one for a typo. */
const flowNames = ["input", "process", "output"];

const words = {
  en: {
    title: "New slide",
    text: "Your point here.",
    lead: "One sentence that states the point.",
    points: ["First point", "Second point", "Third point"],
    eyebrow: "Part 2",
    section: "Section title",
    sectionSubtitle: "What this part covers",
    left: "One side",
    right: "The other side",
    metricsLead: "Three numbers sum it up.",
    metrics: [["12", "First measure"], ["34%", "Second measure"], ["5.6×", "Third measure"]],
    codeLead: "What the code does, in one sentence.",
    codePoints: ["What to notice first", "What to notice next"],
    formulaLead: "Say what the formula means before showing it.",
    formulaNote: "Read each symbol aloud once.",
    table: [["Item", "Before", "After"], ["First", "12", "18"], ["Second", "7", "9"]],
    tableNote: "Where the numbers come from.",
    chartNote: "What the chart shows, in one sentence.",
    flow: ["Input", "Process", "Output"],
    steps: ["First, the setup", "Then, the change", "Finally, the result"],
    closing: "End on the one sentence you want remembered.",
    contact: "Your name · you@example.com",
  },
  zh: {
    title: "新的一页",
    text: "在这里写下要点。",
    lead: "用一句话说出这一页的观点。",
    points: ["第一点", "第二点", "第三点"],
    eyebrow: "第二部分",
    section: "章节标题",
    sectionSubtitle: "这一部分讲什么",
    left: "一方面",
    right: "另一方面",
    metricsLead: "三个数字概括全部。",
    metrics: [["12", "第一项指标"], ["34%", "第二项指标"], ["5.6×", "第三项指标"]],
    codeLead: "用一句话说明这段代码做什么。",
    codePoints: ["先注意什么", "再注意什么"],
    formulaLead: "先说公式的含义，再展示公式。",
    formulaNote: "每个符号读一遍。",
    table: [["项目", "之前", "之后"], ["第一项", "12", "18"], ["第二项", "7", "9"]],
    tableNote: "说明数字的来源。",
    chartNote: "用一句话说明图表显示了什么。",
    flow: ["输入", "处理", "输出"],
    steps: ["首先，背景", "然后，变化", "最后，结果"],
    closing: "用一句你最想让人记住的话收尾。",
    contact: "你的名字 · you@example.com",
  },
};

/**
 * Every layout, in the order the Studio offers them, as the lines it inserts and the
 * placeholder it selects afterwards, so typing replaces it.
 */
export function slideLayoutSources(language = "en") {
  const w = words[language] ?? words.en;
  const titled = (rest, modifier = "") => `slide(${q(w.title)})${modifier};\n${rest}`;
  return [
    { id: "title-text", select: w.title, source: titled(`text(${q(w.text)});\n`) },
    { id: "bullets", select: w.title, source: titled(`text(${q(w.lead)}).lead();\nbullets(\n${list(w.points)}\n);\n`) },
    {
      id: "section",
      select: w.section,
      source: `slide({ name: "Section" }).cover();\ntext(${q(w.eyebrow)}).eyebrow();\ntext(${q(w.section)}).hero();\ntext(${q(w.sectionSubtitle)}).subtitle();\n`,
    },
    {
      id: "two-columns",
      select: w.title,
      source: titled(`text(${q(w.left)}).lead();\nbullets(\n${list(w.points)}\n);\n\nright();\ntext(${q(w.right)}).lead();\nbullets(\n${list(w.points)}\n);\n`, '.split("50:50")'),
    },
    {
      id: "metrics",
      select: w.title,
      source: titled(`text(${q(w.metricsLead)});\ngridSection(\n  3,\n${w.metrics.map(([value, label]) => `  metric(${q(value)}, ${q(label)}),`).join("\n")}\n).gap(20);\n`),
    },
    {
      id: "code",
      select: w.title,
      source: titled(`code(\`const answer = compute(input);\nconsole.log(answer);\`, "ts");\n\nright();\ntext(${q(w.codeLead)}).lead();\nbullets(\n${list(w.codePoints)}\n);\n`, '.split("52:48")'),
    },
    {
      id: "formula",
      select: w.title,
      source: titled(`text(${q(w.formulaLead)}).lead();\nmath\`E = mc^2\`;\ntext(${q(w.formulaNote)}).caption();\n`, ".center()"),
    },
    {
      id: "table",
      select: w.title,
      source: titled(`table([\n${w.table.map((row) => `  [${row.map(q).join(", ")}],`).join("\n")}\n]);\ntext(${q(w.tableNote)}).caption();\n`),
    },
    {
      id: "chart",
      select: w.title,
      source: titled(`chart("bar", { Q1: 12, Q2: 18, Q3: 25, Q4: 31 }).height(400);\ntext(${q(w.chartNote)}).caption();\n`),
    },
    {
      id: "flow",
      select: w.title,
      source: titled([
        "",
        'at("flow").row().gap(90).anchor("center");',
        ...w.flow.map((label, index) => `rect(${q(label)}).as(${q(flowNames[index])}).width(200).height(110);`),
        "",
        'line().from("input").to("process").arrow("end");',
        'line().from("process").to("output").arrow("end");',
        "",
      ].join("\n"), ".canvas()"),
    },
    { id: "steps", select: w.title, source: titled(`steps(\n${list(w.steps)}\n);\n`) },
    {
      id: "closing",
      select: w.closing,
      source: `slide({ name: "Close" }).center();\ntext(${q(w.closing)}).quote();\ntext(${q(w.contact)}).caption();\n`,
    },
  ];
}
