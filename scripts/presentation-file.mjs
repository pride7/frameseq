/**
 * What a new presentation is called on disk and what it starts with. The Studio's page names
 * the file as the title is typed, and the server writes it, so both read the same rules.
 */

/**
 * A presentation's own file extension. The text is TypeScript, as in a `.slides.ts` file, which
 * FrameSeq goes on reading; a file of its own can open in FrameSeq when it is double-clicked.
 */
export const presentationExtension = ".fsq";

/** Whether a file can be opened as a presentation: an .fsq file, or TypeScript such as talk.slides.ts. */
export function isPresentationFile(path) {
  return /\.(?:fsq|ts)$/i.test(String(path));
}

/** A presentation's file name without its extension: "talk" for talk.fsq and talk.slides.ts alike. */
export function presentationStem(name) {
  return String(name).replace(/\.slides\.ts$|\.fsq$|\.ts$/i, "");
}

/** The file a presentation titled `title` is saved as: its words, lowercased, joined by hyphens. */
export function presentationFileName(title) {
  const stem = String(title)
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  // Windows reserves these names for devices, whatever the extension.
  const safe = /^(?:con|prn|aux|nul|com\d|lpt\d)$/.test(stem) ? `${stem}-slides` : stem;
  return `${safe || "presentation"}${presentationExtension}`;
}

const starterWords = {
  en: {
    name: "My Talk",
    heading: "Presentation title",
    subtitle: "A short description",
    author: "Your name",
    slide: "First idea",
    notes: "Introduce the main idea and pause before the supporting points.",
    lead: "Explain the idea in one clear sentence.",
    points: ["First point", "Second point", "Third point"],
  },
  zh: {
    name: "我的演讲",
    heading: "演示标题",
    subtitle: "一句简短的介绍",
    author: "你的名字",
    slide: "第一个想法",
    notes: "先讲清主要观点，停顿一下，再讲支持它的要点。",
    lead: "用一句话把这个想法讲清楚。",
    points: ["第一点", "第二点", "第三点"],
  },
};

/**
 * A cover and a first slide, with placeholders in English or, for a Studio shown in Chinese, in
 * Chinese. Without a title, the placeholders `frameseq new` has always written.
 */
export function starterDeck(title, language = "en") {
  const words = starterWords[language] ?? starterWords.en;
  const name = title?.trim() || words.name;
  const heading = title?.trim() || words.heading;
  return `presentation(${JSON.stringify(name)});

slide({ name: "Cover" }).cover();
text(${JSON.stringify(heading)}).hero();
text(${JSON.stringify(words.subtitle)}).subtitle();
text(${JSON.stringify(words.author)}).author();

slide(${JSON.stringify(words.slide)})
  .notes(${JSON.stringify(words.notes)});
text(${JSON.stringify(words.lead)});
bullets(
${words.points.map((point) => `  ${JSON.stringify(point)},`).join("\n")}
);
`;
}

const q = (value) => JSON.stringify(value);
const lines = (items) => items.map((item) => `  ${q(item)},`).join("\n");
const table = (rows) => `table([\n${rows.map((row) => `  [${row.map(q).join(", ")}],`).join("\n")}\n])`;
/** A value as source text, spaced the way a person would write it. */
const literal = (value) => {
  if (Array.isArray(value)) return `[${value.map(literal).join(", ")}]`;
  if (value && typeof value === "object") {
    return `{ ${Object.entries(value)
      .map(([key, item]) => `${/^[A-Za-z_$][\w$]*$/.test(key) ? key : q(key)}: ${literal(item)}`)
      .join(", ")} }`;
  }
  return q(value);
};
const year = () => String(new Date().getFullYear());

/** The formulas the templates show, for tagged templates, which keep their backslashes. */
const formulas = {
  objective: String.raw`\min_{\theta}\; \mathbb{E}_{(x, y)}\big[\ell(f_\theta(x), y)\big]`,
  taylor: String.raw`f(x) = \sum_{n=0}^{\infty} \frac{f^{(n)}(a)}{n!}\,(x - a)^n`,
  model: String.raw`p_\theta(y \mid x) = \operatorname{softmax}\big(W\,h_\theta(x)\big)`,
};

