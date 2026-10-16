<!-- translation-of: docs/content.md sha256:31c570c03ec4e331 -->

# 内容

每个内容命令都会往当前区域加一个对象,并返回一个可链式调用的构建器。

每个常用命令的定义、签名、参数、返回值和一个聚焦的例子,见 [Function reference](../function-guide.md)(英文)。

## 文字

```ts
text("A normal paragraph");

text("A highlighted sentence")
  .size(pt(28))
  .color("#38bdf8")
  .bold();
```

文字**角色**提供了带演示语义的默认值:

```ts
text("Main title").hero();
text("Supporting message").subtitle();
text("Ada Lovelace").author();
text("SECTION 01").eyebrow();
text("The important idea").lead();
text("Source: Example").caption();
text("A memorable sentence").quote();
```

在同一个对象上再调用另一个角色,会替换掉前一个角色。

### 部分文字的格式

可以像 Markdown 那样,只标记一段文字里的几个字:

```ts
text("Revenue **grew** 42% *since* May");
text("Latency fell to [12 ms]{green}, errors to [**0.1%**]{accent}");
bullets("Ship the **beta**", "Fix [three]{red} open bugs");
```

- `**文字**` 加粗,`*文字*` 变成斜体。
- `[文字]{颜色}` 给文字上色。颜色可以是色调(`blue`、`sky`、`teal`、`green`、`lime`、`amber`、`orange`、`red`、`pink`、`purple`、`indigo` 或 `gray`),主题的 `accent` 或 `muted`,也可以是 CSS 颜色,比如 `#e11d48`。
- 标记可以嵌套,比如 `[**0.1%**]{accent}`。

凡是画文字的地方都能用这些标记:任何角色的文字、列表项和步骤、表格单元格、卡片和指标、形状和方框的标签,以及封面信息。页面标题、代码和公式里的字符按原样显示。不构成标记的星号或方括号也按原样显示,比如 `5 * 3` 或 `see [1]`;要让一个本会被当作标记的字符按原样显示,在它前面加反斜杠:`\*`、`\[`、`\]`、`\{` 或 `\}`(写在带引号的字符串里时,反斜杠要写两个,比如 `"\\*"`)。行内公式里的星号属于公式。

