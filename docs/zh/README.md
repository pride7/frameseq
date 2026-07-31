# FrameSeq 文档

三页就能把一场讲演写出来:装上 FrameSeq、抄一页你要的、然后改。其余页面是等某一页真的需要时再看的。

1. [快速上手](getting-started.md) —— 建项目、写头几页、预览、导出。
2. [配方](recipes.md) —— 讲演需要的每一种页面,各一页完整源码,配渲染结果。
3. [修改一场讲演](revising.md) —— 第二稿的每一处改动值多少行。

也可以先看 [在线 Gallery](https://pride7.github.io/frameseq/),或者在 [在线 Playground](https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground) 里直接改,什么都不用装。

标注 (English) 的页面**刻意保持英文**:函数参考和 API 参考的主体是签名和代码,读者查的就是要敲进去的那串字符;更新日志是历史记录,翻译它意味着每次发版都要再翻一遍;发布自动化只写给维护者。这些页面的链接指向英文原页。

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

- [Typst 集成](typst.md) — 嵌入 Typst 片段,或把整场演示导出为可编辑的 .typ 源码。
- [LaTeX 集成](latex.md) — 把现有的 LaTeX 表格和片段编译成演示对象。

## 检查与生成

上台前验证,或者把格式交给 AI。

- [布局检查](layout-checks.md) — 发现空白页、溢出、裁切、过小字号和拼错的区域路径。
- [用 AI 生成](ai-generation.md) — 把 FrameSeq 的契约交给代理,并按布局诊断迭代。

## 演示与导出

讲完之后,把文件交出去。

- [演讲者视图与遥控](presenter.md) — 备注、下一页预览、计时器、同步控制和手机遥控。
- [部署 HTML](deployment.md) — 发布静态演示、用 GitHub Pages,或构建单个可移植文件。
- [导出 PowerPoint](pptx.md) — 可编辑的混合 PPTX,或像素级保真的扁平化幻灯片。

## 编辑器与命令行

在你已有的工具里驱动 FrameSeq。

- [VS Code 扩展](vscode.md) — 分屏、页面导航、诊断和导出命令。
- [CLI 参考](cli.md) — 开发、遥控、HTML、PDF、PPTX、Typst、检视与检查。

## 参考

查东西用。不属于阅读路径。

- [Function reference (English)](../function-guide.md) — What each authoring function creates, its signature, parameters, and return value.
- [API reference (English)](../api-reference.md) — Exact TypeScript overloads, interfaces, and every public builder method.
- [高级组合](advanced.md) — 大写的对象 API 与底层组件。
- [Changelog (English)](../../CHANGELOG.md) — User-visible changes across releases.
- [Release automation (English)](../releasing.md) — npm Trusted Publishing and the version-tag workflow.

文档跟随最新发布的 FrameSeq 版本。