const templateWords = {
  en: {
    name: "Your name",
    institute: "Your institution",
    midnight: {
      eyebrow: "Product update",
      heading: "Presentation title",
      subtitle: "What we built, how it works, and what comes next",
      author: "Your name · Team",
      problem: "The problem",
      problemLead: "State the problem in one sentence your audience already feels.",
      problemPoints: ["Who has the problem", "What it costs them today", "Why now is the time to fix it"],
      design: "How it works",
      code: "const result = await check(input);\nif (result.ok) publish(result);\nelse report(result.problems);",
      designLead: "One idea carries the design.",
      designPoints: ["Every input is checked once", "Only sound results are published", "Problems stay visible"],
      results: "Results",
      resultsLead: "Three numbers sum up the first month.",
      metrics: [["3×", "Faster builds"], ["98%", "Checks passing"], ["12", "Teams on board"]],
      resultsNote: "Replace these with your own measurements.",
      close: "End on the one sentence you want remembered.",
      contact: "Your name · you@example.com",
    },
    paper: {
      eyebrow: "An essay in slides",
      heading: "Presentation title",
      subtitle: "A story told in a few quiet pages",
      opening: "Where the story begins",
      openingLead: "Open with a scene, not a summary.",
      openingPoints: ["A place", "A person", "A question they could not answer"],
      quote: "Put a line worth quoting here.",
      quoteSource: "Who said it",
      turns: "Three turns",
      steps: ["What everyone believed", "What changed their mind", "What we know now"],
      close: "Leave the room with one thought.",
    },
    academic: {
      title: "Presentation title",
      subtitle: "A short subtitle",
      motivation: "Motivation",
      motivationLead: "State the gap your work fills in one sentence.",
      motivationPoints: ["What is known", "What is missing", "What this talk contributes"],
      method: "Method",
      methodLead: "Say what the model minimises before showing how.",
      methodNote: "Name each symbol once, then read the formula aloud.",
      results: "Results",
      table: [["Method", "Accuracy", "Latency"], ["Baseline", "91.2%", "18 ms"], ["Ours", "94.6%", "12 ms"]],
      resultsNote: "Illustrative numbers; replace them with yours.",
      conclusion: "Conclusion",
      conclusionPoints: ["The main finding, stated as a claim", "Where it stops holding", "The next question"],
    },
    beamer: {
      title: "Presentation title",
      subtitle: "A lecture in four parts",
      outline: "Outline",
      outlinePoints: ["Motivation", "A definition", "A worked example", "Summary"],
      definition: "Definition",
      definitionLead: "A Taylor series writes a smooth function as a sum of powers.",
      definitionNote: "Name every symbol the first time it appears.",
      example: "A worked example",
      exampleLead: "Approximate e by expanding eˣ around 0.",
      examplePoints: ["Each term adds one power of x", "The error shrinks quickly", "Four terms come within 0.06"],
      table: [["Terms", "Value", "Error"], ["1", "1", "1.718"], ["2", "2", "0.718"], ["3", "2.5", "0.218"], ["4", "2.667", "0.052"]],
      summary: "Summary",
      summaryPoints: ["The key idea in one line", "Where it applies", "What to read next"],
    },
    poster: {
      title: "Poster title",
      subtitle: "One sentence that says what you found",
      author: "Your name · Co-author",
      event: "Conference name",
      introduction: "Introduction",
      introductionText: "Set out the problem and why it matters in two or three sentences.",
      introductionPoints: ["The question", "Why it is hard", "What you did"],
      idea: "Key idea",
      ideaText: "Write the one idea a passer-by should take away.",
      ideaNote: "Keep it short enough to read from two metres away.",
      contributions: "Contributions",
      contributionPoints: ["A new way to frame the problem", "A method that scales with the data", "Experiments that show where it helps"],
      method: "Method",
      methodText: "Summarise the method; one equation is usually enough.",
      methodNote: "Say in words what each part of the equation does.",
      setup: "Setup",
      table: [["Model", "Parameters", "Data"], ["Baseline", "350M", "Dataset A"], ["Ours", "350M", "Dataset A"]],
      analysis: "Analysis",
      analysisChart: { labels: ["1", "2", "4", "8", "16"], series: { Ours: [22, 34, 43, 49, 52], Baseline: [20, 26, 29, 31, 32] } },
      analysisNote: "Quality as the budget grows; illustrative numbers.",
      results: "Results",
      chart: { Baseline: 31, Ours: 47, "Ours (large)": 58 },
      resultsNote: "Illustrative numbers; replace them with yours.",
      conclusion: "Conclusion",
      conclusionPoints: ["The main finding", "Its limits", "What comes next"],
      more: "Read more",
      references: "References",
      referenceList: ["[1] Author, A. Title of the first paper. Venue, 2024.", "[2] Author, B. Title of the second paper. Venue, 2025."],
      link: "Scan for the paper and the code.",
    },
  },
  zh: {
    name: "你的名字",
    institute: "你的单位",
    midnight: {
      eyebrow: "产品进展",
      heading: "演示标题",
      subtitle: "我们做了什么，它如何工作，接下来做什么",
      author: "你的名字 · 团队",
      problem: "问题",
      problemLead: "用一句听众感同身受的话说出问题。",
      problemPoints: ["谁遇到了这个问题", "它现在让人付出什么代价", "为什么现在该解决它"],
      design: "它如何工作",
      code: "const result = await check(input);\nif (result.ok) publish(result);\nelse report(result.problems);",
      designLead: "整个设计靠一个想法撑起来。",
      designPoints: ["每个输入只检查一次", "结果可靠才发布", "问题始终看得见"],
      results: "结果",
      resultsLead: "三个数字概括第一个月。",
      metrics: [["3×", "构建更快"], ["98%", "检查通过"], ["12", "个团队在用"]],
      resultsNote: "换成你自己的测量结果。",
      close: "用一句你最想让人记住的话收尾。",
      contact: "你的名字 · you@example.com",
    },
    paper: {
      eyebrow: "用幻灯片写的随笔",
      heading: "演示标题",
      subtitle: "用几页安静的纸讲一个故事",
      opening: "故事从这里开始",
      openingLead: "从一个场景开始，而不是一段概述。",
      openingPoints: ["一个地方", "一个人", "一个他们答不上来的问题"],
      quote: "放一句值得引用的话。",
      quoteSource: "出处",
      turns: "三次转折",
      steps: ["大家原本相信什么", "什么让他们改变了想法", "我们现在知道什么"],
      close: "让听众带走一个念头。",
    },
    academic: {
      title: "演示标题",
      subtitle: "一句简短的副标题",
      motivation: "研究动机",
      motivationLead: "用一句话说明你的工作填补了什么空白。",
      motivationPoints: ["已知什么", "还缺什么", "这次报告的贡献"],
      method: "方法",
      methodLead: "先说模型要最小化什么，再说怎么做。",
      methodNote: "每个符号说明一次，再把公式读出来。",
      results: "结果",
      table: [["方法", "准确率", "延迟"], ["基线", "91.2%", "18 ms"], ["本文方法", "94.6%", "12 ms"]],
      resultsNote: "示意数据，请换成你的结果。",
      conclusion: "结论",
      conclusionPoints: ["主要发现，用一个论断说出来", "它在哪里不再成立", "下一个问题"],
    },
    beamer: {
      title: "演示标题",
      subtitle: "分四部分的一堂课",
      outline: "提纲",
      outlinePoints: ["动机", "一个定义", "一个算例", "小结"],
      definition: "定义",
      definitionLead: "泰勒级数把光滑函数写成幂的和。",
      definitionNote: "每个符号第一次出现时都说明它的含义。",
      example: "一个算例",
      exampleLead: "在 0 处展开 eˣ，近似计算 e。",
      examplePoints: ["每一项多一个 x 的幂", "误差下降得很快", "四项以内误差小于 0.06"],
      table: [["项数", "近似值", "误差"], ["1", "1", "1.718"], ["2", "2", "0.718"], ["3", "2.5", "0.218"], ["4", "2.667", "0.052"]],
      summary: "小结",
      summaryPoints: ["一句话说出核心想法", "它适用于哪里", "接下来读什么"],
    },
    poster: {
      title: "海报标题",
      subtitle: "用一句话说出你的发现",
      author: "你的名字 · 合作者",
      event: "会议名称",
      introduction: "引言",
      introductionText: "用两三句话说明问题是什么、为什么重要。",
      introductionPoints: ["研究问题", "难在哪里", "你做了什么"],
      idea: "核心想法",
      ideaText: "写下路过的人应该记住的那个想法。",
      ideaNote: "短到站在两米外也能读完。",
      contributions: "贡献",
      contributionPoints: ["看待这个问题的新角度", "随数据规模扩展的方法", "说明它在哪里有效的实验"],
      method: "方法",
      methodText: "概括你的方法，通常一个公式就够了。",
      methodNote: "用文字说明公式每一部分的作用。",
      setup: "实验设置",
      table: [["模型", "参数量", "数据"], ["基线", "350M", "数据集 A"], ["本文方法", "350M", "数据集 A"]],
      analysis: "分析",
      analysisChart: { labels: ["1", "2", "4", "8", "16"], series: { 本文方法: [22, 34, 43, 49, 52], 基线: [20, 26, 29, 31, 32] } },
      analysisNote: "预算增加时的质量变化；示意数据。",
      results: "结果",
      chart: { 基线: 31, 本文方法: 47, "本文方法（大）": 58 },
      resultsNote: "示意数据，请换成你的结果。",
      conclusion: "结论",
      conclusionPoints: ["主要发现", "局限", "下一步"],
      more: "延伸阅读",
      references: "参考文献",
      referenceList: ["[1] 作者甲. 第一篇论文的题目. 会议或期刊, 2024.", "[2] 作者乙. 第二篇论文的题目. 会议或期刊, 2025."],
      link: "扫码获取论文和代码。",
    },
  },
};

