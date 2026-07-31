<!-- translation-of: docs/cli.md sha256:dd5404701fdf531f -->

# CLI 参考

npm 包会安装 `frameseq` 可执行文件。

## 新建幻灯片文件

```bash
frameseq new [file]
```

不给文件名时,FrameSeq 在当前目录创建 `slides.ts`。

```bash
frameseq new quarterly.slides.ts
```

这条命令**拒绝覆盖已存在的文件**。

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
frameseq pdf [file] [--output path]
```

默认输出到 `output/pdf/<入口名>.pdf`。

```bash
frameseq pdf quarterly.slides.ts
frameseq pdf quarterly.slides.ts --output reports/quarterly.pdf
```

PDF 导出会启动无头浏览器,渲染所有页面和揭示步骤,并写出按页尺寸、含背景的 PDF。

## 导出 PowerPoint

```bash
frameseq pptx [file] [--output path] [--flatten]
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
frameseq typst [file] [--output path]
```

默认输出到 `output/typst/<入口名>.typ`。

```bash
frameseq typst quarterly.slides.ts
frameseq typst quarterly.slides.ts --output reports/quarterly.typ
```

导出器写出可编辑的 Typst 页面,通过 MiTeX 映射 LaTeX 公式和基础文本,并把常见的 LaTeX `tabular` 片段转换成原生 Typst 表格。原生 Typst 片段保持源码形式;不支持的 LaTeX 和 CSS 特性使用有文档说明的回退或转换说明。见 [Typst integration](typst.md)。

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

**错误**返回非零退出码;**警告**只在严格模式下失败。JSON 输出包含页码与标签、FrameSeq 对象类型与路径、测量到的几何,以及修改建议。见 [面向 AI 的布局检查](layout-checks.md)。

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

## 项目脚本

`npm create frameseq` 生成的项目提供:

```bash
npm run dev
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
