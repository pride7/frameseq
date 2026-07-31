<!-- translation-of: docs/diagrams.md sha256:1b63ecd49da65651 -->

# 画图

一张图是四个决定,FrameSeq 让每个决定各归一条命令:

| 决定什么 | 用什么 |
| --- | --- |
| 对象属于哪个容器 | `at(path)` |
| 容器怎么排布内容 | `row()`、`column()`、`gap()` |
| 容器自己在哪 | `anchor()` 或 `position()` |
| 对象之间什么关系 | `as()`、`from()`、`to()`、`rightOf()` 等 |

这里没有一样东西需要嵌套源码;除非你自己想写,否则也不需要任何坐标。

## 先切到画布

```ts
slide({ name: "Pipeline" }).canvas();
```

`canvas()` 把页面正文从普通的自上而下流式排版切换成"摆放"模式。`rect()`、`circle()`、`line()` 这些图元本身见 [Shapes and connectors](shapes.md)。

## `at()` 移动光标

`at(path)` 是**光标**,不是构造器。写在它后面的每个对象都属于那个区域,直到下一次 `at()`:

```ts
at("notes");
text("First line");    // 进入 notes
text("Second line");   // 进入 notes
at("");                // 回到这一页的默认区域
```

路径用 `/` 分段,规则只有三条:

- **第一段**可以是布局已经拥有的区域 —— `main`、`left`、`right`、`cell0`、`cell1` 等等。`at("cell1")` 和 `cell(1)` 是同一个区域。
- **其余每一段**在第一次用到时创建,深度不限。
- **再次访问同一路径**会返回同一个区域并继续追加,所以一页可以按读起来最顺的顺序写。

路径属于当前页,下一次 `slide()` 时重置。

## `row()` 和 `column()` 排布内容

`at()` 建出来的区域**已经是纵向 flex 容器**,所以 `column()` 通常是多余的,真正常用的是 `row()`:

```ts
at("stages").row().gap(80);
rect("Parse").as("parse");     // 不需要坐标
rect("Build").as("build");
rect("Render").as("render");
```

只要里面的对象将来要被连线引用,`gap()` 就**必须显式写出来**。不写的话区域会从主题继承间距,而主题可以换值,所以 FrameSeq 拒绝去猜它。

### 排成矩阵时用 grid

嵌套的行能拼出矩阵,`grid()` 也能,而且只用一个容器:

```ts
at("cells").grid(3).gap(20).width(800).anchor("center");
rect("Parse").as("parse").height(120);
rect("Build").as("build").height(120);
rect("Render").as("render").height(120);
rect("Cache").as("cache").height(120);
```

条目先填满一行再换下一行,所以第四个落在第一个的下面。等宽列要分割容器的宽度,所以用列数写的 grid 需要 `width()`;改成用像素给轨道 —— `grid("200px 300px")` —— 就不需要。

## `anchor()` 摆放容器

```ts
at("stages").row().gap(80).anchor("center");
at("legend").column().gap(8).anchor("bottom-right", 40);
```

`anchor()` 用的是和连线锚点同一套九个方位,外加一个可选的边距。有了它,上面那张图**任何地方都不含坐标**。需要精确摆放时改用 `position({ x, y })`。

用 `anchor()` 摆放的对象会成为**它自己的坐标空间**,所以把它的连线写在它内部:

```ts
at("stages").row().gap(80).anchor("center");
rect("Parse").as("parse");
rect("Build").as("build");
line().from("parse").to("build").arrow("end");   // 写在 "stages" 里面
```

连线和其它对象一样服从光标,它的坐标属于它落进的那个容器。**这是唯一一条值得记住的规则。**

## 嵌套撑起第二个维度

行和列可以互相嵌套,而路径就是嵌套关系:

```ts
slide({ name: "Matrix" }).canvas();

at("matrix").column().gap(30).anchor("center");
at("matrix/top").row().gap(24);
rect("Encoder").as("encoder");
rect("Decoder").as("decoder");
at("matrix/bottom").row().gap(24);
rect("Cache").as("cache");
rect("Router").as("router");

at("matrix");
line().from("encoder").to("cache").arrow("end");
line().from("decoder").to("router").arrow("end");
```

嵌套的行或列**有多大,取决于它排出来的布局**;而它在另一个轴上的尺寸由外层容器决定 —— 和 flexbox 完全一样。

## 命名与连线

手算的坐标在图一改动就崩。用 `as()` 给对象起名,然后让其它对象引用它、而不是引用数字:

```ts
slide({ name: "Training loop" }).canvas();

rect("Encoder").as("enc").position({ x: 80, y: 140 }).width(200).height(100);
rect("Decoder").as("dec").rightOf("enc", 140);
circle("Loss").as("loss").rightOf("dec", 140);

line().from("enc").to("dec").arrow("end");
line().from("dec").to("loss").arrow("end");
line().from("loss.bottom").to("enc.bottom").arrow("end");

text("shared vocabulary").caption().below("enc", 16);
```

名字在一页之内唯一,而且**可以在被命名的对象之前引用**,所以连线仍然可以写在前面以控制层叠。受影响的只有 `position()` 和摆放修饰符,对象的其它性质都不变。

### 摆放修饰符

