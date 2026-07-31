<!-- translation-of: docs/ai-generation.md sha256:a64ec4911cf85c1d -->

# 用 AI 生成演示

FrameSeq 被设计成一门**适合编码代理的目标语言**:页面边界显式、语义 API 很小、对象的属性紧挨着它的内容。结果是 AI 容易生成,人也容易改。

## 先把 FrameSeq 的契约交给代理

让代理在动手写代码之前先读 [`llms.txt`](../../llms.txt)。这个文件刻意压得足够紧凑,可以直接当作模型上下文,并且随 npm 包一起发布。

如果代理能读 URL,这样开头:

```text
Read https://raw.githubusercontent.com/pride7/frameseq/main/llms.txt.
Then create a FrameSeq presentation from the brief below.
Write the result to slides.ts, run npm run check, and fix every reported error.

Brief:
[粘贴受众、目的、素材、约束和期望长度]
```

在生成的项目里,把页面顺序和各页专属内容留在 `slides.ts`,把可复用的内容工厂放进 `components/content.ts`,把共享的视觉设置放进 `components/theme.ts`。这种切分让代理在修改演示时,不必反复重写它的设计系统。

已安装的包里,同一份参考在:

```text
node_modules/@pride7/frameseq/llms.txt
```

## 一份有用的需求说明

当提示描述的是**沟通问题**而不只是话题时,AI 产出的幻灯片会明显更好。请包含:

- 受众是谁、他们现在知道多少;
- 这份演示要促成的决定、要传达的教益或要引发的行动;
- 必须保持准确的素材和事实;
- 目标页数和讲演时长;
- 必须有的章节、公式、图表或引用;
- 偏好的主题、语气和输出格式;
- 允许代理使用的素材。

例子:

```text
Create a six-slide research presentation for an ML systems seminar.
The audience knows transformer inference but not adaptive routing.
Explain the latency problem, show a two-stage method, include the training
objective as LaTeX, summarize three illustrative results, and end with two
limitations. Use minimal-academic, add concise speaker notes, and label all
synthetic measurements as illustrative. Prefer split and grid layouts; use a
canvas only for the method diagram.
```

## 推荐的生成循环

### 1. 先定提纲,再谈样式

每一页只承载一个主要信息。一个好用的六页研究型结构:

1. 论断与背景;
2. 问题与证据;
3. 方法图;
4. 目标函数或机制;
5. 结果与对比;
6. 结论与局限。

**提纲要先决定观众需要理解什么**,然后才轮到坐标、配色和装饰元素。

### 2. 写语义化的 FrameSeq 源码

从线性 API 和内置角色开始:

```ts
presentation({
  title: "Adaptive Inference at the Edge",
  author: "Research Systems Group",
  theme: "minimal-academic",
});

slide().cover();

slide("Why cloud-only inference stalls").split("40:60");
metric("118 ms", "Illustrative round-trip latency");

right();
text("The network dominates short model calls.").lead();
bullets(
  "Latency varies with congestion",
  "Private inputs leave the device",
  "A fixed route wastes easy examples",
);
```

这样内容和意图都留在明面上。只有当某张图**真的需要**时,才加精确坐标。

当网格只占页面一部分时,直接生成它的条目,不要手工切换区域:

```ts
slide("Operating profile");
text("Three measurements summarize the run.");
gridSection(
  3,
  metric("118 ms", "Latency"),
  metric("72%", "Inputs kept local"),
  metric("−0.6 pt", "Accuracy change"),
);
text("Values are illustrative.").caption();
```

每个参数就是一格。标题加正文的条目用 `card()`;只有当一格需要多个各自带样式的对象时才用 `group()`。

对那张确实需要画布的图,**定位一个锚点对象,其余全部相对它描述**。命名引用在图被修改之后仍然正确 —— 这对生成的源码比对手写源码更重要:

```ts
slide("Two-stage routing").canvas();

rect("Router").as("router").position({ x: 120, y: 150 }).width(220).height(110);
rect("Small model").as("small").rightOf("router", 160);
rect("Large model").as("large").below("small", 40);

line().from("router").to("small").arrow("end");
line().from("router").to("large").arrow("end");
text("72% of inputs stop here").caption().below("small", 12);
```

这样改一个坐标就会带动所有连着它的连线,**修正一轮之后不会留下指向空白处的箭头**。

### 3. 把交付细节放进备注

可见文字应当帮助观众扫读页面。解释、过渡、注意事项和提醒都属于备注:

```ts
slide("Results")
  .grid(3)
  .notes("State that all values are illustrative, then compare the trend rather than claiming a benchmark.");
```

### 4. 校验渲染出的几何

同时跑 TypeScript 检查和浏览器布局检查:

```bash
npm run check
```

代理可以直接索取结构化诊断:

```bash
npx frameseq check slides.ts --json
```

JSON 报告会指出空白页,并为每个几何问题给出页码、对象类型、对象路径、测量值和修改建议。出现 `empty-slide` 时补上真实的可见内容;只有留白确实有意时才用 `.allowEmpty()`。在把字号调小之前,优先缩短文案或调整布局。`empty-region` 和 `similar-name` 警告指向拼错的 `at()` 路径或 `.as()` 名字:**改拼写,而不是往那个意外产生的区域里填内容**。

### 5. 从校验过的源码导出

```bash
npm run build   # 可部署的交互式 HTML
npm run pdf     # 便携 PDF
npm run pptx    # 可编辑 PowerPoint
npm run typst   # 可编辑 Typst 源码
```

**一份源码对所有输出负责。**

## 修正提示词

第一轮没过校验时,把报告交回给代理,并给一条收窄的指令:

```text
Read the FrameSeq layout report below and edit slides.ts.
Fix every error without changing factual meaning. Prefer shorter copy,
semantic layout changes, or wider regions. Keep body text at least 18px and
do not remove citations. Run npm run check again after editing.

[粘贴 frameseq check --json 的输出]
```

## 验收清单

接受 AI 生成的幻灯片之前,确认:

- 每个论断都有给定素材支撑;
- 示意性数据已标注,没有编造的引用;
- 每一页只有一个清晰信息,且阅读顺序可见;
- 普通页面使用结构化布局;
- 图里的对象是命名并相对摆放的,而不是靠重复的坐标;
- 公式使用标签模板,LaTeX 反斜杠得以保留;
- Typst 片段是静态的,且只用于局部的复杂排版;
- LaTeX 表格片段是静态的正文片段,用 `latex` 或 `latexFile()`;
- Tailwind 工具类是完整可读的字符串;
- 演讲者备注承载了不必上屏的细节;
- `npm run check` 通过;
- 最终的 HTML、PDF 或 PPTX 已经人工看过一遍。

## 完整示例

Gallery 里有一份按上面这套需求说明生成的研究型演示:

- [打开在线演示](https://pride7.github.io/frameseq/examples/ai-research/)
- [阅读它的 FrameSeq 源码](https://github.com/pride7/frameseq/blob/main/gallery/slides/ai-research.slides.ts)

这个例子在一个线性文件里演示了封面、分栏布局、画布图、LaTeX 目标函数、结果网格、演讲者备注和渐进揭示。
