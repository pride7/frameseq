<!-- translation-of: docs/citations.md sha256:182c892d3a40616e -->

# 引用与参考文献

给演示一份参考文献,在正文提到文献的地方引用它,FrameSeq 就会给引用编号、在每一页底部列出这一页引用的条目,并生成参考文献表。

```ts
import bibliography from "./references.bib";

presentation({ title: "Diffusion Language Models", bibliography });

slide("Background");
text(`Attention replaced recurrence ${cite("vaswani2017")}.`);

slide("References");
references();
```

## 参考文献

导入一个 BibTeX 文件,就是 Zotero、Mendeley 或 JabRef 这类文献管理软件导出的那种:

```ts
import bibliography from "./references.bib";
```

FrameSeq 在构建时读取这些条目:`@string` 缩写、花括号和引号里的值,以及 `{\"o}` 这样的 LaTeX 重音符号,都会变成纯文本。保存文件的修改后,预览会随之更新。

导入的名字请用 `bibliography`,不要用 `references`:那会遮住 `references()` 命令。

没有 BibTeX 文件的演示,也可以按键名把条目直接写出来:

```ts
presentation({
  title: "Literate slides",
  bibliography: {
    knuth1984: "Knuth, D. E. (1984). Literate programming. The Computer Journal, 27(2).",
    vaswani2017: {
      author: "Vaswani, Ashish and Shazeer, Noam",
      title: "Attention Is All You Need",
      booktitle: "NeurIPS",
      year: "2017",
    },
  },
});
```

字符串会原样作为参考文献使用。对象使用 BibTeX 的字段名,格式和 `.bib` 条目一样。

## 引用

`cite(...keys)` 返回要写进正文的引用标记:

```ts
text(`Attention replaced recurrence ${cite("vaswani2017")}.`);
bullets(`Earlier work ${cite("bahdanau2015", "graves2013")}`, "Our approach");
```

条目按第一次被引用的顺序编号,贯穿整场演示:`[1]`,然后是 `[2, 3]`,再次引用的条目保持原来的编号。因为标记就是普通文字,凡是能放文字的地方都能用:`text()`、`bullets()`、`card()`、表格单元格和图形标签。要把它放进句子中间,请用反引号写模板字符串。

参考文献里没有的键名会让文档报错停下,错误指出所在的行,如果有相近的键名,还会给出建议。

## 每一页的底部

每一页都在内容下方,按引用的顺序列出这一页引用的条目:

```text
[1] Vaswani, A., Shazeer, N., Parmar, N., & Uszkoreit, J. (2017). Attention Is All You Need. In NeurIPS.
```

这份列表和其他对象一样占用页面空间,所以上面的内容会收缩,而不会滑到它下面去,布局检查也能同时看到两者。如果引用时不想要每页的列表:

```ts
presentation({ bibliography, citations: { footnotes: false } });
```

## 脚注

`footnote(text)` 在页面底部加一条注释,并返回它的标记,一个上标数字:

```ts
text(`Measured on one GPU${footnote("An NVIDIA A100 with batch size 32.")}.`);
```

脚注在每一页都从 ¹ 开始编号,和这一页引用的条目共用页面底部。

## 参考文献表

`references()` 加入所有被引用过的条目,编号和 `cite()` 给的一致:

```ts
slide("References");
references();
```

它在整个文档运行完之后才填充,所以在它之后才出现的引用也会被列进去。`references({ all: true })` 还会在被引用的条目之后,加上参考文献里有、但这场讲演没有引用过的条目。列表太长时,可以用 [`.fit()`](content.md#让文字适应空间) 缩到一页之内:

```ts
references().fit();
```

## 作者与年份

想把引用写成作者和年份而不是数字:

```ts
presentation({ bibliography, citations: { style: "author-year" } });

text(`Attention replaced recurrence ${cite("vaswani2017")}.`);
// Attention replaced recurrence (Vaswani et al., 2017).
```

这时参考文献表按字母顺序排列。以纯字符串给出的条目没有作者可显示,所以仍然使用编号。

## 导出

引用标记、脚注和参考文献表都是文字,所以 PDF、PowerPoint 和 Typst 都会照浏览器里的样子带上它们,PowerPoint 里它们仍可编辑。