/** A product or engineering talk on a dark page: the problem, the design and its code, results. */
function midnightDeck(title, words) {
  const w = words.midnight;
  const heading = title || w.heading;
  return `presentation({ title: ${q(heading)}, theme: "midnight" });

slide({ name: "Cover" }).cover();
text(${q(w.eyebrow)}).eyebrow();
text(${q(heading)}).hero();
text(${q(w.subtitle)}).subtitle();
text(${q(w.author)}).author();

slide(${q(w.problem)});
text(${q(w.problemLead)}).lead();
bullets(
${lines(w.problemPoints)}
);

slide(${q(w.design)}).split("52:48");
code(\`${w.code}\`, "ts");

right();
text(${q(w.designLead)}).lead();
bullets(
${lines(w.designPoints)}
);

slide(${q(w.results)});
text(${q(w.resultsLead)});
gridSection(
  3,
${w.metrics.map(([value, label]) => `  metric(${q(value)}, ${q(label)}),`).join("\n")}
).gap(20);
text(${q(w.resultsNote)}).caption();

slide({ name: "Close" }).center();
text(${q(w.close)}).quote();
text(${q(w.contact)}).caption();
`;
}

/** An essay in warm serif pages: a scene with a quotation, three turns, a closing thought. */
function paperDeck(title, words) {
  const w = words.paper;
  const heading = title || w.heading;
  return `presentation({ title: ${q(heading)}, author: ${q(words.name)}, theme: "paper" });

slide({ name: "Cover" }).cover();
text(${q(w.eyebrow)}).eyebrow();
text(${q(heading)}).hero();
text(${q(w.subtitle)}).subtitle();
text(${q(words.name)}).author();

slide(${q(w.opening)}).split("56:44");
text(${q(w.openingLead)}).lead();
bullets(
${lines(w.openingPoints)}
);

right();
text(${q(w.quote)}).quote();
text(${q(w.quoteSource)}).caption();

slide(${q(w.turns)});
steps(
${lines(w.steps)}
);

slide({ name: "Close" }).center();
text(${q(w.close)}).quote();
text(${q(words.name)}).caption();
`;
}

