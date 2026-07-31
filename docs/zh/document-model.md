<!-- translation-of: docs/document-model.md sha256:c0038a4c8a19b8e8 -->

# 文档模型

FrameSeq 的幻灯片文件是从上往下求值的。所有创作命令只依赖很少的文档上下文:当前演示、当前幻灯片、当前布局区域。

## 开始一场演示

```ts
presentation("My Talk");
```

这会创建一场标题为 `My Talk` 的演示,并把它设为当前文档。标题属于文档元数据,会成为浏览器的页面标题;它**不会**生成可见的封面,也不会往某一页里加文字。

对象形式用来配置画布:

```ts
presentation({
  title: "My Talk",
  subtitle: "A short description",
  author: "Your Name",
  institute: "Your Institute",
  date: "2026",
  ratio: "16:9",
  width: 1280,
  theme: "midnight",
  font: {
    family: '"Noto Sans SC", sans-serif',
    size: 24,
    lineHeight: 1.5,
    heading: {
      family: '"Noto Serif SC", serif',
      weight: 700,
    },
    code: {
      family: '"JetBrains Mono", monospace',
      size: 18,
    },
  },
});
```

不写 `theme` 时用的是中性白色的 `blank` 主题。选择内置主题或自定义主题见 [Themes](../themes.md)(英文)。旧的 `background` 选项仍然可用,它只改幻灯片画布的颜色。

`subtitle`、`author`、`institute`、`date` 都是可选的文档元数据。不同主题用法不同:`beamer-madrid` 把作者、机构、日期放在页脚,而 `minimal-academic` 会用这四个字段自动生成一张封面。

`ratio` 接受 `"16:9"` 或 `"4:3"`。默认宽度是 `1280`;除非显式给出 `height`,否则高度由比例推算。

`font` 是可选的全局排版覆盖。顶层的值设置正文;`heading` 和 `code` 分别配置标题和代码。这些设置会覆盖主题,而单个对象上的修饰符优先级仍然最高。

一个幻灯片文件应当在第一页之前调用一次 `presentation()`。再次调用会开启新的文档上下文,并丢弃之前那个。

## 开始一页

```ts
slide("Architecture");
```

这会结束上一页、开始新的一页,并加上可见的 `Architecture` 标题。之后的所有内容命令都属于这一页,直到下一次 `slide()`。

```ts
slide("Architecture");
text("Compiler");
bullets("Parser", "Renderer", "Exporter");

slide("Result");
metric("42%", "Growth");
```

**归属不靠缩进,也不靠回调,靠的是源码顺序。**

局部布局函数遵守同一条规则。`gridSection()` 直接接收内容对象,按参数顺序把它们移进一个局部网格,然后把创作位置交还给外层的页面流:

```ts
text("Before");
gridSection(3, card("A", "First"), card("B", "Second"), card("C", "Third"));
text("After");
```

只有当一个网格单元需要由多个各自带样式的对象组成时,才用 `group(...items)`。渲染出的文档当然仍是一棵父子树,但普通的幻灯片源码不需要手工维护这棵树。

## 页面名字与可见标题

字符串形式同时设置内部名字和可见标题:

```ts
slide("Architecture");
```

当两者需要不同、或者这一页不该有自动标题时,用对象形式:

```ts
slide({ name: "architecture", title: "System architecture" });

slide({ name: "cover" }).cover();
text("My Talk").hero();
```

- `name` 用来标识这一页,不会渲染出来。
- `title` 生成标准的可见页面标题。

## 演讲者备注

用 `notes()` 给一页附上私有备注:

```ts
slide("Architecture")
  .notes(`
    Explain the three compiler stages.
    Pause before revealing the result.
  `);
```

`note()` 写的是同一份元数据,只不过它是普通的线性命令,可以把提示就近放在它所属的内容旁边:

```ts
slide("Architecture");
text("Three compiler stages").lead();
note("Explain the three compiler stages.");

steps("Parse", "Render", "Export");
note("Pause before revealing the result.");
```

重复调用 `note()` 是**追加一行**,不是覆盖前面的文字。

备注作为元数据属于这一页。它们出现在[演讲者视图](../presenter.md)(英文)里,不会渲染进观众页面或 PDF。

## 做一张封面

`cover()` 把当前页切换成封面布局。它不会替你编造封面内容。

```ts
slide({ name: "Cover" }).cover();
text("FrameSeq").hero();
text("Build presentations like interfaces").subtitle();
text("Your name").author();
```

## 内容命令返回对象

内容命令把对象挂到当前区域,并返回**这个对象本身**,所以修饰符可以立刻链上去:

```ts
text("A strong statement")
  .size(pt(30))
  .bold()
  .color("#38bdf8");
```

## 区域上下文

结构化布局会引入区域。`right()` 和 `cell()` 改变后续内容的去处,它们本身不创建内容:

```ts
slide("Comparison").split("40:60");

text("Left side");

right();
text("Right side");
```

新的 `slide()` 会重置去处。`main()` 回到当前页的主区域:split 的左栏、grid 的第一格,或者普通正文。

`at(path)` 把同样的思路扩展到布局还没拥有的容器上。路径的每一段都是一个区域;不存在的段在第一次用到时创建,所以分组永远不需要嵌套源码:

```ts
at("cell0/highlight").card();
text("Q3").eyebrow();
text("Anchors and region paths");
```

再次访问同一路径会选中同一个区域并继续追加。和其余文档上下文一样,路径属于当前页,下一次 `slide()` 时重置。

## 零样板编译

对于传给 `frameseq dev`、`frameseq build` 或 `frameseq pdf` 的入口文件,FrameSeq 会自动:

1. 引入文档命令;
2. 从上到下求值这个文件;
3. 取出 `presentation()` 创建的那场演示;
4. 把它导出给渲染器。

底层的显式对象 API 不使用这套有状态的上下文,见 [advanced composition](../advanced.md)(英文)。
