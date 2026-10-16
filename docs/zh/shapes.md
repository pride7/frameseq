<!-- translation-of: docs/shapes.md sha256:c6271843df5a4a58 -->

# 图形与连线

FrameSeq 用一小组图元来画图:有 27 种轮廓的 `shape()`,从流程图符号到块状箭头;按你自己给的顶点画出的 `polygon()`;`rect()` 和 `circle()` 两种盒子;以及 `line()` 连线,它可以在命名对象之间走直线、直角折线或曲线。它们导出后都**仍然可以编辑**:PowerPoint 拿到的是它自己的预设形状和线条,Typst 拿到的是多边形和曲线。

## 先切到画布

图形也可以参与普通布局,但画图通常需要显式坐标:

```ts
slide({ name: "Pipeline" }).canvas();
```

坐标相对于当前的画布区域。FrameSeq 把最终的演示画布当作一个整体来映射,所以同一份构图在交互式 HTML、PDF 和 PPTX 里保持相同的相对几何关系。

## 形状

`shape(kind, label)` 画出一个轮廓,标签可选:

```ts
shape("diamond", "Valid?").position({ x: 520, y: 200 });
shape("cylinder", "Orders").position({ x: 900, y: 180 }).width(180).height(160);
```

| 分组 | 种类 |
| --- | --- |
| 基本形状 | `rect`、`rounded`、`pill`、`ellipse`、`circle`、`diamond`、`triangle`、`pentagon`、`hexagon`、`octagon`、`parallelogram`、`trapezoid`、`star`、`plus` |
| 示意图符号 | `cylinder`(数据库)、`document`、`note`、`cube`、`cloud`、`callout` |
| 箭头与步骤 | `chevron`、`step`、`arrow-right`、`arrow-left`、`arrow-up`、`arrow-down`、`arrow-both` |

每种形状都有一个默认大小,比如菱形是 200 × 140,圆柱是 160 × 150,`width()` 和 `height()` 会替换它。只给了宽度的 `circle` 会保持正圆。

标签放在轮廓**自己的文字区**里:菱形的中间一半、圆柱顶面之下、箭头的箭杆上。它支持和 `text()` 一样的行内 `$...$` 公式,并可以用 `size()`、`weight()` 和 `color()` 调整样式。

比例沿用 PowerPoint 的预设形状,所以燕尾箭头的尖角、圆柱的顶沿在拉伸时保持原有的深度,导出后的形状也和幻灯片上一样。

## 多边形

当没有哪种形状正好是图里需要的轮廓时,比如一个从一侧收窄到另一侧的编码器,`polygon(points, label)` 按你自己给的顶点画出它:

```ts
polygon([[0, 0], [64, 47], [64, 153], [0, 200]], "Encoder")
  .position({ x: 190, y: 370 })
  .tone("gray");
```

顶点是 `[x, y]` 像素,从任意原点量起,按轮廓的顺序排列。多边形的大小就是这些顶点所占的范围,这里是 64 × 200;它和其它形状一样用 `position()`、`anchor()` 或 `rightOf()` 这类定位来放置。`width()` 和 `height()` 会拉伸它,每个顶点在盒子里的相对位置不变。多边形至少要有三个顶点,而且它们必须在横向和纵向上都有跨度。

除此之外,多边形就是一个形状:`tone()`、`fill()`、`stroke()`、`dashed()` 和 `shadow()` 给它上色,标签居中放在它的盒子里,连线接到这个盒子的边上。

## 用 `tone()` 上色

一个颜色就能给整个形状上色:填充、轮廓和标签。

```ts
shape("rounded", "Ingest").tone("blue");               // 柔和的浅色,默认样式
shape("pill", "Start").tone("green", "solid");         // 用这个颜色本身填充
shape("hexagon", "Gateway").tone("indigo", "outline"); // 在背景色上画出这个颜色的轮廓
```

可用的颜色名有 `accent`(主题自己的强调色)、`blue`、`sky`、`teal`、`green`、`lime`、`amber`、`orange`、`red`、`pink`、`purple`、`indigo` 和 `gray`;任何 CSS 颜色,比如 `"#0f766e"`,也可以。浅色是**按主题算出来的**,所以同一份文档在深色主题下会得到更深的填充和更亮的标签。没有 `tone()` 的 `shape()` 是强调色的柔和浅色。

`fill()`、`stroke()` 和 `color()` 仍然决定它们各自指定的部分,`strokeWidth()` 设置轮廓的粗细。还有两个修饰符用来收尾:

```ts
shape("cloud", "Internet").tone("sky").shadow(); // 下方一层柔和的阴影
shape("rounded", "Optional").dashed();           // 虚线轮廓
```

`tone()`、`shadow()` 和 `dashed()` 对 `rect()` 和 `circle()` 同样有效。

## 矩形和圆

`rect()` 和 `circle()` 是带边框的盒子,它们和其它内容一样可以参与行或列:

```ts
rect("TypeScript")
  .position({ x: 80, y: 125 })
  .width(240)
  .height(110)
  .fill("#dbeafe")
  .stroke("#2563eb")
  .strokeWidth(3)
  .radius(18)
  .size(24)
  .color("#172554");
```

不设高度的矩形是 240 × 96,这也是它的最小高度。调用 `height()` 会**解除**这个最小值,所以更矮的形状会按你要求渲染;想保留自己的下限,在 `height()` 之前调用 `minHeight()`。