/** A research talk whose title page the theme fills in from the presentation's details. */
function academicDeck(title, words) {
  const w = words.academic;
  return `presentation({
  title: ${q(title || w.title)},
  subtitle: ${q(w.subtitle)},
  author: ${q(words.name)},
  institute: ${q(words.institute)},
  date: ${q(year())},
  theme: "minimal-academic",
});

slide().cover();

slide(${q(w.motivation)});
text(${q(w.motivationLead)}).lead();
bullets(
${lines(w.motivationPoints)}
);

slide(${q(w.method)}).center();
text(${q(w.methodLead)}).lead();
math\`${formulas.objective}\`;
text(${q(w.methodNote)}).caption();

slide(${q(w.results)});
${table(w.table)};
text(${q(w.resultsNote)}).caption();

slide(${q(w.conclusion)});
bullets(
${lines(w.conclusionPoints)}
);
`;
}

/** A lecture in one of the Beamer-inspired themes, which differ only in colour and chrome. */
function beamerDeck(theme) {
  return (title, words) => {
    const w = words.beamer;
    const heading = title || w.title;
    return `presentation({
  title: ${q(heading)},
  author: ${q(words.name)},
  institute: ${q(words.institute)},
  date: ${q(year())},
  theme: ${q(theme)},
});

slide().cover();
text(${q(heading)}).hero();
text(${q(w.subtitle)}).subtitle();
text(${q(words.name)}).author();

slide(${q(w.outline)});
bullets(
${lines(w.outlinePoints)}
);

slide(${q(w.definition)});
text(${q(w.definitionLead)}).lead();
math\`${formulas.taylor}\`;
text(${q(w.definitionNote)}).caption();

slide(${q(w.example)}).split("48:52");
text(${q(w.exampleLead)}).lead();
bullets(
${lines(w.examplePoints)}
);

right();
${table(w.table)};

slide(${q(w.summary)});
bullets(
${lines(w.summaryPoints)}
);
`;
  };
}

