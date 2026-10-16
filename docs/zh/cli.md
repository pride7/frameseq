<!-- translation-of: docs/cli.md sha256:1ce5f81b7b7388d1 -->

# CLI 参考

npm 包会安装 `frameseq` 可执行文件,不需要 Node.js 的 [FrameSeq 应用](app.md)也会。

## 新建幻灯片文件

```bash
frameseq new [file] [--template name]
```

不给文件名时,FrameSeq 在当前目录创建 `slides.ts`。

```bash
frameseq new quarterly.slides.ts
```

这条命令**拒绝覆盖已存在的文件**。

不加 `--template` 时，文件里是一页封面和第一页内容。模板让你从更完整的起点开始，带着这类演示通常需要的那些页面：

```bash
frameseq new poster.slides.ts --template poster
```

| 模板 | 起始内容 |
| --- | --- |
| `blank` | 白色页面上的一张封面和第一页。 |
| `midnight` | 深色的产品和技术分享：问题、设计、结果。 |
| `paper` | 温暖的衬线字体，适合讲故事或随笔。 |
| `minimal-academic` | 学术报告：研究动机、方法、结果、结论。 |
| `beamer-default` | 朴素的 Beamer 风格讲义，含公式和表格。 |
| `beamer-madrid` | 同样的讲义，带蓝色标题栏和页脚。 |
| `beamer-cambridge-us` | 同样的讲义，酒红与米色。 |
| `poster` | 三栏的 A0 学术会议海报。 |

每个模板都以它使用的[主题](themes.md)命名，原样就能通过 `frameseq check --strict`。名字写错时，命令会列出所有模板。[FrameSeq Studio](studio.md) 新建演示时提供同样的模板，并显示它们的封面。命令行写出的占位文字是英文的；Studio 用中文显示时，占位文字是中文。

`--template` 后面也可以写你自己的模板名。你的模板是存放在模板文件夹里的演示，默认是“文档”里的 `FrameSeq/Templates`，环境变量 `FRAMESEQ_TEMPLATES` 可以指定别的文件夹：

```bash
frameseq new weekly-sync.slides.ts --template "Group meeting"
```