导出 PDF、PNG、PPTX 和 Typst 时,这些标记都会保留,PowerPoint 里得到的是可以继续编辑的加粗、斜体和彩色文字段。在 FrameSeq Studio 里[在幻灯片上输入文字](studio.md#在幻灯片上输入文字)时,看到的是加粗、斜体和颜色本身,而不是标记字符;用 `Ctrl+B`、`Ctrl+I` 或文字上方的工具条来设置。

### 让文字适应空间

`.fit()` 会缩小对象里的文字,直到对象装得下为止,默认最多缩到原来的一半:

```ts
slide("Abstract");
text(abstract).fit();
references().fit(0.6);
```

对象里的所有字号一起缩放,所以列表、卡片或参考文献表保持原有比例,行内公式也跟着周围的文字一起缩放。对象占用它所在区域剩下的空间,页面上其他内容的位置不变。缩到最小仍然放不下的部分会被裁掉,`frameseq check` 会报告出来。独立公式会自动这样做:比所在区域宽的公式会缩小到正好放下。

## 行内公式

行内公式写在 `$` 之间:

```ts
text`Euler's identity is $e^{i\pi} + 1 = 0$.`;
```

标签模板形式会保留 LaTeX 的反斜杠。要写字面意义的美元符号,用 `\$`。

## 独立公式

独立公式用 `math` 模板标签:

```ts
math`\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}`;
```

字符串形式也可以,但要遵守 JavaScript 的转义规则:

```ts
math("\\frac{a}{b}");
```

FrameSeq 用 KaTeX 渲染公式。不支持的 LaTeX 命令会显示成一处公式错误,而不会让整场演示挂掉。

复杂的局部排版见 [Typst integration](../typst.md)(英文);想直接复用现成的 LaTeX `tabular` 片段,见 [LaTeX integration](../latex.md)(英文)。

## 代码

```ts
code(`const answer = 42;`, "ts");
```

第二个参数记录语言,默认 `"ts"`。0.1 版把代码按原样渲染为预格式化文本,不做语法高亮。

## 图片

```ts
image("https://example.com/diagram.png", "System diagram");
```

有信息量的图片一定要写有用的替代文本。如果资源就放在幻灯片源码旁边,交给 Vite 解析 URL:

```ts
const diagram = new URL("./assets/diagram.png", import.meta.url).href;
image(diagram, "Compiler pipeline");
```

图片对象支持常规的尺寸和外观修饰符:

```ts
image(diagram, "Compiler pipeline")
  .width(percent(100))
  .radius(18);
```

## 表格

`table(rows)` 接收若干行,每行是一组单元格;第一行是表头:

```ts
table([
  ["Model", "Accuracy", "Latency"],
  ["Baseline", "91.2%", "18 ms"],
  ["FrameSeq", "94.6%", "12 ms"],
]);
```

表格按论文里的样式画线:上下各一条粗线,表头下一条细线。一列里的单元格如果全是数量,比如 `94.6%` 或 `12 ms`,这一列右对齐,其他列左对齐。单元格里可以用 `$` 写行内公式。

```ts
table(rows)
  .header(2)                       // 两行表头;0 表示没有表头
  .columnAlign("left", "center")   // 从第一列起;其余列保持原来的对齐
  .striped();                      // 隔行加底色
```

导出 PowerPoint 时它是一个 PowerPoint 表格,单元格仍是可编辑的文字;导出 Typst 时是原生的 `#table`。单元格里有公式的表格会导出为图片,因为 PowerPoint 的单元格只能放纯文本。已经用 LaTeX 写好的表格,见 [LaTeX 集成](latex.md)。

## 图表

`chart(kind, data)` 用写在旁边的数字画一张图表:

```ts
chart("bar", { Q1: 12, Q2: 18, Q3: 25 }).unit("%");

chart("line", {
  labels: ["Jan", "Feb", "Mar", "Apr"],
  series: { Revenue: [3, 5, 4, 7], Cost: [2, 2, 3, 3] },
});

chart("donut", { Search: 52, Direct: 31, Social: 17 });
```

种类有 `"bar"`、`"hbar"`(横向条形)、`"line"`、`"pie"` 和 `"donut"`。一组数据写成 `{ 标签: 数值 }`;多组数据写成 `{ labels, series: { 名称: 数值 } }`,每个标签对应一个数值。第一组数据使用主题的强调色。

| 修饰符 | 作用 |
| --- | --- |
| `.unit(" ms")` | 在数值后面加上单位。 |
| `.values(false)` | 隐藏每个柱子、点或扇区旁的数值。 |
| `.legend(true)` | 显示或隐藏图例;多组数据和饼图会自动显示。 |
| `.max(100)` | 固定数值轴的上限,让几张图表用同一个刻度。 |
| `.colors("#0f766e", "#f59e0b")` | 依次给各组数据、或饼图的各扇区上色。 |

图表默认铺满所在区域的宽度、宽高比 16:9,`.width()` 或 `.height()` 可以改;它的文字跟随 `.size()`。FrameSeq 按图表的实际尺寸来画,所以在窄栏里标签也清晰可读。导出 PowerPoint 时它是用同一份数据画的 PowerPoint 图表,可以在 PowerPoint 里编辑;导出 Typst 时嵌入这张图。

## 二维码

`qr(text)` 把一个链接或任何文字变成观众可以用手机扫的二维码:

```ts
qr("https://pride7.github.io/frameseq/").width(220);
```

默认是 200 像素见方,深色码点、浅色底,并留出扫码器需要的静区,放大缩小都清晰。

## 图标

`icon(name)` 加入一个 [Lucide](https://lucide.dev/icons) 图标,用文字颜色、按字号大小绘制:

```ts
icon("rocket");
icon("chart-line").size(64).color("#0f766e");
```

TypeScript 知道每个图标的名字,所以编辑器能补全,拼错的名字在页面运行前就会画上波浪线。预览时整套图标都可用;构建出的演示只包含源码里写到的图标,所以请用字符串写图标名,而不要在运行时拼出名字。

## 引用

`cite()` 给参考文献里的条目编号,在每一页底部列出这一页引用的条目,`references()` 加入完整的参考文献表。见[引用与参考文献](citations.md)。

## 图形

用 `shape()` 画菱形、圆柱、云这类示意图轮廓,用 `rect()` 和 `circle()` 画普通的盒子,用 `line()` 画它们之间的连线,全部直接写在源码里:

```ts
slide({ name: "Pipeline" }).canvas();

rect("Input").as("input").position({ x: 80, y: 125 }).width(240).height(110);
shape("cylinder", "Orders").as("orders").position({ x: 760, y: 100 }).tone("purple");
line().from("input").to("orders").route("elbow").arrow();
```

所有轮廓、配色、走线方式和标签,以及自定义 SVG,见 [图形与连线](shapes.md);把这些图元组合成不用写坐标的图,见 [画图](diagrams.md)。

## 要点列表

```ts
bullets(
  "Linear source code",
  "Useful layout defaults",
  "HTML and PDF output",
);
```

`bullets()` 生成一个立即全部可见的无序列表。

## 分步列表

```ts
steps(
  "Parse the document",
  "Build the page tree",
  "Render the presentation",
);
```

`steps()` 生成一个有序列表,翻页时逐条揭示。

想自定义渐进揭示,在任意内容对象上用 `showAt()`:

```ts
text("First reveal").showAt(1);
image(diagram, "Diagram").showAt(2);
```

## 指标

`metric(value, label)` 生成一个小的数据强调对象。第一个参数作为醒目的主值显示,第二个是解释这个值的小标签。

```ts
metric("42%", "Growth");
```

呈现出来的是"**42%** —— Growth"这种视觉结构。FrameSeq 只显示你给的字符串,**不做计算也不做格式化**。指标适合短的"数字 + 标签"组合,不适合放句子或段落。

几个可比的事实并排放进网格时,指标最有用:

```ts
slide("Results").grid(3);

cell(0); metric("42%", "Growth");
cell(1); metric("18K", "Users");
cell(2); metric("99.9%", "Uptime");
```

如果网格只占页面的一部分,把指标对象直接传给 `gridSection()`:

```ts
text("Quarterly results");

gridSection(
  3,
  metric("42%", "Growth"),
  metric("18K", "Users"),
  metric("99.9%", "Uptime"),
);

text("All targets were exceeded.");
```

`metric()` 返回它创建的对象,所以可以继续加样式,或者变成标准卡片:

```ts
metric("42%", "Revenue growth")
  .card()
  .background("#eff6ff");
```

## 卡片

`card(title, content?)` 生成一个带边框的"标题 + 正文"面板,适合短的特性、选项或小结。

```ts
card("Portable", "Export HTML, PDF, and editable PPTX.");
```

普通段落用 `text()`,关键数值用 `metric()`;当标题和它的说明句应当作为**一个整体**被阅读时,用 `card()`。

## 分组

`group(...items)` 把多个对象合成一个纵向对象。当某个网格单元里的子项需要不同的文字角色或样式时,它很有用。

```ts
group(
  text("Revenue").bold(),
  text("$1.2M").size(42),
).card();
```

子对象照常创建,然后 `group()` 把它们变成一个可整体移动、整体加样式的单元。`group()` 也接受名字(`group("a", "b")`),这样连局部变量都不需要。每个常用创作函数的简明说明和例子见 [Function reference](../function-guide.md)(英文)。
