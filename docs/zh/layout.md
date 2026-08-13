<!-- translation-of: docs/layout.md sha256:07a5f2ef47ad99e2 -->

# 布局

FrameSeq 的默认值是好用的单栏排版。只有当某一页真的需要一个有意义的构图时,才加布局。

每个布局函数的签名、参数、行为和一个紧凑的例子,见 [Function reference](../function-guide.md)(英文)。

## 标准页

```ts
slide("One idea");
text("A standard page has a heading and a vertical content region.");
bullets("First point", "Second point");
```

## 居中页

```ts
slide({ name: "Quote" }).center();
text("Simplicity is a feature.").quote();
```

`center()` 把正常内容区域水平和垂直都居中。

## 只让一个对象居中

`center()` 居中的是整个区域。如果页面上其他内容应该待在原地,就只居中那一个对象:

```ts
slide("Result");
text("The measurement that matters");
text("94.6% accuracy").width(520).centerSelf();
bullets("Held-out set", "Three seeds");
```

`centerSelf()` 让一个对象在所属区域的交叉轴上居中——在列里是水平居中,在行里是垂直居中——同级对象不受影响。`selfAlign("start" | "center" | "end" | "stretch")` 可以选其他对齐方式。

对象默认在交叉轴上拉伸,所以只有当它自己有尺寸时才会移动:在列里是 `.width(...)`,在行里是 `.height(...)`。没有宽度时,对象本来就和区域一样宽,这时用 `textAlign("center")` 居中的是里面的文字:

```ts
text("Centered words in a full-width object").textAlign("center");
```

想让一个对象在两个轴上都居中、又不居中整个区域,就给它一个自己的区域:

```ts
at("hero").center().grow();
text("94.6% accuracy").width(520);
```

`grow()` 让这个区域吃掉剩余的高度,`center()` 才有垂直方向的空间可用。

## 分栏页

```ts
slide("Architecture").split("40:60");

image(diagram, "Compiler diagram");

right();
text("Compiler").lead();
bullets("TypeScript DSL", "HTML renderer", "PDF export");
```

写在 `split()` 之前的内容会移进左栏,之后的内容也从左栏开始。用 `right()` 和 `left()` 切换去处。

接受的比例写法:

```ts
slide("A").split();            // 1:1
slide("B").split("40:60");    // 比例字符串
slide("C").split([2, 3]);      // 数字对
slide("D").split(0.4);         // 左侧占比
slide("E").split(40);          // 左侧百分比
```

比例两侧都必须是正数。

## 网格页

```ts
slide("Results").grid(3, 20);

cell(0);
metric("42%", "Growth");

cell(1);
metric("18K", "Users");

cell(2);
metric("99.9%", "Uptime");
```

格子序号从 0 开始,列数支持 1–12。写在 `grid()` 之前的内容会移进第 `0` 格。

## 局部网格

只有页面的一部分需要网格时,用 `gridSection()`。传进去的每个对象成为一格,而这一段仍然夹在前后的普通内容之间:

```ts
slide("Results");
text("Performance this quarter");

gridSection(
  3,
  metric("42%", "Growth"),
  metric("18K", "Users"),
  metric("99.9%", "Uptime"),
).gap(20);

text("All targets were exceeded.");
```

格子按源码顺序填充,条目多于列数时自动换行。字符串模板可以做不等宽的列:

```ts
gridSection(
  "1fr 2fr",
  card("Context", "A compact supporting point"),
  card("Main result", "Give the primary result more room"),
);
```

一格里要放多个对象时,用 `group()`:

```ts
gridSection(
  2,
  group(text("Revenue").bold(), text("$1.2M").size(42)).card(),
  group(text("Users").bold(), text("18K").size(42)).card(),
);
```

`gridSection()` 表达的是一处局部的父子关系,而不需要手工选格子。卡片行、指标、特性对比这类规整的二维排列,优先用它,而不是画布。

## 先命名容器,再写内容

当容器比里面的对象更值得先写出来时,用 `at()` 给它起名,然后照常写内容 —— 什么都不需要局部变量:

```ts
at("diagram").canvas().width(640).height(280).clip();

rect("Input").position({ x: 40, y: 80 });
circle("Model").position({ x: 360, y: 60 });
```

