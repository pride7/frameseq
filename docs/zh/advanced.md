<!-- translation-of: docs/advanced.md sha256:dbd7a440175f30fc -->

# 高级组合

线性 API 是为普通的演示创作优化的。当某一页需要嵌套组件、可复用的工厂函数或自由摆放时,可以用显式对象 API。

## 显式创建演示

```ts
import {
  Column,
  Image,
  Row,
  Slides,
  Text,
} from "@pride7/frameseq";

const slides = Slides("Custom layouts");

slides.slide("Architecture").custom(
  Row(
    Image("https://example.com/diagram.png", "Architecture diagram"),
    Column(
      Text("Compiler").size(32).bold(),
      Text("DSL → HTML → PDF").size(20),
    ).gap(16),
  ).gap(40),
);

export default slides;
```

显式 import 的入口**必须导出**它的演示对象,它不使用零样板的全局命令注入。

## 组件构造器

```ts
SlidesRoot(options?)
Slides(options?)
Slide(options?)
Row(...children)
Column(...children)
Stack(...children)
Text(content)
Image(src, alt?)
Code(content, language?)
Equation(content, displayMode?)
Typst(source, svg?)
Latex(source, svg?)
Rect(label?)
Circle(label?)
Line({ x1, y1, x2, y2 })
Spacer(size?)
```

- `SlidesRoot` 和 `Slide` 提供最小的结构层。
- `Slides` 在此之上加了带演示语义的页面布局和默认值。
- `Row`、`Column`、`Stack` 创建容器。
- `Text`、`Image`、`Code`、`Equation`、`Typst`、`Latex` 创建**未挂载**的内容元素。
- `Rect`、`Circle`、`Line` 创建未挂载的图元。
- `Spacer` 吃掉可用的弹性空间。

**大写构造器不会自动挂到当前的线性页面上。**

## 可复用的组件工厂

```ts
import { Column, Text } from "@pride7/frameseq";

function Stat(value: string, label: string) {
  return Column(
    Text(value).size(44).bold(),
    Text(label).size(16).color("#94a3b8"),
  ).gap(6);
}
```

工厂返回的是普通构建器,可以组合进行、列、卡片或画布页面。

## 区域构建器

`Slides().slide()` 返回的 `ContentSlideBuilder` 提供了一批便捷方法:

```ts
page.lead("...")
page.text("...")
page.bullets("...", "...")
page.steps("...", "...")
page.code("...", "ts")
page.math("...")
page.image(src, alt)
page.caption("...")
page.quote("...")
page.metric("42%", "Growth")
page.custom(element)
```

split 和 grid 的区域也提供同样的内容助手。

## 自由摆放

```ts
import { Slides, Text } from "@pride7/frameseq";

const slides = Slides("Canvas");
const page = slides.slide({ name: "Diagram" }).canvas();

page.custom(
  Text("Input").size(24).position({ x: 80, y: 120 }).width(240),
  Text("Output").size(24).position({ x: 900, y: 120 }).width(240),
);

export default slides;
```

## 原始样式

每个构建器都支持 `style()` 和 `className()`:

```ts
Text("Custom")
  .className("custom-label")
  .style({
    fontVariantNumeric: "tabular-nums",
    filter: "drop-shadow(0 8px 24px rgb(0 0 0 / 0.3))",
  });
```

**有具名修饰符时优先用具名的**;原始样式适合 FrameSeq 尚未暴露的属性。