| 修饰符 | 效果 |
| --- | --- |
| `.rightOf(name, gap = 40)` | 左边缘接在目标右侧,垂直居中对齐目标 |
| `.leftOf(name, gap = 40)` | 右边缘接在目标左侧,垂直居中对齐目标 |
| `.below(name, gap = 24)` | 上边缘接在目标下方,水平居中对齐目标 |
| `.above(name, gap = 24)` | 下边缘接在目标上方,水平居中对齐目标 |
| `.centerOn(name)` | 与目标同心 |
| `.alignTop(name)` | 只管纵向:与目标上边缘齐平 |
| `.alignLeft(name)` | 只管横向:与目标左边缘齐平 |

`alignTop()` 和 `alignLeft()` 只改一个轴,所以它们链在另一个摆放之后:

```ts
rect("Cache").as("cache").rightOf("enc", 60).alignTop("enc");
```

**被摆放的对象不需要知道自己的尺寸**,FrameSeq 用 CSS 完成居中;**被引用的对象需要**:`rect()` 默认 240 × 96,`circle()` 默认 160 × 160,显式的 `width()` 或 `height()` 会覆盖默认值。

### 连线锚点

`from()` 和 `to()` 接受一个名字,或者"名字 + 锚点":

```ts
line().from("enc").to("dec");                    // FrameSeq 自动选相对的两条边
line().from("enc.right").to("dec.top-left");     // 显式锚点
line().from("enc.right", { dy: -20 }).to("dec"); // 显式锚点,再上移 20px
```

可用的锚点有 `center`、`top`、`bottom`、`left`、`right`、`top-left`、`top-right`、`bottom-left`、`bottom-right`,按对象的外接盒计算。不写锚点时 FrameSeq 比较两个中心,从**面向另一端的那条边**出发,所以坐标一变连线自己跟着走。

一条连线也可以只锚定一端,另一端保留 `line({ x1, y1, x2, y2 })` 给的坐标。

## 行和列里,FrameSeq 能算什么

自动布局在渲染之前、从声明的源码解析出来。FrameSeq **只计算能精确算的那部分**,其余一律报错,而不是猜一个浏览器随后会否定的位置:

- `row()` 和 `column()`,且有显式 `gap()`。从主题继承的间距会被拒绝,因为它的值取决于主题。
- `grid()`:等宽列 + 声明过的 `width()`,或者用像素给出的轨道。行高等于该行最高的条目,没有自身宽度的条目填满单元格。自己用 CSS grid line 定位的条目会被拒绝。
- 盒子可解析的子对象:`rect()` 和 `circle()` 有默认尺寸,其余都需要 `width()` 和 `height()`。
- `align()` 的 `start`、`center`、`end`,以及默认的 stretch —— 它让没有自身交叉轴尺寸的子项撑满该行。
- `justify()` 的 `start`;当容器在该轴上有显式尺寸时,还支持 `center`、`end`、`space-between`。
- 以像素给出的 `padding()`。来自 `card()` 或网格单元的内边距会被拒绝,理由和主题间距相同。
- 行列互相嵌套。嵌套容器的尺寸取自它排出来的布局,所以只有当它声明了自己的 `width()` 和 `height()` 时才可以使用 `align()` 或 `justify()`。

其它情况 —— `wrap()`、`grow()`、高度取决于文字换行的子项 —— 都会报错,并指明是哪个对象、该补什么。

## 名字能触及的范围

引用在渲染之前、从声明的几何解析,所以两个对象必须共享同一个坐标系:

- 把它们放在同一个 `canvas()` 里,或者放进一个自身用 `position()` 定位过的容器。
- 由文档流排版的对象 —— `bullets()` 后面的 `text()`、网格单元里的卡片 —— 在浏览器排版之前没有坐标,因此不能被引用。

FrameSeq 会把无法解析的引用报成错误,指明是哪一页、哪处引用、以及当前有哪些可用的名字,而不是把连线画到错误的位置。

## FrameSeq 拒绝的时候

上面所有位置都在渲染之前解析,所以 HTML、PDF、PPTX 和 Typst 拿到的是同一份几何。FrameSeq 只算它能精确算的,其余一律报告:

| 报错信息 | 该怎么办 |
| --- | --- |
| the gap of "x" comes from the theme | 在那个容器上调用 `.gap(n)`。 |
| the width of "x" is unknown | 给对象补 `.width()` 和 `.height()`;高度取决于换行的文字无法解析。 |
| "x" has no canvas coordinates | 给它 `.position({ x, y })`、`.anchor(...)`,或者放进一个可解析的行/列。 |
| "x" sits inside another row or column | 嵌套容器要先声明 `.width()` 和 `.height()`,才能用 `align()` 或 `justify()`。 |
| "x" uses grow() | 自动尺寸取决于浏览器;请显式设定尺寸。 |
| across a container without fixed coordinates | 两个对象在不同的坐标空间;把连线写进包含它们的那个容器里。 |

## 一张完整的图

```ts
slide({ name: "Adaptive routing" }).canvas();

at("flow").row().gap(120).anchor("center");
rect("Router").as("router").width(200).height(120);
at("flow/models").column().gap(28);
rect("Small model").as("small").width(220).height(100);
rect("Large model").as("large").width(220).height(100);

at("flow");
line().from("router").to("small").arrow("end");
line().from("router").to("large").arrow("end");
text("72% stop here").caption().below("small", 12);
```

一页、一块画布,一个坐标都没有。
