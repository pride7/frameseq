<!-- translation-of: docs/content.md sha256:27699a9086d2b794 -->

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

## 图形

用 `rect()`、`circle()`、`line()` 直接在源码里搭可编辑的图:

```ts
slide({ name: "Pipeline" }).canvas();

line({ x1: 320, y1: 180, x2: 520, y2: 180 }).arrow("end");
rect("Input").position({ x: 80, y: 125 }).width(240).height(110);
circle("Model").position({ x: 520, y: 100 }).width(160);
```

填充、描边、箭头方向、坐标行为和自定义 SVG 见 [Shapes and connectors](../shapes.md)(英文);把这些图元组合成不用写坐标的图,见 [Diagrams](../diagrams.md)(英文)。

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
