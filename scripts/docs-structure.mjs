/**
 * The one description of how the documentation is organised. The Gallery sidebar and
 * the documentation home page are both generated or checked against it, so a page
 * cannot exist without a place in the navigation, and the two cannot disagree.
 *
 * The order is a reading order: what to do first, then how to write slides, then the
 * specialised subjects, and only then the reference.
 */
export const documentationGroups = [
  {
    label: "Start",
    summary: "Install FrameSeq, write a first talk, and revise it.",
    pages: [
      {
        slug: "index",
        source: "docs/README.md",
        label: "Documentation home",
        blurb: "What to read, in the order that gets a talk written.",
      },
      {
        slug: "getting-started",
        source: "docs/getting-started.md",
        label: "Getting started",
        blurb: "Create a project, write the first slides, preview them, and export the result.",
      },
      {
        slug: "recipes",
        source: "docs/recipes.md",
        label: "Recipes",
        previews: "recipes",
        blurb: "A complete slide for each page a talk needs, with the result beside it.",
      },
      {
        slug: "revising",
        source: "docs/revising.md",
        label: "Revising a talk",
        blurb: "The edits a second draft needs, each as a diff and measured in lines.",
      },
    ],
  },
  {
    label: "Write slides",
    summary: "The model behind the recipes, one subject at a time.",
    pages: [
      {
        slug: "document-model",
        source: "docs/document-model.md",
        label: "Document model",
        blurb: "How presentation(), slide(), objects, and the active region fit together.",
      },
      {
        slug: "content",
        source: "docs/content.md",
        label: "Content",
        blurb: "Text, lists, images, code, formulas, metrics, cards, and groups.",
      },
      {
        slug: "layout",
        source: "docs/layout.md",
        label: "Layout",
        blurb: "Normal flow, split pages, grids, local grids, region paths, and canvas.",
      },
      {
        slug: "diagrams",
        source: "docs/diagrams.md",
        label: "Diagrams",
        blurb: "Region paths, automatic rows and columns, names, and connectors that follow their objects.",
      },
      {
        slug: "shapes",
        source: "docs/shapes.md",
        label: "Shapes and connectors",
        blurb: "The primitives a diagram is built from: rectangles, circles, lines, and arrows.",
      },
      {
        slug: "styling",
        source: "docs/styling.md",
        label: "Styling",
        blurb: "Chainable modifiers, text roles, dimensions, Tailwind utilities, and inline styles.",
      },
      {
        slug: "themes",
        source: "docs/themes.md",
        label: "Themes",
        blurb: "Built-in themes, presentation-wide typography, CJK text, and custom tokens.",
      },
    ],
  },
  {
    label: "Typeset mathematics and tables",
    summary: "Bring an external typesetter in for the fragments that need one.",
    pages: [
      {
        slug: "typst",
        source: "docs/typst.md",
        label: "Typst integration",
        blurb: "Embed Typst fragments, or export the whole presentation as editable .typ source.",
      },
      {
        slug: "latex",
        source: "docs/latex.md",
        label: "LaTeX integration",
        blurb: "Compile existing LaTeX tables and fragments into presentation objects.",
      },
    ],
  },
  {
    label: "Check and generate",
    summary: "Verify a deck before presenting it, and hand the format to an agent.",
    pages: [
      {
        slug: "layout-checks",
        source: "docs/layout-checks.md",
        label: "Layout checks",
        blurb: "Detect empty pages, overflow, clipped text, small type, and mistyped region paths.",
      },
      {
        slug: "ai-generation",
        source: "docs/ai-generation.md",
        label: "Generate with AI",
        blurb: "Give an agent the FrameSeq contract and iterate from layout diagnostics.",
      },
    ],
  },
  {
    label: "Present and export",
    summary: "Deliver the talk and hand the file over afterwards.",
    pages: [
      {
        slug: "presenter",
        source: "docs/presenter.md",
        label: "Presenter and remote",
        blurb: "Notes, next-slide preview, timer, synchronised controls, and a phone remote.",
      },
      {
        slug: "deployment",
        source: "docs/deployment.md",
        label: "Deploy HTML",
        blurb: "Publish a static presentation, use GitHub Pages, or build one portable file.",
      },
      {
        slug: "pptx",
        source: "docs/pptx.md",
        label: "Export PowerPoint",
        blurb: "Editable hybrid PPTX or pixel-faithful flattened slides.",
      },
    ],
  },
  {
    label: "Editor and command line",
    summary: "Drive FrameSeq from the tools you already use.",
    pages: [
      {
        slug: "vscode",
        source: "docs/vscode.md",
        label: "VS Code extension",
        blurb: "Split view, slide navigation, diagnostics, and export commands.",
      },
      {
        slug: "cli",
        source: "docs/cli.md",
        label: "CLI reference",
        blurb: "Development, remote control, HTML, PDF, PPTX, Typst, inspection, and checking.",
      },
    ],
  },
  {
    label: "Reference",
    summary: "Look something up. Not part of the reading path.",
    pages: [
      {
        slug: "function-guide",
        source: "docs/function-guide.md",
        label: "Function reference",
        blurb: "What each authoring function creates, its signature, parameters, and return value.",
      },
      {
        slug: "api-reference",
        source: "docs/api-reference.md",
        label: "API reference",
        blurb: "Exact TypeScript overloads, interfaces, and every public builder method.",
      },
      {
        slug: "advanced",
        source: "docs/advanced.md",
        label: "Advanced composition",
        blurb: "The uppercase object API and lower-level components.",
      },
      {
        slug: "changelog",
        source: "CHANGELOG.md",
        label: "Changelog",
        blurb: "User-visible changes across releases.",
      },
      {
        slug: "releasing",
        source: "docs/releasing.md",
        label: "Release automation",
        blurb: "npm Trusted Publishing and the version-tag workflow.",
      },
    ],
  },
];

