<p align="center">
  <img src="public/favicon.svg" width="64" height="64" alt="">
</p>

<h1 align="center">FrameSeq</h1>

<p align="center"><strong>用鼠标做幻灯片，每一页都是读得懂的代码。</strong></p>

<p align="center">
  <a href="https://pride7.github.io/frameseq/zh/download/">下载</a> ·
  <a href="https://pride7.github.io/frameseq/zh/">官网</a> ·
  <a href="https://pride7.github.io/frameseq/docs/zh/">中文文档</a> ·
  <a href="https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground">在线试用</a> ·
  <a href="https://github.com/pride7/frameseq/blob/main/README.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/pride7/frameseq/actions/workflows/ci.yml"><img src="https://github.com/pride7/frameseq/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://pride7.github.io/frameseq/zh/"><img src="https://github.com/pride7/frameseq/actions/workflows/gallery.yml/badge.svg" alt="官网"></a>
  <a href="https://www.npmjs.com/package/@pride7/frameseq"><img src="https://img.shields.io/npm/v/@pride7/frameseq" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT 许可"></a>
</p>

FrameSeq Studio 有你在 PowerPoint 里熟悉的菜单、插入库、格式窗格、幻灯片母版和演讲者视图。每一页背后都是一份可读的文件：AI 可以直接写，Git 可以管理版本，一条命令就能导出可编辑的 PowerPoint、PDF 或网页。

