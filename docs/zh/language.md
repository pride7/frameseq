<!-- translation-of: docs/language.md sha256:6dfc546ca3d274ef -->

# 语言速览

FrameSeq 是一门用 TypeScript 写的、专门用来排版幻灯片和海报的小语言。六个概念就能概括它;这份文档里的其余内容,都是其中某一个概念的细节。

## 1. 文档从上到下运行

```ts
presentation({ title: "Quarterly review", theme: "paper" });

slide("Revenue");
text("Up 42% on last year.").lead();
```

幻灯片文档是一串按顺序运行的语句。`presentation()` 放在最前面,说明整件事是什么:标题、主题和尺寸,默认是屏幕,写 `size: "A0"` 就是一张纸。不需要导入也不需要导出;命令直接可用,文档运行到最后一行时构建出来的就是这场演示。

因为文档就是 TypeScript,变量、循环、函数和导入都照常可用:

```ts
for (const quarter of ["Q1", "Q2", "Q3"]) {
  slide(quarter);
  text(`Results for ${quarter}`);
}
```

## 2. 一页幻灯片拥有它后面的内容

```ts
slide("Architecture");
text("Three stages");      // 在 Architecture 上
bullets("Parse", "Build"); // 在 Architecture 上

slide("Results");          // 新的一页开始
```

`slide()` 之后的所有内容都属于这一页,直到下一个 `slide()`。不需要结束调用,也不需要记着嵌套:边界就是那些 `slide()` 行本身。海报是只有一页的演示,`poster()` 会自己开始这一页。

## 3. 命令生成对象,修饰符塑造对象

```ts
text("Important").size(36).bold().color("#2563eb");
table(rows).striped();
chart("bar", { Q1: 12, Q2: 18 }).unit("%");
```

每条命令加入一个对象,段落、列表、图片、表格、图表、公式、图形、图标或二维码,并把它返回,所以可以链式调用修饰符来说明它的外观和位置。修饰符只改变调用它的那个对象。`.lead()`、`.caption()` 这样的文字角色从主题里选排版;没有别的写法能表达时,`.style()` 接受 Tailwind 类。`.fit()` 让对象缩小文字,直到放得下。

## 4. 光标决定对象放在哪里

```ts
slide("Comparison").split("40:60");
text("Before");            // 左侧区域
right();
text("After");             // 右侧区域

slide("Results").grid(3);
cell(0); metric("42%", "Growth");
cell(1); metric("18K", "Users");
```

页面的布局会划分出区域,光标说明接下来的对象放进哪个区域:`split()` 划出 `left` 和 `right`,`grid(n)` 划出单元格,`right()`、`cell(i)` 和 `main()` 移动光标。`at("cell0/notes")` 把光标移到一个命名区域,沿途需要的容器会自动创建,所以再深的组合也保持一个对象一条语句:

```ts
at("cell0/now").card();
text("Shipped").eyebrow();
at("cell1/next").card();
text("Planned").eyebrow();
```

## 5. 名字把对象连起来

```ts
rect("Encoder").as("encoder");
rect("Decoder").as("decoder").rightOf("encoder", 120);
line().from("encoder").to("decoder.left").arrow("end");
ref("decoder").fill("#dbeafe");
```

`.as()` 给对象起名,每个 `at()` 路径都给区域起名。连线、相对摆放、`ref()` 和 `group()` 都通过这些名字引用对象,所以一张图说的是什么连到什么,而不是每一端在哪个坐标。名字属于它所在的那一页。

这些名字在 TypeScript 看来只是字符串,但 FrameSeq 的编辑器不这么看:FrameSeq Studio 和 VS Code 扩展都能补全名字、从使用处跳到起名的地方、连同本页上的每一处使用一起重命名,并给指向不存在之物的名字画上波浪线。

## 6. 错误报告到出错的那一行

FrameSeq 在三个时刻检查文档:

- **输入时**,TypeScript 会给拼错的命令或错误的参数画波浪线,比如一个不存在的图标名;编辑器也会给指向不存在之物的名字画波浪线。
- **运行时**,像引用了参考文献里没有的条目这样的错误会让文档停下,Studio、VS Code 扩展和 CLI 都会指向出错的语句:

  ```text
  talk.slides.ts:24:1  error  ref() cannot find an object named "decodr"; named objects on this slide: encoder, decoder
    23 | rect("Decoder").as("decoder");
  > 24 | ref("decodr").fill("#dbeafe");
  ```

- **绘制后**,`frameseq check` 测量结果:溢出或被裁切的文字、在其尺寸下小到读不清的字、空白页,以及不起作用的修饰符,每一条都附带相关对象所在的行。

## 接下来读什么

- [快速上手](getting-started.md)建一个项目,写第一场讲演。
- [配方](recipes.md)为每种页面准备了一页完整的幻灯片。
- [内容](content.md)、[布局](layout.md)和[画图](diagrams.md)深入讲第 3 到第 5 个概念。
- [海报与打印](posters.md)为纸张制作页面。
