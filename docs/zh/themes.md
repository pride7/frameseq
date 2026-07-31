<!-- translation-of: docs/themes.md sha256:360fbe243a139058 -->

# 主题

FrameSeq 从一个中性的白色主题开始。除非你自己选,否则演示不会带上任何产品调性,也不会默认套一套暗色配色。

## 默认:`blank`

```ts
presentation("My Talk");
```

等价于:

```ts
presentation({
  title: "My Talk",
  theme: "blank",
});
```

`blank` 提供白色画布、中性排版和最小限度的组件样式。它是一个干净的起点,不是一套成品视觉。

## 内置主题

FrameSeq 内置七套主题:

- `blank` —— 中性白色,默认。
- `midnight` —— FrameSeq 最初的暗色外观,青色强调。
- `paper` —— 暖色调、偏出版物风格,衬线排版。
- `beamer-default` —— 干净的蓝色学术风,不带页面装饰。
- `beamer-madrid` —— 蓝色标题栏加元数据页脚,取自 Beamer Madrid。
- `beamer-cambridge-us` —— 酒红与米色的学术风,取自 Beamer CambridgeUS。
- `minimal-academic` —— 克制的学术风:左对齐标题页、带下划线的页面标题、紧凑页脚。

在演示上选一套:

```ts
presentation({
  title: "Compiler Architecture",
  theme: "midnight",
});
```

主题作用于这场演示的每一页。

## Beamer 风格的主题

Madrid 和 CambridgeUS 可以渲染页面标题、作者与机构页脚、日期和自动页码。元数据在演示上写一次即可:

```ts
presentation({
  title: "Compiler Architecture",
  author: "Ada Lovelace",
  institute: "Analytical Engine Institute",
  date: "2026",
  theme: "beamer-madrid",
});

slide().cover();
text("Compiler Architecture").hero();
text("Ada Lovelace").author();

slide("Overview");
bullets("Parser", "Renderer", "Exporter");
```

标题栏用的是 `slide("Overview")` 里那个可见的 `title`。只给了 `name` 元数据的页面不会得到可见标题。封面页默认隐藏这些装饰。

这些主题在 FrameSeq 的 HTML 渲染器里**复现** Beamer 主题的视觉语言和常见页面结构;它们不执行 Beamer 或 LaTeX 的主题文件。

### Minimal Academic

`minimal-academic` 使用深蓝配色、72% 宽的标题分隔线、带下划线的页面标题,以及 78/22 的"标题 + 页码"页脚。

空白封面会用演示元数据自动填充:

```ts
presentation({
  title: "Minimal Academic Theme",
  subtitle: "A restrained presentation style",
  author: "Your Name",
  institute: "FrameSeq Research",
  date: "2026",
  theme: "minimal-academic",
});

slide().cover();

slide("Motivation");
text("Content starts here.");
```

只有当封面**是空的**时候才会自动填充。在 `slide().cover()` 之后写自己的 `text()`、图片或布局对象,就能完全手动控制。

## 自定义主题

用 `defineTheme()`,只覆盖你需要的 token,其余默认取自 `blank`:

```ts
const ocean = defineTheme({
  name: "ocean",
  colors: {
    background: "#effcff",
    foreground: "#073b4c",
    accent: "#007c91",
  },
  fonts: {
    heading: 'Avenir, "Segoe UI", sans-serif',
  },
  radii: {
    medium: "8px",
  },
  chrome: {
    slideNumber: true,
  },
});

presentation({
  title: "Ocean Research",
  theme: ocean,
});
```

和 `presentation`、`slide` 一样,编译器会自动提供 `defineTheme`,所以在 `.slides.ts` 入口里这段代码不需要 import。

## 继承已有主题

把 `extends` 设成内置主题名或另一个主题对象:

```ts
const companyTheme = defineTheme({
  name: "company",
  extends: "midnight",
  colors: {
    accent: "#a3ff12",
  },
});
```

主题可以层层组合:

```ts
const conferenceTheme = defineTheme({
  name: "conference",
  extends: companyTheme,
  spacing: {
    slideX: "100px",
    slideY: "72px",
  },
});
```

## 主题 token

`defineTheme()` 接受下列分组的部分值:

- `colors`:画布、文字、强调色、表面、边框、代码、错误、预览舞台和阴影。
- `fonts`:`body`、`heading`、`mono` 三条 CSS 字族链。
- `spacing`:页面内边距、布局间距、卡片内边距。
- `radii`:`small`、`medium`、`large`、`pill` 四种圆角。
- `chrome`:可选的标题栏、页脚、页码,以及它们的尺寸和配色。
- `family`:`"frameseq"` 或 `"beamer"`;继承主题时会自动保留原有 family。
- `coverLayout`:`"default"`、`"center"` 或 `"academic-left"`。
- `coverBackground`:`.cover()` 页面使用的 CSS 颜色、渐变或图片。

全部 token 名见 [API reference](../api-reference.md#themes)(英文)。

## 中文、日文、韩文

每套内置主题的字族链末尾都带 CJK 字族,所以中日韩文字会用真实字形渲染,而不是空心方框:

```ts
presentation({ title: "中文排版", theme: "minimal-academic" });

slide("正文与列表");
text("中文与 English 混排时，拉丁字母仍使用主题字体。");
```

浏览器和 Typst 导出器都是**按字符**解析字族的。每条链里拉丁字族仍排在最前,所以拉丁文字不受影响,只有它画不出来的字符才落到 `PingFang SC`、`Hiragino Sans GB`、`Microsoft YaHei`、`Noto Sans CJK SC`、`Noto Sans SC` 或 `Source Han Sans SC`。`paper` 主题用的是对应的衬线字族,代码块回退到 `Noto Sans Mono CJK SC`。

想自己指定字体,把它放在演示字体选项的最前面:

```ts
presentation({
  title: "中文排版",
  font: { family: '"Source Han Sans SC", Inter, sans-serif' },
});
```

**渲染这份演示的机器上必须装有该字体。** 浏览器在字族缺失时会替换成系统字体,但在没有中文字体的机器上导出 PDF、PPTX 和 Typst 会得到空心方框。Linux 服务器或 CI 上装一套即可:

```bash
sudo apt-get install -y fonts-noto-cjk
```

FrameSeq 自己的 CI 就安装了这个包,而且 `npm test` 会在中文渲染成方框时失败。

## 局部覆盖

元素修饰符始终有最终决定权:

```ts
text("This one line is red").color("#dc2626");
```

**全局决定用主题,刻意的例外用链式修饰符。**

旧的 `background` 演示选项仍然可用,它同时覆盖普通页和封面的背景;但只要需要改动的视觉 token 不止一个,主题都是更好的选择。
