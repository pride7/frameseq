<!-- translation-of: docs/revising.md sha256:4b8592958ad320bc -->

# 修改一场讲演

一份 deck 起步很少昂贵。它的代价出现在第二十次修改上 —— 讲演前一晚,评审说结果页还要再加一个指标,而且章节顺序变了。

下面每一处修改都是对[配方 deck](recipes.md) 的真实改动,以 diff 呈现,并按行数计价。整组改动是**一次性全部应用**的,结果通过了 `frameseq check`,没有一处需要事后返工。

## 换掉整套视觉

```diff
   date: "2026",
-  theme: "minimal-academic",
+  theme: "paper",
 });
```

**一行。** 没有任何一页设置字体、颜色或间距,所以每一页都跟着变。这就是应该用 `lead()`、`caption()` 这类文字角色、而不是 `.size(28).color("#666")` 的理由:角色能活过换主题,字面值不能。

## 把一页拆成两页

```diff
 note("Give the audience the problem before the method.");
+
+slide("What a fixed route costs");
 text("Measurements in this deck are illustrative.").caption();
+bullets("Easy inputs pay the full round trip", "Hard inputs get no extra budget");
```

**拆开一行,填充新页两行。** 一页拥有写在它后面的一切,所以新的 `slide()` 调用会把余下的内容整体搬到新页,而不用碰它们。没有嵌套,也就没有需要重新缩进或拆包的东西。

移动一页是同一性质的反向操作:把从 `slide()` 到下一个 `slide()` 之间的整块剪下来,粘到别处。没有需要配对的包装结构。

## 把单栏变成对比

```diff
-slide("What changed").notes("Pause after each step; …");
+slide("What changed").split("50:50").notes("Pause after each step; …");
 steps(
   "Latency fell by 65% for routed inputs",
   "Accuracy moved by less than one point",
   "The threshold, not the model, carries the trade-off",
 );
+
+right();
+text("Still open").lead();
+bullets("Thresholds drift across datasets", "Cold caches lose the latency win");
```

**一个词加一个新区域。** 原有内容原地不动,自动成为左栏;`right()` 开启第二栏。之后想改比例,改一个数字。

## 给指标行加一项

```diff
 gridSection(
-  3,
+  4,
   metric("41 ms", "Median latency"),
   metric("72%", "Inputs kept local"),
   metric("−0.6 pt", "Accuracy change"),
+  metric("1.8×", "Battery life"),
 ).gap(20);
```

**两行。** 列数和那一项;网格自己重新分配间距。没有任何一项带宽度,所以没有需要重算的东西。

## 整张图挪位

```diff
-at("flow").row().gap(90).anchor("center");
+at("flow").row().gap(90).anchor("left", 90);
```

**一个词。** 框本身没有坐标,所以整张图作为一个整体移动,连线跟着走。改 `gap(90)` 同理,会重排所有框和它们的连线。

## 给图加一个节点

```diff
 rect("Cloud").as("cloud").width(200).height(110);
+rect("Cache").as("cache").width(200).height(110);
 line().from("device").to("router").arrow("end");
 line().from("router").to("cloud").arrow("end");
+line().from("cloud").to("cache").arrow("end");
```

**两行。** row 会为新框腾出位置并推开其它框;而因为连线**引用的是名字而不是坐标**,原有箭头仍然贴在框上。这一处正是画图工具里最难受的操作:插入点之后的所有东西都得手动拖。

## 把一个要点降级为口播

```diff
-bullets("41 ms for routed inputs", "72% stay on the device", "Accuracy traded per input");
+bullets("41 ms for routed inputs", "72% stay on the device");
+note("Accuracy is traded per input, not per model.");
```

**移动一行。** 一个挤占页面的细节变成了你嘴上说的话。`note()` 是追加的,所以它可以就近写在它所解释的内容旁边。

## 用拖的,而不是敲的

```diff
-rect("Cache").as("cache").position({ x: 320, y: 90 });
+rect("Cache").as("cache").position({ x: 404, y: 132 });
```

**两个数字。** 实时预览里的 `E` 控件开启布局编辑,用坐标放置的对象就可以直接拖到位,松手即把数字写回。处在文档流里的对象没有坐标可写,拖动它改变的是它在邻居之间的位置,搬走的是它占据的那几行。

关键在于改完之后长什么样。拖拽产出的,就是你本来会敲出来的那次修改——同样的位置、同样的规模,所以它照样能当源码来评审和 diff。凡是没有唯一一个数字或一行能代表这次拖拽的地方(算出来的坐标、循环里的命令),就没有可拖的手柄,因为写什么都是不诚实的。完整的手势见[Visual Studio Code 扩展](vscode.md)。

## 检查结果

```bash
npx frameseq check my-talk.slides.ts
```

检查器按真实尺寸渲染每一页,报告溢出或被裁切的文字、小于可读下限的字号、空白页,以及拼错的区域路径。改完一轮跑一次:它比逐页点过去快,而且和守着配方页那套检查是同一个。

## 为什么这些改动都很小

三条性质做了大部分的功,也值得你在自己的源码里保持:

- **归属就是源码顺序。** 一页拥有写在它后面的东西,一个区域拥有写在 `at()` 后面的东西。移动内容就是移动行,永远不需要重新平衡一棵树。
- **对象靠名字关联,不靠数字。** `line().from("cloud")` 能活过任何坐标活不过的布局变化。
- **角色承载样式。** `lead()`、`caption()`、`metric()` 表达的是意图,所以换主题是改一行,而不是全局搜索替换。
