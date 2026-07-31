<!-- translation-of: docs/latex.md sha256:565f55b1468217e2 -->

# LaTeX 集成

FrameSeq 可以把一段 LaTeX 表格或其它正文片段编译成普通的演示对象。页面结构、布局、主题、导航和导出仍然由 FrameSeq 负责,片段内部的 LaTeX 排版交给 Tectonic。

## 安装编译器

LaTeX 支持是可选的:

```bash
npm install --save-dev node-tectonic
```

这个包为常见的桌面和 CI 平台提供 Tectonic 可执行文件。Tectonic 首次使用时会下载所需的 LaTeX 文件并缓存在操作系统里;之后的构建会同时复用该缓存和 FrameSeq 基于内容寻址的片段缓存。

由于依赖构建期的原生编译器,这项集成面向本地开发和 CI,而不是 StackBlitz 这类纯浏览器环境。

## 写一个内联表格

用**静态**标签模板,让 JavaScript 原样保留每个反斜杠:

```ts
slide("Experimental results");

latex`
  \begin{tabular}{lrr}
    \toprule
    Model & Accuracy & Latency \
    \midrule
    Baseline & 91.2\% & 18 ms \
    FrameSeq & \textbf{94.6\%} & 12 ms \
    \bottomrule
  \end{tabular}
`
  .width(820)
  .position({ x: 180, y: 210 });
```

结果接受和其它内容对象一样的修饰符,包括 `.width()`、`.position()`、`.color()`、`.style()`、`.showAt()`。它的高度按编译结果的宽高比推算。

## 用独立文件

文件里只放文档**正文片段**:

```tex
% tables/results.tex
\begin{tabular}{lrr}
  \toprule
  Model & Accuracy & Latency \
  \midrule
  Baseline & 91.2\% & 18 ms \
  FrameSeq & \textbf{94.6\%} & 12 ms \
  \bottomrule
\end{tabular}
```

然后挂到当前页:

```ts
latexFile("./tables/results.tex")
  .width(percent(80));
```

路径相对于 `.slides.ts` 入口解析,必须留在该目录内,并且由 Vite 监听变化。

## 可用的导言区

FrameSeq 会把每个片段包进一个紧凑贴合的 `standalone` 文档,并载入这些常用宏包:

- `amsmath` 和 `amssymb`
- `booktabs`
- `array`、`tabularx`、`multirow`
- `xcolor` 和 `graphicx`

公开接口接受的是**片段**而不是完整文档。不要写 `\documentclass`、`\begin{document}` 或 `\end{document}`。静态模板里也不能有 JavaScript 插值。

普通公式请用 FrameSeq 基于 KaTeX 的 `text` 和 `math`。LaTeX 集成最有价值的场景,是你想原样保留现有的 `tabular` 源码或依赖宏包的表格排版。

## 构建与导出行为

```text
静态 LaTeX 片段
        ↓ Vite 转换期间由 Tectonic 编译
定位好的 HTML 字形与线条
        ↓ FrameSeq 内嵌字体并包装结果
一个可缩放的幻灯片对象
```

浏览器端**不含编译器**,也不会去请求宏包。HTML 和 PDF 直接使用内嵌结果。可编辑的 PPTX 导出把片段保留为高分辨率图片,扁平化 PPTX 则与整页一起截取。

## 目前的限制

- `latex` 和 `latexFile()` 要求源码是静态的。
- 输入是正文片段,不是完整的 LaTeX 文档。
- 构建机器需要 `node-tectonic` 支持的平台,并且在 Tectonic 首次拉取宏包时需要网络。
- LaTeX 对象保留自己的 TeX 字体度量;FrameSeq 的主题字体设置**不会**替换这些字体。
- PowerPoint 把编译结果当作一个整体渲染对象,而不是可编辑的表格单元。