容器的 `.canvas()` 建立一个局部坐标系,所以 `.position()` 的值相对于这个容器而不是整页。`.clip(false)` 允许定位的子对象溢出边界。

反过来,当对象先写、容器后定时,给对象起名,事后收拢它们:

```ts
card("Quality", "Higher is better").as("quality");
metric("94.8%", "Accuracy").card().as("accuracy");

gridSection(2, "quality", "accuracy").gap(20);
```

每个对象都由普通的线性命令创建,然后**一次性**移进网格,不会被渲染两遍。这些对象必须属于同一页的当前区域。

## 区域路径

`at(path)` 把创作光标移到由路径寻址的区域,并沿途创建它命名的容器。它是嵌套的平铺替代品:每个对象仍是一条语句,不需要收尾调用 —— 因为下一次 `at()` 就是上一个区域的终止。

```ts
slide("Roadmap").grid(2);

at("cell0/now").card();
text("Q3").eyebrow();
bullets("Anchors", "Region paths");

at("cell1/next").card();
text("Q4").eyebrow();

at("cell0/now");
text("Merged into main").caption();
```

**第一段**可以寻址布局已经拥有的区域 —— `main`、`left`、`right`、`cell0`、`cell1` 等等,所以 `at("cell1")` 和 `cell(1)` 选中的是同一个区域。其余每一段都在第一次用到时创建,深度不限:

```ts
at("notes").row().gap(24);
at("notes/left");
text("Left copy");
at("notes/right");
text("Right copy");
```

区域也可以是网格,这是写矩阵更短的方式:

```ts
at("cards").grid(3).gap(20);
card("First", "…");
card("Second", "…");
card("Third", "…");
```

**布局在路径第一次出现的地方设置**,之后直接写裸路径即可。再次访问同一路径会返回同一个区域并继续追加,所以一页可以按读起来最顺的顺序写,而不必按容器嵌套的顺序写。路径的作用域是当前页:下一页的同名路径是新的区域。

画图相关的用法见 [Diagrams](../diagrams.md)(英文),那里讲区域路径、行列和连线怎么组合成一张不含坐标的页面。FrameSeq 会把每条路径注册成锚点名,所以定位过的区域可以像任何对象一样被连线引用:

```ts
slide("Stages").canvas();

at("stages").canvas().position({ x: 200, y: 60 }).width(400).height(300);
rect("Parse").as("parse").position({ x: 20, y: 40 });

at("");
rect("Output").as("output").position({ x: 800, y: 100 });
line().from("output").to("stages");
```

## 回到主区域

```ts
main();
```

`main()` 选中普通正文、split 的左栏,或 grid 的第一格。开始新的一页会自动重置区域。

## 区域间距

```ts
gap(24);
```

`gap()` 改变当前区域内子对象之间的间距。数字是像素,也接受单位助手。

## 满版图片

```ts
slide({ name: "Landscape" }).fullBleed(photo, "Mountain landscape");
```

当图片应当占满整页、不要标准标题时,用不带 `title` 的对象形式 `slide()`。

## 自由画布

把当前页的正文变成定位画布,然后给任意元素设精确坐标:

```ts
slide({ name: "System map" }).canvas();

text("Compiler")
  .position({ x: 80, y: 90 })
  .width(320)
  .size(32)
  .bold();

image("diagram.png", "Compiler diagram")
  .position({ x: 500, y: 80 })
  .width(620);
```

`x` 和 `y` 相对于当前画布区域。普通数字是像素,也接受单位助手。FrameSeq 把固定的演示画布作为一个整体来映射,所以定位过的元素在交互式 HTML、PDF 和 PPTX 里保持相同的相对位置。

需要先创建对象、再挂载时,也可以用显式对象 API:

```ts
import { Slides, Text, Image, px } from "@pride7/frameseq";

const slides = Slides("Diagram");
const page = slides.slide({ name: "Canvas" }).canvas();

page.custom(
  Text("Compiler").size(32).bold().position({ x: px(80), y: px(90) }).width(px(300)),
  Image(diagram, "Compiler diagram").position({ x: px(520), y: px(120) }).width(px(620)),
);

export default slides;
```

多数页面优先用结构化布局,只在图表和刻意的自由构图上用画布。图元本身见 [Shapes and connectors](shapes.md)。
