<!-- translation-of: docs/shapes.md sha256:e34da109de0bf20f -->

# 图形与连线

FrameSeq 提供一小组图元,用来画流程图、架构图、时间线和标注。创作接口保持声明式:矩形和圆渲染为**可编辑的 HTML 元素**,连线和箭头渲染为内联 SVG。

## 先切到画布

图形也可以参与普通布局,但画图通常需要显式坐标:

```ts
slide({ name: "Pipeline" }).canvas();
```

坐标相对于当前的画布区域。FrameSeq 把最终的演示画布当作一个整体来映射,所以同一份构图在交互式 HTML、PDF 和 PPTX 里保持相同的相对几何关系。

## 矩形

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

标签是可选的。它默认居中,并且支持和 `text()` 一样的行内 `$...$` 公式语法。

不设高度的矩形是 240 × 96,这也是它的最小高度。调用 `height()` 会**解除**这个最小值,所以更矮的形状会按你要求渲染;想保留自己的下限,在 `height()` 之前调用 `minHeight()`。

## 圆

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

## 组合成一张图

命名、自动布局和连线在 [Diagrams](../diagrams.md)(英文)里讲,那一页展示如何做出**所有对象都不带坐标**的图。

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

## 自定义 SVG 图形

当图里需要图标、logo、贝塞尔曲线或其它超出内置图元的几何时,用 `image()` 引入 SVG 文件:

```ts
const artwork = new URL("./assets/custom-shape.svg", import.meta.url).href;

image(artwork, "Custom vector diagram")
  .position({ x: 760, y: 80 })
  .width(280);
```

这样图形在浏览器和 PDF 里保持矢量,而常见的框和连线仍然能在 TypeScript 里轻松修改。可编辑的 PPTX 导出会把矩形、圆、线和箭头映射成 PowerPoint 的原生图形。