![FrameSeq Studio 中文界面：左边是幻灯片缩略图，中间是这一页的代码，右边是预览](https://pride7.github.io/frameseq/images/zh/studio.webp)

免费开源，支持 Windows、macOS 和 Linux。

## 开始使用

**下载应用。** [下载页](https://pride7.github.io/frameseq/zh/download/)里有 Windows 安装包、macOS 磁盘映像和 Linux 压缩包。应用自带 Node.js、Typst 和 Tectonic，不需要先安装任何东西，之后也会自动更新。详见 [FrameSeq 应用](https://pride7.github.io/frameseq/docs/zh/app.html)。

**用 npm 安装。**

```bash
npm create frameseq@latest my-talk
cd my-talk
npm install
npm run studio
```

如果只想在任意文件夹里写一份幻灯片文件，全局安装一次 FrameSeq，再用 Studio 打开它：

```bash
npm install --global @pride7/frameseq
frameseq studio my-talk.slides.ts
```

**在浏览器里试用。** [StackBlitz 在线环境](https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground)打开后，一边是幻灯片文件，一边是实时预览，马上就能改。

## PowerPoint 里常用的，这里都有

不用先学什么：点一点、拖一拖、打几个字，代码由 Studio 来写。

- **插入任何内容。** 文字、公式、图片、表格、图表、图标，还有 27 种形状，都在一个插入库里。把形状拖到幻灯片上，画在哪里就落在哪里。
- **格式窗格。** 选中一个对象，就能改它的文字、配色、填充、轮廓、大小和位置。每次修改都能单独撤销。
- **右键菜单。** 剪切、复制、粘贴、创建副本、调整叠放次序、对齐、转到代码，快捷键和你习惯的一样。
- **幻灯片母版和模板。** Logo、页脚、标题栏只画一次，每一页都跟着变。任何一份演示都能存成你自己的模板。
- **12 种版式**新建幻灯片，演讲者备注就写在幻灯片下方，一切操作都能用 `Ctrl+Z` 撤销。
- **中文界面**，菜单、提示和报错都是中文。

<table>
  <tr>
    <td width="50%"><img src="https://pride7.github.io/frameseq/images/zh/studio-insert.webp" alt="插入库"></td>
    <td width="50%"><img src="https://pride7.github.io/frameseq/images/zh/studio-format.webp" alt="格式窗格"></td>
  </tr>
  <tr>
    <td align="center">插入库</td>
    <td align="center">格式窗格</td>
  </tr>
</table>

按 `Ctrl+E` 收起编辑器，不想看代码的人完全不用看。把代码留在旁边的话，按住 Alt 点击任意对象就能跳到对应的代码行，还有 TypeScript 自动补全、悬停说明和实时报错。拖动一个形状，只有它的数字会变。详见 [FrameSeq Studio](https://pride7.github.io/frameseq/docs/zh/studio.html)。

## 让 AI 助手帮你改

AI 助手面板会调用你电脑上的 Claude Code 或 Codex，用你自己的账号。它修改幻灯片、检查布局、查看自己画出的效果，再把每一处修改摆出来，由你决定接受还是拒绝。

![AI 助手把一页路线图改成四个箭头](https://pride7.github.io/frameseq/images/zh/studio-assistant.webp)

想用自己的 AI 工具？Claude Code、Codex 和 Cursor 可以连接 `frameseq mcp`，读取大纲、检查布局、查看幻灯片；任何模型都能从 [llms.txt](https://pride7.github.io/frameseq/llms.txt) 学会这门语言。详见 [AI 生成](https://pride7.github.io/frameseq/docs/zh/ai-generation.html)。

## 一份从上往下读的文件

每一页只是几行 TypeScript，不用 import，没有嵌套，也没有标记语言。代码的顺序就是阅读的顺序，所以 diff 一眼就能看出改了什么，AI 写起来也不会迷路。

```ts
presentation({ title: "Atlas 2.0", theme: "minimal-academic" });

slide("每个版本都更快").split("38:62")
  .notes("中位加载时间，在中端手机、4G 网络下测得。");
text("一年里，首块瓦片的中位加载时间降低了三分之二。").lead();
bullets(
  "矢量瓦片取代了图片",
  "每个边缘节点都有缓存",
  "字体随应用一起发布",
);
right();
chart("bar", { "1.0": 840, "1.4": 610, "1.8": 430, "2.0": 280 })
  .unit(" ms")
  .colors("#0d9488");
```

`.split()`、`.grid()` 和 `.canvas()` 决定一页的版面，`right()` 和 `cell()` 说明接下来的内容放在哪里。放映之前，`frameseq check` 会测量渲染出来的幻灯片，按对象指出每一处溢出、被裁切的行和过小的字号：

```text
$ npx frameseq check talk.slides.ts
ERROR Slide 4 "Architecture" [text-clipped]
  Text is clipped by 38px on the bottom.
```

建议先读[语言导览](https://pride7.github.io/frameseq/docs/zh/language.html)，再查[函数参考](https://pride7.github.io/frameseq/docs/function-guide.html)（英文）。

## 为真实的演讲而生

- **流程图。** 27 种形状，配色会根据主题自动调整；连接线可以直角转弯，自动绕开挡路的对象。详见[流程图](https://pride7.github.io/frameseq/docs/zh/diagrams.html)。
- **公式和排版。** 用熟悉的 LaTeX 写行内或独立公式；需要更复杂的排版时，可以嵌入 Typst 或 LaTeX 表格。
- **图表和表格。** 柱状图、折线图、饼图、环形图和三线表，都直接由文件里的数字画出。
- **海报。** 用同一门语言做 A0 海报，字号按纸张尺寸设定，导出的 PDF 就是纸张的真实尺寸。详见[海报与打印](https://pride7.github.io/frameseq/docs/zh/posters.html)。
- **参考文献、图标和二维码。** 导入 `.bib` 文件，边写边 `cite()`；Lucide 图标按名字调用，`qr()` 在最后一页放一个观众能扫的链接。
- **主题。** FrameSeq 自带 7 个主题，一个母版或 `defineTheme()` 就能做出你自己的风格。详见[主题](https://pride7.github.io/frameseq/docs/zh/themes.html)。

## 双屏放映，用手机翻页

按 `F5`，幻灯片铺满整个屏幕。接上投影仪时，幻灯片显示在投影上，你的笔记本上则是演讲者视图：备注、下一页和计时器一目了然。扫码配对后，还能用手机翻页、看备注，在大屏上用激光笔指示。

![演讲者视图：备注、下一页和计时器](https://pride7.github.io/frameseq/images/zh/studio-presenter.webp)

## 一份文件，四种格式

形状、图表和表格导出到 PowerPoint 后都是原生对象，同事可以直接修改；每种导出都可以只选其中几页。

| 格式 | 命令 | 得到什么 |
| --- | --- | --- |
| PowerPoint | `frameseq pptx talk.slides.ts` | 可编辑的文本框、预设形状、图表和表格 |
| PDF | `frameseq pdf talk.slides.ts` | 像素级还原，海报按纸张尺寸输出 |
| 网页 | `frameseq build talk.slides.ts` | 带演讲者视图的交互式幻灯片，可放到任何静态网站 |
| Typst | `frameseq typst talk.slides.ts` | 可以继续排版的 Typst 源码 |

Studio 的**导出**菜单也能做同样的事。详见[命令行参考](https://pride7.github.io/frameseq/docs/zh/cli.html)。

## 融入你的工作方式

- **Visual Studio Code。** 源码旁边的实时预览、问题面板里的布局检查、导出，以及“在 Studio 中打开”。安装[扩展](https://marketplace.visualstudio.com/items?itemName=pride7.frameseq)。
- **命令行和 CI。** 溢出的幻灯片可以挡住合并，幻灯片也能发布成静态网站。详见[部署](https://pride7.github.io/frameseq/docs/zh/deployment.html)。
- **Git。** 每次修改都是可读的 diff。为不同的听众开一个分支，在不同演讲之间共用内容。详见[修改幻灯片](https://pride7.github.io/frameseq/docs/zh/revising.html)。

## 文档

- [快速上手](https://pride7.github.io/frameseq/docs/zh/getting-started.html)
- [语言导览](https://pride7.github.io/frameseq/docs/zh/language.html)
- [函数参考](https://pride7.github.io/frameseq/docs/function-guide.html)（英文）
- [全部中文文档](https://pride7.github.io/frameseq/docs/zh/)
- [更新日志](https://github.com/pride7/frameseq/blob/main/CHANGELOG.md)（英文）

## 参与开发

```bash
npm ci
npm run studio          # 在 Studio 中打开 slides.ts
npm run release:check   # 运行 CI 的全部检查
```

`release:check` 会构建库、示例和官网，在桌面和手机尺寸下运行浏览器测试，在干净的项目里安装打包好的 npm 包，并导出 PDF 和 PowerPoint 文件。每次推送都会在 GitHub Actions 上运行它，推送到 `main` 会部署官网。用户能看到的改动写在 [CHANGELOG.md](CHANGELOG.md) 的 **Unreleased** 下；发布流程见 [Release FrameSeq](https://pride7.github.io/frameseq/docs/releasing.html)（英文）。

## 许可

[MIT](LICENSE)