/** An A0 conference poster in three columns of titled blocks. */
function posterDeck(title, words) {
  const w = words.poster;
  return `poster({
  title: ${q(title || w.title)},
  subtitle: ${q(w.subtitle)},
  author: ${q(w.author)},
  institute: ${q(words.institute)},
  date: ${q(`${w.event} ${year()}`)},
}).grid(3);

at("cell0/introduction").card();
text(${q(w.introduction)}).title();
text(${q(w.introductionText)});
bullets(
${lines(w.introductionPoints)}
);

at("cell0/idea").card();
text(${q(w.idea)}).title();
at("cell0/idea/statement").row().gap(28).align("center");
icon("lightbulb").size(72);
text(${q(w.ideaText)}).lead().grow();
at("cell0/idea");
text(${q(w.ideaNote)}).caption();

at("cell0/contributions").card();
text(${q(w.contributions)}).title();
bullets(
${lines(w.contributionPoints)}
);

at("cell0/references").card();
text(${q(w.references)}).title();
${w.referenceList.map((reference) => `text(${q(reference)});`).join("\n")}

at("cell1/method").card();
text(${q(w.method)}).title();
text(${q(w.methodText)});
math\`${formulas.model}\`;
text(${q(w.methodNote)});

at("cell1/setup").card();
text(${q(w.setup)}).title();
${table(w.table)}.striped();

at("cell1/analysis").card();
text(${q(w.analysis)}).title();
chart("line", {
  labels: ${literal(w.analysisChart.labels)},
  series: ${literal(w.analysisChart.series)},
}).height(500);
text(${q(w.analysisNote)}).caption();

at("cell2/results").card();
text(${q(w.results)}).title();
chart("bar", ${literal(w.chart)}).unit("%").max(100).height(560);
text(${q(w.resultsNote)}).caption();

at("cell2/conclusion").card();
text(${q(w.conclusion)}).title();
bullets(
${lines(w.conclusionPoints)}
);

at("cell2/more").card();
text(${q(w.more)}).title();
at("cell2/more/link").row().gap(32).align("center");
qr("https://example.com/paper").width(190);
text(${q(w.link)}).grow();
`;
}

