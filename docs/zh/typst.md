<!-- translation-of: docs/typst.md sha256:4b0a641d78e293ba -->

# Typst 集成

演示结构归 FrameSeq,复杂排版归 Typst。你可以把 Typst 片段作为普通的 FrameSeq 对象嵌进来,也可以把整场演示导出成**可编辑的** `.typ` 源码。

## 导出整场演示

```bash
npm run typst
```

默认输出到 `output/typst/slides.typ`。换路径:

```bash
npx frameseq typst slides.ts --output reports/talk.typ
```

FrameSeq 把每一页转换成固定尺寸的 Typst `page`。文字、代码、网格、分栏、局部网格、画布定位、矩形、圆、连线和本地图片都保持为**原生、可编辑**的 Typst 对象。原生的 `typst` 和 `typstFile()` 片段被直接放进生成的源码里。

行内 `$...$` 公式使用 MiTeX 的 `mi()` 函数,`math()` 和公式类的 `latex` 片段使用 `mitex()`,基础 LaTeX 文本片段使用 MiTeX 的实验性 `mitext()` 模式。生成的文件会 import `@preview/mitex:0.2.7`,可以直接编译:

```bash
typst compile output/typst/slides.typ
```

LaTeX 的 `tabular`、`tabular*`、`tabularx` 片段会转换成原生的 Typst `table`。FrameSeq 保留 `l`、`c`、`r` 对齐、定宽与自适应列、常见的 `booktabs` 线条、`\multicolumn`,以及通过 `mitext()` 处理的单元格内 LaTeX 格式。依赖 `\multirow`、嵌套表格或宏包特有命令等不支持结构的表格,则保留编译后的 SVG 作为保真回退。

MiTeX 不是完整的 TeX 引擎:它的文本模式支持常见的文档文字,但不实现任意宏包或每一种 LaTeX 环境。CSS 和 Typst 的布局模型也不同。因此 Tailwind 类、渐变、箭头、不支持的 LaTeX 结构,以及其它没有安全语义映射的属性,会作为**转换说明**列在 `.typ` 文件开头。

## 在 FrameSeq 里嵌入 Typst

## 安装可选编译器

Typst 编译发生在 Vite 构建期间,对不使用 Typst 的项目是可选的:

```bash
npm install --save-dev @myriaddreamin/typst-ts-node-compiler
```

编译器不会进入浏览器打包产物。

## 内联片段

把 `typst` 当作**静态**标签模板使用:

```ts
slide("Optimization");
text("Objective function").lead();

typst`
  #set text(size: 22pt, fill: rgb("#2563eb"))

  $ min_theta sum_(i=1)^n
    loss(f_theta(x_i), y_i) + lambda norm(theta)^2 $
`
  .width(720);
```

FrameSeq 会先给 Typst 片段一个透明、紧凑贴合的页面,再编译成内联 SVG。片段内部的 `#set page(...)` 规则可以刻意覆盖这个行为。

字符串形式也可以:

```ts
typst("#table(columns: 2, [A], [B], [C], [D])");
```

## 外部文件

当图、表或其它片段需要独立编辑时,用 `.typ` 文件:

```ts
typstFile("./figures/architecture.typ")
  .width(percent(100));
```

路径相对于 `.slides.ts` 入口解析,且必须留在该目录内。文件会注册到 Vite,所以开发时保存它会触发重建。文件内部的 Typst import 从同一个工作区解析。

## 样式与布局

返回的对象支持常规修饰符:

```ts
typstFile("./results.typ")
  .width(840)
  .style("rounded-2xl bg-white p-5")
  .showAt(2);
```

FrameSeq 负责外层容器的样式;渲染片段**内部**的颜色、字体、表格线条等细节应当在 Typst 里定义。

## 构建管线

```text
静态 Typst 源码
        ↓ Vite 构建期间由 typst.ts 编译
内联 SVG
        ↓ FrameSeq 布局与运行时
HTML / PDF / PPTX
```

当前的 SVG 输出让复杂排版在浏览器和 PDF 两条路径上保持视觉一致,而运行时不需要加载 Typst 编译器。可编辑的 PPTX 导出把渲染片段捕获为高分辨率图片,`--flatten` 则捕获整页。

## 嵌入片段的限制

- 标签模板必须是静态的,暂不支持 JavaScript 插值。
- `typstFile()` 需要静态字符串路径。
- Typst 目前渲染为 SVG,而不是语义化 HTML 或 MathML。
- FrameSeq 主题不会自动改变 Typst 片段内部的样式。
- FrameSeq 主题负责导出后的演示结构,原生 Typst 片段里的声明仍由片段作者掌控。
