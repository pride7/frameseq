<!-- translation-of: docs/styling.md sha256:fdd370acb480a1d3 -->

# 样式

全局的配色、字体、间距和圆角先看 [Themes](../themes.md)(英文)。下面这些修饰符是针对**单个对象**覆盖主题的。

内容命令和底层组件都返回构建器,每个修饰符也返回同一个构建器,所以可以一直链下去:

```ts
text("Important")
  .size(pt(30))
  .bold()
  .color("#38bdf8")
  .margin(12, 0);
```

## 全局排版

想保留主题的配色和布局、但换一套字体默认值时,用 `presentation()` 的 `font` 选项:

```ts
presentation({
  title: "My Slides",
  theme: "minimal-academic",
  font: {
    family: '"Noto Sans SC", sans-serif',
    size: 24,
    weight: 400,
    lineHeight: 1.5,
    heading: {
      family: '"Noto Serif SC", serif',
      size: 40,
      weight: 700,
    },
    code: {
      family: '"JetBrains Mono", monospace',
      size: 18,
    },
  },
});
```

`size` 处的数字是像素。也接受长度助手和 CSS 字符串,比如 `pt(20)`、`"1.5rem"`、`"24px"`。`lineHeight` 可以是无单位数字或 CSS 字符串。

优先级是:单个对象的修饰符或 `.style()` 值 > `presentation.font` > 所选主题。顶层的 `family` 同时作用于正文和标题;代码保持主题的等宽字族,除非设置了 `code.family`。

中文、日文、韩文默认可用:每套内置主题的字族链末尾都带 CJK 回退,详见 [Themes](../themes.md)(英文)。

## 长度与单位

数字按像素解释:

```ts
text("Pixels").size(24);
```

需要显式单位时用助手函数:

```ts
px(20)
pt(20)
rem(2)
percent(50)
vw(40)
vh(30)
```

它们返回 CSS 长度字符串,任何接受 `Length` 的地方都能用。

## 尺寸与间距

```ts
.width(640)
.height(percent(100))
.minWidth(200)
.minHeight(120)
.padding(24)
.padding(16, 24)   // 纵向, 横向
.margin(12)
.margin(8, 16)     // 纵向, 横向
.gap(20)
```

## 外观

```ts
.background("#0f172a")
.color("#f8fafc")
.border("1px solid #334155")
.radius(16)
.opacity(0.8)
```

## 字体

```ts
.size(pt(28))
.fontSize(pt(28))
.weight(600)
.fontWeight(600)
.bold()
.lineHeight(1.4)
.textAlign("center")
```

`size()` 是 `fontSize()` 的别名,`weight()` 是 `fontWeight()` 的别名。

文字角色提供带语义的默认值:

```ts
.body()
.title()
.hero()
.subtitle()
.author()
.eyebrow()
.lead()
.caption()
.quote()
```

这些角色可用于小写的 `text()` 命令返回的对象。

## 弹性布局

容器组件支持:

```ts
.row()
.column()
.stack()
.grid(3)
.center()
.align("center")
.justify("space-between")
.grow()
.wrap()
```

`align()` 接受 `"start"`、`"center"`、`"end"`、`"stretch"`;`justify()` 另外接受 `"space-between"` 和 `"space-around"`。

任何对象也可以在所属容器的交叉轴上对齐自己,这会覆盖该容器对这一个对象的 `align()`:

```ts
.selfAlign("center")
.centerSelf()
```

`selfAlign()` 接受和 `align()` 一样的取值。对象默认在交叉轴上拉伸,所以只有当它自己有尺寸时才会移动——在列里是 `width()`,在行里是 `height()`。什么时候该用它、什么时候该用 `center()` 或 `textAlign()`,见[只让一个对象居中](layout.md#只让一个对象居中)。

## 定位与变换

```ts
.position({ x: 80, y: 120 })
.anchor("center")
.rotate(-4)
```

`position()` 使用绝对定位,面向画布或其它刻意定位过的父容器。`anchor()` 则相对于父容器摆放,不用写坐标 —— 见 [Diagrams](../diagrams.md)(英文)。

要在普通流式布局里放一个定位区域,给容器起个名字并把它变成局部画布:

```ts
at("panel").canvas().width(600).height(260).clip();

text("Local coordinates").position({ x: 32, y: 24 });
```

写在 `at("panel")` 之后的对象都属于这个容器。它的 `.canvas()` 让子对象的坐标变成局部的,`.clip()` 把它们裁在面板内;`.clip(false)` 可恢复溢出可见。

## 渐进揭示

```ts
text("Appears first").showAt(1);
text("Appears second").showAt(2);
```

揭示序号从 `1` 开始。PDF 和打印模式下所有步骤都可见。

## Tailwind CSS

Tailwind 工具类是内置的,不需要任何配置。把工具类字符串传给 `style()`:

```ts
text("A strong statement")
  .style("text-4xl font-bold tracking-tight text-blue-600");

text("Precisely placed")
  .style("absolute left-[80px] top-[120px] w-[640px]");
```

支持 `text-[30px]`、`bg-[#0f172a]`、`grid-cols-[2fr_3fr]` 这类任意值。动态选择的工具类要保持为**完整字符串**,Tailwind 才能扫描到:

```ts
const emphasis = important ? "text-red-600" : "text-slate-500";
text("Status").style(emphasis);
```

不要用 `` `text-${color}-600` `` 这种拼接写法 —— 完整的类名没有出现在源码里,Tailwind 找不到它。

## 内联 CSS 与类名

对象形式仍然可以写内联 CSS:

```ts
text("Custom")
  .className("my-callout")
  .style({
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  });
```

传给 `style()` 的属性名用 JavaScript 风格,比如 `letterSpacing`。

**内联属性的优先级高于 Tailwind 工具类,与调用顺序无关。** 只想附加类名、不想用 `style()` 简写时,用 `className()`。