没有标签的 `rect()` 或 `circle()` 不带内边距,所以小的盒子,比如一排色块里的一格,会保持你给的大小:

```ts
rect().width(30).height(30).radius(3).fill("#f4b42c").stroke("#e8a92a");
```

```ts
circle("FrameSeq")
  .position({ x: 520, y: 100 })
  .width(160)
  .fill("#cffafe")
  .stroke("#0891b2")
  .strokeWidth(3);
```

想保持正圆就只设 `width()`。宽高设成不同的值会得到椭圆。

## 线与箭头

```ts
line({ x1: 320, y1: 180, x2: 520, y2: 180 })
  .stroke("#2563eb")
  .strokeWidth(4)
  .arrow("end");
```

线的坐标是当前画布区域内的像素数值。支持的箭头位置有:

```ts
.arrow("none")
.arrow("start")
.arrow("end")
.arrow("both")
```

不带参数调用 `.arrow()` 等同于 `.arrow("end")`。不调用 `arrow()` 时线没有箭头。

### 对象之间的连线

一条线通常连接两个命名对象,并在它们移动时跟着走:

```ts
line().from("cache").to("reply").arrow();
```

命名、锚点和自动布局见 [画图](diagrams.md)。

### 走线方式

`route()` 决定连线怎么走:

```ts
line().from("check.right").to("reply.right").route("elbow").arrow();
line().from("service").to("database").route("curve").arrow();
```

- `"straight"`,默认值,是两端之间最短的直线。
- `"elbow"` 按直角转弯。它垂直地离开和进入对象的边,并且**绕开**画布上的其它对象而不是从中穿过,就像流程图里的连线那样。
- `"curve"` 是一条平滑曲线,同样垂直地离开和进入对象。

### 标签与虚线

```ts
line().from("check").to("run").arrow().label("no");
line().from("worker").to("queue").route("curve").dashed().label("async");
```

`label()` 在连线中点写一小段文字,文字底色是幻灯片背景,所以线会在它后面断开。`dashed()` 把线画成虚线,适合表示可选或异步的步骤。

## 在 FrameSeq Studio 里画

在 [FrameSeq Studio](studio.md#在幻灯片上画对象) 里,**插入**会打开一个图形库,包含所有形状,以及文本框、直线、箭头、连接线和多边形。选一个,在预览里的幻灯片上拖出来,多边形则逐个单击放下顶点:FrameSeq 会把命令连同你画出的坐标和大小写进源码,之后你可以继续拖动和缩放它。把连接线从一个对象拖到另一个对象,会给还没有名字的对象起名,并写出一条跟随它们的 `line().from().to()`。

## 组合成一张图

命名、自动布局和连线在 [画图](diagrams.md) 里讲,那一页展示如何做出**所有对象都不带坐标**的图。下面几个习惯能让图更好读:

- 同一层级的对象用同样的大小,并用 `row()` 或 `column()`、`gap()` 和 `align("center")` 排列,而不是写坐标。
- 大多数框保持中性,用 `tone("gray")`、细轮廓和常规字重的标签,就像论文里的插图那样。颜色只留给需要标出的东西,一类东西用一种色相,只把最重要的那一个形状设成 `solid`。
- 让连线退到后面:`stroke("var(--frameseq-muted)")` 和 `strokeWidth(2)` 把它们画成细的灰线,箭头也小,在任何主题下都一样。
- 流程图和树用折线连线,较松散的关系用曲线,相邻对象之间用直线。标签控制在一两个词。

## 层叠顺序

对象按源码顺序绘制。希望连线压在节点下面时,就把它们写在前面:

```ts
slide({ name: "Flow" }).canvas();

line({ x1: 300, y1: 200, x2: 520, y2: 200 }).arrow();

rect("Input").position({ x: 60, y: 150 }).width(240).height(100);
rect("Output").position({ x: 520, y: 150 }).width(240).height(100);
```

需要显式控制层叠时,在节点或连线上用 `.style({ zIndex: 2 })`。

## 揭示与变换

图形使用普通的元素修饰符:

```ts
rect("Second step")
  .position({ x: 420, y: 160 })
  .rotate(-3)
  .showAt(2);
```

在交互模式下,`showAt()` 跟随这一页的揭示步骤;PDF 和 PPTX 输出会显示所有步骤。

## 在 PowerPoint 和 Typst 里

可编辑的 PPTX 导出会把每个 `shape()` 变成 PowerPoint 自己的同款预设形状,比如菱形、圆柱或云,所以在那里还能重新上色、缩放,或者换成另一种形状。`polygon()` 变成经过同样顶点的任意多边形,在 PowerPoint 里可以逐点编辑。矩形和圆变成矩形和椭圆,直线变成线条,折线和曲线连线变成路径,箭头、虚线和标签都会保留。

Typst 导出把形状和多边形画成 `polygon` 和 `curve` 元素,把连线画成带箭头的直线和曲线,全部是可编辑的 Typst。阴影不会导出。

## 自定义 SVG 图形

当图里需要 logo、插图或其它超出内置图元的几何时,用 `image()` 引入 SVG 文件:

```ts
const artwork = new URL("./assets/custom-shape.svg", import.meta.url).href;

image(artwork, "Custom vector diagram")
  .position({ x: 760, y: 80 })
  .width(280);
```

这样图形在浏览器和 PDF 里保持矢量。常见的符号用 [`icon()`](content.md#图标) 就够了,不需要自己准备文件。