/**
 * What a new presentation can start from: one template for each built-in theme, named after
 * it, so `frameseq new --template paper` and `theme: "paper"` read alike.
 */
export const presentationTemplates = [
  {
    id: "blank",
    names: { en: "Blank", zh: "空白" },
    summaries: { en: "A cover and a first slide on a clean white page.", zh: "白色页面上的一张封面和第一页。" },
    source: (title, words, language) => starterDeck(title, language),
  },
  {
    id: "midnight",
    names: { en: "Midnight", zh: "午夜" },
    summaries: { en: "A dark talk for products and code: the problem, the design, the results.", zh: "深色的产品和技术分享：问题、设计、结果。" },
    source: midnightDeck,
  },
  {
    id: "paper",
    names: { en: "Paper", zh: "纸张" },
    summaries: { en: "Warm serif pages for a story or an essay.", zh: "温暖的衬线字体，适合讲故事或随笔。" },
    source: paperDeck,
  },
  {
    id: "minimal-academic",
    names: { en: "Academic talk", zh: "学术报告" },
    summaries: { en: "A research talk: motivation, method, results, conclusion.", zh: "学术报告：研究动机、方法、结果、结论。" },
    source: academicDeck,
  },
  {
    id: "beamer-default",
    names: { en: "Beamer", zh: "Beamer" },
    summaries: { en: "A plain Beamer-style lecture with a formula and a table.", zh: "朴素的 Beamer 风格讲义，含公式和表格。" },
    source: beamerDeck("beamer-default"),
  },
  {
    id: "beamer-madrid",
    names: { en: "Beamer Madrid", zh: "Beamer Madrid" },
    summaries: { en: "The same lecture with a blue title bar and footer.", zh: "同样的讲义，带蓝色标题栏和页脚。" },
    source: beamerDeck("beamer-madrid"),
  },
  {
    id: "beamer-cambridge-us",
    names: { en: "Beamer CambridgeUS", zh: "Beamer CambridgeUS" },
    summaries: { en: "The same lecture in burgundy and cream.", zh: "同样的讲义，酒红与米色。" },
    source: beamerDeck("beamer-cambridge-us"),
  },
  {
    id: "poster",
    names: { en: "Poster", zh: "学术海报" },
    summaries: { en: "An A0 conference poster in three columns.", zh: "三栏的 A0 学术会议海报。" },
    source: posterDeck,
  },
];

/** The template with this id, or undefined for a name FrameSeq does not have. */
export function presentationTemplate(id) {
  return presentationTemplates.find((template) => template.id === id);
}

/**
 * A new presentation made from a template, titled `title`, with placeholders in English or
 * Chinese. The blank template writes exactly what `starterDeck` does.
 */
export function templateDeck(id, title, language = "en") {
  const template = presentationTemplate(id);
  if (!template) {
    throw new Error(`Unknown template "${id}". Choose one of: ${presentationTemplates.map((item) => item.id).join(", ")}.`);
  }
  const chosen = language === "zh" ? "zh" : "en";
  return template.source(title?.trim() ?? "", templateWords[chosen], chosen);
}
