# FrameSeq 文档

三页就能把一场讲演写出来:装上 FrameSeq、抄一页你要的、然后改。其余页面是等某一页真的需要时再看的。

1. [快速上手](getting-started.md) —— 建项目、写头几页、预览、导出。
2. [配方](recipes.md) —— 讲演需要的每一种页面,各一页完整源码,配渲染结果。
3. [修改一场讲演](revising.md) —— 第二稿的每一处改动值多少行。

也可以先看 [在线 Gallery](https://pride7.github.io/frameseq/),或者在 [在线 Playground](https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground) 里直接改,什么都不用装。

标注 (English) 的页面尚未翻译,链接指向英文原页。

## 写幻灯片

配方背后的模型,一次讲一个主题。

- [文档模型](document-model.md) — presentation()、slide()、对象和当前区域怎么组合在一起。
- [内容](content.md) — 文字、列表、图片、代码、公式、指标、卡片和分组。
- [布局](layout.md) — 普通流、分栏、网格、局部网格、区域路径和画布。
- [画图](diagrams.md) — 区域路径、自动行列、命名,以及跟着对象走的连线。
- [图形与连线](shapes.md) — 构成一张图的图元:矩形、圆、线和箭头。
- [样式](styling.md) — 链式修饰符、文字角色、尺寸、Tailwind 工具类和内联样式。
- [主题](themes.md) — 内置主题、全局排版、中日韩文字和自定义 token。

## 排版公式与表格

需要外部排版器的片段,交给它来排。

- [Typst integration (English)](../typst.md) — Embed Typst fragments, or export the whole presentation as editable .typ source.
- [LaTeX integration (English)](../latex.md) — Compile existing LaTeX tables and fragments into presentation objects.

## 检查与生成

上台前验证,或者把格式交给 AI。

- [Layout checks (English)](../layout-checks.md) — Detect empty pages, overflow, clipped text, small type, and mistyped region paths.
- [Generate with AI (English)](../ai-generation.md) — Give an agent the FrameSeq contract and iterate from layout diagnostics.

## 演示与导出

讲完之后,把文件交出去。

- [Presenter and remote (English)](../presenter.md) — Notes, next-slide preview, timer, synchronised controls, and a phone remote.
- [Deploy HTML (English)](../deployment.md) — Publish a static presentation, use GitHub Pages, or build one portable file.
- [Export PowerPoint (English)](../pptx.md) — Editable hybrid PPTX or pixel-faithful flattened slides.

## 编辑器与命令行

在你已有的工具里驱动 FrameSeq。

- [VS Code extension (English)](../vscode.md) — Split view, slide navigation, diagnostics, and export commands.
- [CLI reference (English)](../cli.md) — Development, remote control, HTML, PDF, PPTX, Typst, inspection, and checking.

## 参考

查东西用。不属于阅读路径。

- [Function reference (English)](../function-guide.md) — What each authoring function creates, its signature, parameters, and return value.
- [API reference (English)](../api-reference.md) — Exact TypeScript overloads, interfaces, and every public builder method.
- [Advanced composition (English)](../advanced.md) — The uppercase object API and lower-level components.
- [Changelog (English)](../../CHANGELOG.md) — User-visible changes across releases.
- [Release automation (English)](../releasing.md) — npm Trusted Publishing and the version-tag workflow.

文档跟随最新发布的 FrameSeq 版本。