export const documentationPages = documentationGroups.flatMap((group) => group.pages);

/**
 * The Chinese documentation. Only the reading path is translated: a reader can get from
 * installing FrameSeq to a revised talk without English, and every other page is offered
 * in English rather than hidden, so no link leads nowhere.
 */
export const locales = {
  en: { code: "en", htmlLang: "en", label: "English", switchLabel: "中文", directory: "" },
  zh: { code: "zh", htmlLang: "zh-Hans", label: "中文", switchLabel: "English", directory: "zh" },
};

const chinese = {
  groups: {
    Start: { label: "开始", summary: "装上 FrameSeq,写出第一份讲演,再改一遍。" },
    "Write slides": { label: "写幻灯片", summary: "配方背后的模型,一次讲一个主题。" },
    "Typeset mathematics and tables": {
      label: "排版公式与表格",
      summary: "需要外部排版器的片段,交给它来排。",
    },
    "Check and generate": { label: "检查与生成", summary: "上台前验证,或者把格式交给 AI。" },
    "Present and export": { label: "演示与导出", summary: "讲完之后,把文件交出去。" },
    "Editor and command line": { label: "编辑器与命令行", summary: "在你已有的工具里驱动 FrameSeq。" },
    Reference: { label: "参考", summary: "查东西用。不属于阅读路径。" },
  },
  pages: {
    index: { label: "文档首页", blurb: "按能把讲演写出来的顺序,该读什么。" },
    "getting-started": { label: "快速上手", blurb: "建项目、写头几页、预览、导出。" },
    recipes: { label: "配方", blurb: "讲演需要的每一种页面,各一页完整源码,配渲染结果。" },
    revising: { label: "修改一场讲演", blurb: "第二稿要做的改动,每处一段 diff,按行计价。" },
    "document-model": { label: "文档模型", blurb: "presentation()、slide()、对象和当前区域怎么组合在一起。" },
    content: { label: "内容", blurb: "文字、列表、图片、代码、公式、指标、卡片和分组。" },
    layout: { label: "布局", blurb: "普通流、分栏、网格、局部网格、区域路径和画布。" },
    diagrams: { label: "画图", blurb: "区域路径、自动行列、命名,以及跟着对象走的连线。" },
    shapes: { label: "图形与连线", blurb: "构成一张图的图元:矩形、圆、线和箭头。" },
    styling: { label: "样式", blurb: "链式修饰符、文字角色、尺寸、Tailwind 工具类和内联样式。" },
    themes: { label: "主题", blurb: "内置主题、全局排版、中日韩文字和自定义 token。" },
    typst: { label: "Typst 集成", blurb: "嵌入 Typst 片段,或把整场演示导出为可编辑的 .typ 源码。" },
    latex: { label: "LaTeX 集成", blurb: "把现有的 LaTeX 表格和片段编译成演示对象。" },
    "layout-checks": { label: "布局检查", blurb: "发现空白页、溢出、裁切、过小字号和拼错的区域路径。" },
    "ai-generation": { label: "用 AI 生成", blurb: "把 FrameSeq 的契约交给代理,并按布局诊断迭代。" },
    presenter: { label: "演讲者视图与遥控", blurb: "备注、下一页预览、计时器、同步控制和手机遥控。" },
    deployment: { label: "部署 HTML", blurb: "发布静态演示、用 GitHub Pages,或构建单个可移植文件。" },
    pptx: { label: "导出 PowerPoint", blurb: "可编辑的混合 PPTX,或像素级保真的扁平化幻灯片。" },
    vscode: { label: "VS Code 扩展", blurb: "分屏、页面导航、诊断和导出命令。" },
    cli: { label: "CLI 参考", blurb: "开发、遥控、HTML、PDF、PPTX、Typst、检视与检查。" },
    advanced: { label: "高级组合", blurb: "大写的对象 API 与底层组件。" },
  },
};

/** The documentation structure in one language, with untranslated pages left in English. */
export function localisedGroups(locale) {
  if (locale === "en") return documentationGroups;
  return documentationGroups.map((group) => ({
    ...group,
    ...(chinese.groups[group.label] ?? {}),
    pages: group.pages.map((page) => ({
      ...page,
      ...(chinese.pages[page.slug] ?? {}),
      translated: Boolean(chinese.pages[page.slug]),
    })),
  }));
}

export const translatedSlugs = Object.keys(chinese.pages);
