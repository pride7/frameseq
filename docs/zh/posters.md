<!-- translation-of: docs/posters.md sha256:f9fe74657ced2c4a -->

# 海报与打印

海报是为纸张制作的演示:只有一页,用和幻灯片相同的命令排版,并按纸张尺寸打印。

```ts
poster({
  title: "Diffusion Language Models",
  subtitle: "From iterative recovery to continuous state spaces",
  author: "Ada Lovelace · Alan Turing",
  institute: "University of Cambridge",
  date: "NeurIPS 2026",
}).grid(3);

at("cell0/introduction").card();
text("Introduction").title();
text("Autoregressive models write one token at a time…");

at("cell1/method").card();
text("Method").title();
math`p_\theta(x_{t-1} \mid x_t)`;

at("cell2/results").card();
text("Results").title();
chart("bar", { Baseline: 31, Ours: 74 }).unit("%");
qr("https://example.com/paper").width(220);
```

[在线海报示例](https://pride7.github.io/frameseq/examples/poster/)由 [`gallery/slides/poster.slides.ts`](https://github.com/pride7/frameseq/blob/main/gallery/slides/poster.slides.ts) 构建,其中有表格、图表、二维码,以及来自 BibTeX 文件的引用。

`poster()` 开始一份 A0 竖版、使用 `poster` 主题的演示,并开始它唯一的一页,所以调用后面可以直接接这一页的布局。它的选项和 `presentation()` 的一样,`size`、`orientation` 和 `theme` 都可以改。

## 纸张尺寸

任何演示都可以用 `size` 改为纸张制作:

```ts
presentation({ title: "Handout", size: "A4" });
presentation({ title: "Conference poster", size: "36x48in" });
presentation({ title: "Wall chart", size: "A1", orientation: "landscape" });
```

有名字的尺寸是 `"A0"` 到 `"A5"`、`"letter"`、`"legal"` 和 `"tabloid"`;其他尺寸写成"宽 x 高"加单位,单位可以是 `"mm"`、`"cm"` 或 `"in"`。有名字的纸张默认竖放,除非写 `orientation: "landscape"` 把它横过来;写出来的尺寸按写法摆放。

## 画布单位与印刷尺寸

画布有自己的单位:纸张短边为 1600,长边按纸张比例,所以一张 A0 是 1600 × 2262。`.position()`、`.width()` 和 `.size()` 里的数字都是这种单位,主题的字号和间距也是,所以用幻灯片的命令排出来的海报同样好看。在选项里写 `width` 或 `height`,可以给画布更多或更少的单位。

要表示印刷后纸面上的尺寸,用 `mm()` 和 `pt()`:

```ts
image(logo).width(mm(60));          // 纸面上 60 mm 宽
text("Contact").size(pt(28));       // 纸面上 28 pt 的字
line().strokeWidth(mm(1.5));
```

它们会按纸张的比例换算成画布单位,不论出现在哪里,包括 `calc()` 表达式、`presentation({ font })` 和主题的间距。在为屏幕制作的演示里,`pt()` 和 `mm()` 保持 CSS 原本的含义。

## 海报主题

`poster` 主题在页面顶部放一条横幅,写着标题、副标题、作者、机构和日期,全部取自演示的选项。横幅下面,网格单元格是没有底色的栏,每个 `card()` 区域是一个版块,顶部有一道强调色线条;`.title()` 文字像论文的小节标题一样作为版块标题。

这条横幅来自主题选项 `chrome.header`,所以你自己的主题也可以有:

```ts
const lab = defineTheme({
  name: "lab-poster",
  extends: "poster",
  colors: { accent: "#0f766e" },
  chrome: { headerBackground: "#134e4a", headerForeground: "#f0fdfa" },
});

poster({ title: "…", theme: lab }).grid(4);
```

## 检查海报

`frameseq check` 用测量幻灯片的方式测量海报,并按印刷尺寸判断字号。最小可读字号随画布变大:在 1280 宽的幻灯片上是 14 个单位,在海报上是短边的同一比例,在 A0 纸上约为 21 pt。纸张上的检查结果会同时给出两种尺寸:

```text
WARNING Slide 1 "Poster" [font-too-small]
  Font size 10px (15pt printed) is below the recommended 14px (21pt printed) minimum.
```

## 打印

每一种导出都按纸张尺寸输出这一页:

- `frameseq pdf` 生成纸张大小的 PDF,A0 是 841 × 1189 mm,全程保持矢量,印刷店可以直接使用。
- `frameseq pptx` 生成同样尺寸的 PowerPoint 幻灯片,文字、表格和图表都可编辑。
- `frameseq typst` 写出同样尺寸的 Typst 页面。

海报只有一页,所以演讲者视图、分步揭示这些演示功能在这里没有用武之地。为纸张制作的演示仍然可以有多页,比如一组讲义,每页用 `slide()` 开始。