新演示以文件名为标题，这里是 *weekly sync*；文件夹模板里的文件会复制到它旁边。如果你的模板和 FrameSeq 自带的模板同名，用的是自带的那个。见[母版与模板](masters.md#你自己的模板)。

## 启动开发服务器

```bash
frameseq dev [file] [--host] [--remote]
```

默认入口是 `slides.ts`。

```bash
frameseq dev talk.slides.ts
```

浏览器会自动打开,源码改动后演示自动更新。

在观众页按 `P` 打开演讲者视图,或者在预览地址后加 `?presenter=1`。只要两个窗口来自同一个源、同一台设备的浏览器,它们就保持同步。

当预览需要通过容器或 StackBlitz 这类浏览器 IDE 访问时,加 `--host`:

```bash
frameseq dev talk.slides.ts --host
```

它只把 Vite 开发服务器暴露出来,**不会**启用手机遥控。默认命令仍然绑定在 localhost。

演讲时加 `--remote`,把服务暴露到局域网并启用二维码配对:

```bash
frameseq dev talk.slides.ts --remote
```

手机和演示电脑必须在同一个局域网。这个模式包含 `--host` 的行为,并为翻页、揭示步骤和激光笔启用一个本地 WebSocket 中继;**不使用任何 FrameSeq 云服务**。

## 打开 FrameSeq Studio

```bash
frameseq studio [file] [--host] [--remote] [--no-open] [--tab] [--background]
```

这条命令启动开发服务器，并打开 [FrameSeq Studio](studio.md)：幻灯片栏、TypeScript 编辑器、实时预览和实时布局检查都在一个窗口里。

```bash
frameseq studio talk.slides.ts
```

不带文件、而且当前目录里没有 `slides.ts` 时，Studio 会打开它的启动页，在那里新建演示，或者打开已有的和最近用过的演示。

装了 Chrome、Edge、Chromium 或 Brave 时，Studio 以独立的应用窗口打开，否则在默认浏览器里打开。`--tab` 总是使用浏览器标签页，`--no-open` 什么都不打开。`--background` 会立刻返回，让 Studio 不依赖终端继续运行，直到它的窗口关闭；它的输出写到 FrameSeq 设置文件夹里的 `studio.log`。

Studio 会写入幻灯片文档，所以它的接口只响应这台电脑。`--host` 把它共享到网络上，供容器或浏览器 IDE 使用；这样一来，任何能访问这个地址的人都可以编辑这份演示。`--remote` 启动时就开启[手机遥控](studio.md#演示与导出)，和 **放映 › 用手机遥控…** 的效果一样：网络上的设备只能打开幻灯片、跟随放映，别的都做不了。

## 添加快捷方式

```bash
frameseq shortcut [--remove]
```

这条命令把 **FrameSeq Studio** 加到 Windows 的开始菜单和桌面、macOS 的 `~/Applications`，或 Linux 的应用程序菜单里。快捷方式用这份安装的 FrameSeq 运行 `frameseq studio --background`，打开启动页。`--remove` 会把它删掉。

## 更新 FrameSeq

```bash
frameseq update [--check] [--revert]
frameseq --version
```

在 [FrameSeq 应用](app.md#更新)里，`frameseq update` 会在应用能自己安装时安装最新版本（大多数版本都可以），不能时则说明去哪里下载新应用。`--check` 只说明有什么更新。`--revert` 删除已安装的更新，让 FrameSeq 按应用安装时的样子运行。用 npm 安装的 FrameSeq 会说明用哪条 npm 命令更新。`frameseq --version` 显示正在运行的版本。

## 构建静态 HTML

```bash
frameseq build [file] [--output directory] [--single-file]
```

默认入口是 `slides.ts`,默认输出目录是 `dist/`。

```bash
frameseq build talk.slides.ts --output site
```

默认构建使用相对资源路径,所以整个输出目录既能部署在域名根目录,也能部署在 GitHub Pages 这类仓库子路径下。

用 `--single-file` 把 JavaScript、CSS、字体和框架资源全部内联进一个可移植的 `index.html`:

```bash
frameseq build talk.slides.ts --single-file
```

这个单文件可以直接打开,也可以上传到任何"一个 HTML 文件更方便"的地方。**远程 URL 加载的图片仍然是远程的**;需要内嵌所有资源时,请用 data URL 或由构建管理的本地资源。

## 导出 PDF

```bash
frameseq pdf [file] [--output path] [--slides 1-3,5]
```

默认输出到 `output/pdf/<入口名>.pdf`。

```bash
frameseq pdf quarterly.slides.ts
frameseq pdf quarterly.slides.ts --output reports/quarterly.pdf
```

PDF 导出会启动无头浏览器,渲染所有页面和揭示步骤,并写出按页尺寸、含背景的 PDF。为纸张制作的演示,比如海报,会按纸张尺寸打印;见[海报与打印](posters.md)。

## 导出 PNG

```bash
frameseq png [file] [--output path] [--slides 1-3,5] [--scale 2]
```

PDF 里的每一页都会变成一张 PNG 图片,尺寸是画布的 `--scale` 倍,默认两倍,最多八倍。只有一页时,比如一张[插图](posters.md#论文插图),写到 `output/png/<入口名>.png`,或 `--output` 指定的文件;有多页时写进 `output/png/<入口名>/` 文件夹,或 `--output` 指定的文件夹,文件名是 `<入口名>-<页号>.png`,一页有多个揭示步骤时再加上 `-<步骤>`。

```bash
frameseq png figure.slides.ts
frameseq png figure.slides.ts --scale 3 --output figures/method.png
frameseq png talk.slides.ts --slides 1-3
```

## 导出 PowerPoint

```bash
frameseq pptx [file] [--output path] [--flatten] [--slides 1-3,5]
```

默认输出到 `output/pptx/<入口名>.pptx`。

```bash
frameseq pptx quarterly.slides.ts
frameseq pptx quarterly.slides.ts --output reports/quarterly.pptx
frameseq pptx quarterly.slides.ts --flatten
```

默认的混合导出把普通文字、代码、图形、线条和箭头保留为**可编辑的** PowerPoint 对象。公式、Typst、编译后的 LaTeX 和其它复杂渲染片段使用高分辨率图片对象。演讲者备注会保留。

`--flatten` 把每一整页导出为一张高分辨率图片,这能得到与浏览器最接近的外观,但可见对象无法单独编辑。映射规则和限制见 [Export PowerPoint](pptx.md)。

## 导出 Typst

```bash
frameseq typst [file] [--output path] [--slides 1-3,5]
```

默认输出到 `output/typst/<入口名>.typ`。

```bash
frameseq typst quarterly.slides.ts
frameseq typst quarterly.slides.ts --output reports/quarterly.typ
```

导出器写出可编辑的 Typst 页面,通过 MiTeX 映射 LaTeX 公式和基础文本,并把常见的 LaTeX `tabular` 片段转换成原生 Typst 表格。原生 Typst 片段保持源码形式;不支持的 LaTeX 和 CSS 特性使用有文档说明的回退或转换说明。见 [Typst integration](typst.md)。

## 只导出部分页

`pdf`、`pptx` 和 `typst` 都接受 `--slides`,只导出它指定的页:页码和页码范围,用逗号隔开,从 1 开始数,和翻页计数器的数法一样。

```bash
frameseq pdf quarterly.slides.ts --slides 1-3,5
frameseq pptx quarterly.slides.ts --slides 4
```

这些页保持它们在演示里的顺序和页码:页脚里的页数仍然按整份演示来数。不写 `--output` 时,文件名会注明导出的页,比如 `output/pdf/quarterly-slides-1-3,5.pdf` 或 `output/pptx/quarterly-slide-4.pptx`,所以不会覆盖整份演示的导出。页码超出最后一页时,导出会在写出任何文件之前停下。HTML 构建总是包含所有页。

## 检查渲染后的布局

```bash
frameseq check [file] [--json] [--strict]
```

检查器在无头浏览器里渲染每一页,发现空白页、超出画布的对象、被裁切的文字,以及小到不适合演示的字号。

```bash
frameseq check talk.slides.ts
frameseq check talk.slides.ts --json
frameseq check talk.slides.ts --strict
```

**错误**返回非零退出码;**警告**只在严格模式下失败。JSON 输出包含页码与标签、FrameSeq 对象类型与路径、写出该对象的命令所在的行、测量到的几何,以及修改建议。见 [面向 AI 的布局检查](layout-checks.md)。

## 文档无法运行时

`check`、`pdf`、`pptx` 和 `typst` 会先运行幻灯片文档。文档一抛出错误,它们就立刻停下,像编译器报错那样,指出文档当时正在执行的语句以及出错的那一行:

```text
talk.slides.ts:24:1  error  ref() cannot find an object named "decodr"; named objects on this slide: encoder, decoder
  23 | rect("Decoder").as("decoder");
> 24 | ref("decodr").fill("#dbeafe");
```

退出码不为零。`check --json` 把它报告为一条 `document-error`。

## 检视源码文档

```bash
frameseq inspect [file] [--json]
```

检视会解析 TypeScript 源码,**不启动浏览器**。它报告页面顺序、标签、布局、是否有备注、对象类型和源码位置。

```bash
frameseq inspect talk.slides.ts
frameseq inspect talk.slides.ts --json
```

稳定的 JSON 形式是给编辑器集成和编码代理用的。FrameSeq 的 VS Code 扩展用它构建页面大纲,并直接跳转到 `slide()` 调用。

## 把幻灯片交给编程代理

```bash
frameseq mcp [file]
```

`frameseq mcp` 是一个 [Model Context Protocol](https://modelcontextprotocol.io)(MCP)服务器,让 Claude Code、Codex、Cursor 这样的编程代理看到演示渲染出来的样子,而不只是源码。它通过标准输入输出说 MCP,提供四个只读的工具:

| 工具 | 代理得到什么 |
| --- | --- |
| `outline` | 每一页的标题、布局、写出它的源码行,以及它有几个对象。 |
| `check` | FrameSeq Studio 列出的那些问题:TypeScript 错误、指向不存在之物的名字、文档运行时抛出的错误,以及[布局规则](layout-checks.md),每条都带行号。 |
| `screenshot` | 幻灯片的 PNG 图片,一次最多六页。 |
| `guide` | FrameSeq 的写作指南 `llms.txt`。 |

幻灯片在它自己的开发服务器里渲染。服务器在第一次调用时启动,之后一直运行,所以后面的调用大约一秒就有结果。每份演示给代理添加一次即可:

```bash
claude mcp add frameseq -- npx frameseq mcp talk.slides.ts
codex mcp add frameseq -- npx frameseq mcp talk.slides.ts
```

用 [FrameSeq 应用](app.md)时,把 `npx frameseq` 换成 `frameseq`。FrameSeq Studio 的 [AI 助手](studio.md#ai-助手)会把同一个服务器交给它运行的代理,不需要任何设置。

## 项目脚本

`npm create frameseq` 生成的项目提供:

```bash
npm run dev
npm run studio
npm run present
npm run build
npm run build:single
npm run pdf
npm run pptx
npm run typst
npm run check
```

`npm run check` 同时校验 TypeScript 和渲染后的页面布局。

直接调用本地可执行文件时,用 `npx frameseq ...`。
