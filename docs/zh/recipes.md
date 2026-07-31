<!-- translation-of: docs/recipes.md sha256:53e36c5ed8628452 -->

# 配方

下面每一条都是**一整页**幻灯片,不是片段:复制过去,把文字换成你自己的,它就能渲染。所有配方都取自随 Gallery 发布的一份 deck,也就是说这里看到的每一页都通过了布局检查。

[打开配方 deck](https://pride7.github.io/frameseq/examples/recipes/) 看渲染结果,或者[读它的源码](https://github.com/pride7/frameseq/blob/main/gallery/slides/recipes.slides.ts)按顺序看一遍。

- [封面](#封面)
- [一个论点和它的证据](#一个论点和它的证据)
- [对比](#对比)
- [一行指标](#一行指标)
- [代码配解释](#代码配解释)
- [公式配读法](#公式配读法)
- [流程图](#流程图)
- [二维架构图](#二维架构图)
- [渐进揭示](#渐进揭示)
- [收尾](#收尾)

## 封面

```ts
slide({ name: "Cover" }).cover();
text("Section 01").eyebrow();
text("Adaptive Inference at the Edge").hero();
text("Routing easy inputs away from the network").subtitle();
text("Research Systems Group").author();
```

<!-- preview -->

`cover()` 换的是布局,四个文字角色承载含义。这里没有任何一处设置字号,所以换主题就能重新配色排版,页面本身不用动。

## 一个论点和它的证据

```ts
slide("Cloud-only inference stalls on the network");
text("The round trip costs more than the model call it protects.").lead();
bullets(
  "Latency varies with congestion, not with model size",
  "Every input leaves the device, including private ones",
  "A fixed route spends the same budget on easy and hard inputs",
);
note("Give the audience the problem before the method.");
text("Measurements in this deck are illustrative.").caption();
```

<!-- preview -->

一场讲演里最常见的一页。标题给出论断,`lead()` 用一句话再说一遍,要点是证据。`note()` 把交付细节留在屏幕之外,`caption()` 是放免责说明的地方。

## 对比

```ts
slide("Two routes, one budget").split("45:55");
text("Cloud only").lead();
bullets("118 ms round trip", "Every input uploaded", "One accuracy operating point");

right();
text("Adaptive").lead();
bullets("41 ms for routed inputs", "72% stay on the device", "Accuracy traded per input");
```

<!-- preview -->

`split()` 命名两个区域,`right()` 切到第二个 —— 两边在源码里也是并排的,和页面上一样。两列的条目数尽量一致:**这一页的形状本身就是论证**。

## 一行指标

```ts
slide("Operating profile");
text("Three numbers summarise the run.");
gridSection(
  3,
  metric("41 ms", "Median latency"),
  metric("72%", "Inputs kept local"),
  metric("−0.6 pt", "Accuracy change"),
).gap(20);
text("Values are illustrative and not a benchmark.").caption();
```

<!-- preview -->

`gridSection()` 只排它自己的条目,所以上面那句话和下面的注释仍在正常文档流里。整页都是网格时,用 `slide().grid(3)`。

## 代码配解释

```ts
slide("The routing rule").split("52:48");
code(`if (confidence(small) >= threshold) {
  return small;
}
return large;`, "ts");

right();
text("One comparison decides the route.").lead();
bullets(
  "The small model always runs first",
  "Only its confidence crosses the network",
  "The threshold is the single tuning knob",
);
```

<!-- preview -->

给代码略多于一半的宽度,并把它删减到只剩承载想法的那几行。要点写的是**读者该注意什么**,这和逐行讲解代码不是一回事。

## 公式配读法

```ts
slide("Objective").center();
text`The router minimises latency subject to an accuracy floor.`.lead();
math`\min_{\theta}\; \mathbb{E}\big[\ell(f_\theta(x), y)\big] + \lambda\,\mathbb{E}\big[c(x)\big]`;
text("λ prices a millisecond against a point of accuracy.").caption();
```

<!-- preview -->

凡是带反斜杠的内容都用标签模板形式。句子、公式、读法:观众得先知道这些符号买到了什么,才有心思去解析它们。

## 流程图

```ts
slide("Request path").canvas();

at("flow").row().gap(90).anchor("center");
rect("Device").as("device").width(200).height(110);
rect("Router").as("router").width(200).height(110);
rect("Cloud").as("cloud").width(200).height(110);

line().from("device").to("router").arrow("end");
line().from("router").to("cloud").arrow("end");
text("28% of inputs continue past the router").caption().below("router", 28);
```

<!-- preview -->

一个坐标都没有。row 负责排布,`anchor("center")` 负责放置,连线跟着框走。改 `gap(90)` 会重排整张图,连线一起动。完整模型见 [Diagrams](../diagrams.md)(英文)。

## 二维架构图

```ts
slide("Where the work happens").canvas();

at("map").column().gap(36).anchor("center");
at("map/device").row().gap(28);
rect("Small model").as("small").width(230).height(96);
rect("Confidence").as("confidence").width(230).height(96);
at("map/cloud").row().gap(28);
rect("Large model").as("large").width(230).height(96);
rect("Cache").as("cache").width(230).height(96);

at("map");
line().from("confidence").to("large").arrow("end");
line().from("large").to("cache").arrow("both");
```

<!-- preview -->

列里套行就有了第二个维度,而路径就是嵌套关系。写连线之前用 `at("map")` 回到外层容器,连线的坐标才属于它。

## 渐进揭示

```ts
slide("What changed").notes("Pause after each step; the third is the surprising one.");
steps(
  "Latency fell by 65% for routed inputs",
  "Accuracy moved by less than one point",
  "The threshold, not the model, carries the trade-off",
);
```

<!-- preview -->

`steps()` 在浏览器里每按一次显示一条,在 PDF 和 PPTX 里全部显示。如果要让**单个对象**(而不是列表项)属于某一步,用 `showAt(n)`。

## 收尾

```ts
slide({ name: "Close" }).center();
text("Route the easy inputs. Keep the budget for the hard ones.").quote();
text("Research Systems Group · 2026").caption();
```

<!-- preview -->

结尾页只留一句话,给全场一个可以带走的东西。`center()` 和 `quote()` 负责其余部分;`slide()` 的对象形式让这一页没有标题。

## 修改它们

[修改一场讲演](revising.md)拿同一份 deck 走了一遍第二稿会做的修改 —— 换主题、拆页、加一项指标、给图加一个节点 —— 并给出每一处改动值多少行。

## 检查你自己的 deck

这些配方所在的 deck 通过了布局检查,你的也可以用同样的标准来要求:

```bash
npx frameseq check my-talk.slides.ts
```

它会按真实尺寸渲染每一页,报告溢出或被裁切的文字、小于可读下限的字号、空白页,以及拼错的区域路径。见 [Layout checks](../layout-checks.md)(英文)。
