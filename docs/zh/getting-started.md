<!-- translation-of: docs/getting-started.md sha256:ad242317f71f99c9 -->

# 快速上手

## 在线试用

打开 [StackBlitz 上的 FrameSeq Playground](https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground),可以直接在浏览器里编辑 `slides.ts` 并实时预览。保存时 StackBlitz 会创建你自己的副本,仓库里的示例不受影响。

## 创建项目

```bash
npm create frameseq@latest my-talk
cd my-talk
npm install
npm run dev
```

生成的项目把幻灯片顺序放在 `slides.ts`,可复用的代码放在两个小模块里。

```text
my-talk/
├─ AGENTS.md
├─ CLAUDE.md
├─ components/
│  ├─ content.ts
│  └─ theme.ts
├─ package.json
├─ slides.ts
└─ tsconfig.json
```

- `slides.ts` 描述整场演示和它的幻灯片顺序。
- `components/content.ts` 放可复用的内容函数,比如项目特有的卡片或提示块。
- `components/theme.ts` 放项目的主题、配色、字体和其它设计默认值。
- `AGENTS.md` 告诉编码代理如何在当前项目中使用 FrameSeq 语法、区域、公式和校验流程。
- `CLAUDE.md` 导入 `AGENTS.md`,让 Claude Code 使用同一套说明,不必维护第二份副本。

这里刻意没有 `components/index.ts`:`slides.ts` 直接引入这两个模块,每一处依赖都看得见。

## 写演示

```ts
import { featureCard } from "./components/content";
import { projectTheme } from "./components/theme";

presentation({ title: "My Talk", theme: projectTheme });

slide({ name: "Cover" }).cover();
text("Build presentations like interfaces").hero();
text("TypeScript → HTML → PDF").subtitle();
text("Your name").author();

slide("First idea")
  .notes("Introduce the main idea and pause before the three supporting points.");
text("Explain one idea per page.")
  .style("text-3xl font-semibold tracking-tight text-blue-600");
gridSection(
  3,
  featureCard("Readable", "Linear source code"),
  featureCard("Controllable", "UI-style modifiers"),
  featureCard("Portable", "Browser preview and PDF export"),
);

slide("Equation");
text`Inline math: $E = mc^2$`;
math`\int_0^\infty e^{-x}\,dx = 1`;
```

以上用的是中性白色的 `blank` 主题。用 `presentation({ title: "My Talk", theme: "midnight" })` 可以选择内置主题;自定义主题见 [Themes](../themes.md)(英文)。

入口文件不需要引入 FrameSeq、不需要声明 slides 变量、不需要包装函数,也不需要默认导出。FrameSeq 会把常用的文档命令注入 `slides.ts` 并导出当前演示。普通的 `.ts` 组件模块则各自显式引入用到的函数。

传给 `style("...")` 的 Tailwind CSS 工具类**不需要**在项目里安装或配置 Tailwind。任意值、内联 CSS 和修饰符优先级见 [Styling](../styling.md)(英文)。

## 预览

```bash
npm run dev
```

浏览器会自动打开,源文件一改就更新。用方向键、Page Up、Page Down 或空格翻页。用 `steps()` 或 `showAt()` 写的渐进内容会先逐条显示,然后才翻到下一页。

按 `P` 在第二个窗口打开同步的[演讲者视图](../presenter.md)(英文)。备注不会出现在观众页面和 PDF 里;PPTX 导出会把它们保留为 PowerPoint 的演讲者备注。

想用手机当遥控器,启动局域网服务:

```bash
npm run present
```

在电脑上打开演示,点 `R` 控件,用同一 Wi-Fi 下的手机扫描显示的二维码。手机可以翻页、逐条揭示,也可以控制同步的激光笔。

上台之前,把 TypeScript 和最终的浏览器几何一起检查一遍:

```bash
npm run check
```

生成的项目会在这条命令里一并运行 [`frameseq check`](../layout-checks.md)(英文),针对空白页、内容溢出、文字被裁切和字号过小,逐页给出可执行的修改建议。

## 构建静态 HTML

```bash
npm run build
```

生成的静态演示写入 `dist/`。它使用相对资源路径,既能放在域名根目录,也能放在 `https://user.github.io/my-talk/` 这类仓库地址下。

想生成单个自包含的 `dist/index.html`:

```bash
npm run build:single
```

新项目还自带一个 GitHub Actions 工作流,自动构建并部署 `dist/`。GitHub Pages 的一次性设置和其它托管方式见 [Deploy HTML](../deployment.md)(英文)。

## 导出 PDF

```bash
npm run pdf
```

默认输出到 `output/pdf/slides.pdf`。要换路径,直接用 CLI:

```bash
npx frameseq pdf slides.ts --output output/my-talk.pdf
```

## 导出 PowerPoint

```bash
npm run pptx
```

默认输出到 `output/pptx/slides.pptx`。文字、代码、图形、连线和演讲者备注会尽可能保留为**可编辑的** PowerPoint 对象;公式、Typst 和编译后的 LaTeX 片段则回退为高分辨率图片。如果要和浏览器里的样子最大程度一致,可以每页导出一张图:

```bash
npx frameseq pptx slides.ts --flatten
```

细节见 [Export PowerPoint](../pptx.md)(英文)。

## 导出 Typst

```bash
npm run typst
```

默认输出到 `output/typst/slides.typ`。这份文件是**可编辑的** Typst 源码:页面、文字、网格、定位、图形和代码都是原生对象,LaTeX 公式和基础文本走 MiTeX,常见的 LaTeX `tabular` 片段会变成原生 Typst 表格。

```bash
typst compile output/typst/slides.typ
```

映射规则和转换说明见 [Typst integration](../typst.md)(英文)。

## 加到已有项目里

```bash
npm install --save-dev @pride7/frameseq
npx frameseq new talk.slides.ts
npx frameseq dev talk.slides.ts
```

零 import 的幻灯片文件想要编辑器补全,在 `tsconfig.json` 里加上全局声明:

```json
{
  "compilerOptions": {
    "types": ["@pride7/frameseq/globals"]
  },
  "include": ["*.slides.ts"]
}
```

## 下一步

去写你的讲稿真正需要的那几页。[配方](recipes.md)里每一种都有一页完整且验证过的源码 —— 封面、对比、一行指标、代码配解释、公式、无坐标的图,以及渐进揭示和收尾。

上台前跑一次布局检查:

```bash
npx frameseq check my-talk.slides.ts
```

[文档模型](../document-model.md)(英文)讲清楚配方依赖的规则,[Diagrams](../diagrams.md)(英文)完整讲画图的模型。
