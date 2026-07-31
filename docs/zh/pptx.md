<!-- translation-of: docs/pptx.md sha256:8a0a1d307b123e1f -->

# 导出 PowerPoint

FrameSeq 可以把幻灯片导出为 `.pptx`,不需要安装 Microsoft PowerPoint。导出器先让浏览器完成正常的 FrameSeq 布局,再把测量到的对象映射成 PowerPoint 坐标。

## 可编辑导出

运行:

```bash
npm run pptx
```

或者直接用 CLI:

```bash
npx frameseq pptx slides.ts
npx frameseq pptx slides.ts --output output/my-talk.pptx
```

默认输出到 `output/pptx/<入口名>.pptx`。

可编辑导出采用混合映射:

| FrameSeq 内容 | PowerPoint 结果 |
| --- | --- |
| 普通文字、列表、代码 | 可编辑文本框 |
| 矩形和圆 | 可编辑的 PowerPoint 图形 |
| 线与箭头 | 可编辑的 PowerPoint 线条 |
| 完整边框 | 原生的 PowerPoint 图形边框 |
| 局部边框(比如 `border-bottom`) | 对应边上的可编辑线条对象 |
| 图片 | PowerPoint 图片对象 |
| LaTeX 公式、行内公式、Typst 和编译后的 LaTeX 片段 | 高分辨率图片对象 |
| 演讲者备注 | PowerPoint 演讲者备注 |

结构化布局和 `position()` 使用的是**最终的浏览器几何**,所以 PowerPoint 里的坐标遵循与 HTML、PDF 相同的 `split()`、`grid()`、`canvas()` 和主题布局。

## 扁平化导出

当视觉保真度比对象级可编辑更重要时,用扁平化模式:

```bash
npx frameseq pptx slides.ts --flatten
```

每一页变成一张铺满 PowerPoint 页面的高分辨率图片。演讲者备注仍然保留,但可见内容不再是可单独编辑的对象。

大量依赖渐变、阴影、滤镜、复杂自定义 HTML 或 PowerPoint 无法直接表达的 CSS 效果时,推荐扁平化模式。

## 字体与视觉差异

可编辑的 PowerPoint 文字使用浏览器报告的字族。请在打开 `.pptx` 的电脑上安装同样的字体,否则 PowerPoint 可能替换字体并改变换行。收件人无法安装演示字体时,用 `--flatten`。

**PowerPoint 每个文本 run 只能存一个字体名**,所以包含中日韩字符的 run 会用主题字族链里的**第一个 CJK 字族**导出,而不是排在最前的拉丁字族。这些字体本身也带拉丁字形,所以中英混排的 run 仍然一致。想控制传给 PowerPoint 的字体名,把你偏好的字族放在最前:

```ts
presentation({ font: { family: '"Microsoft YaHei", Inter, sans-serif' } });
```

CSS 布局和坐标会被保留,但并非每种浏览器视觉效果都有 PowerPoint 原生对应物。纯色填充、排版、基础图形和连线是直接映射的。四条 CSS 边框一致时,FrameSeq 使用原生图形边框;只有部分边可见或各边不同时,它为这些边生成独立的可编辑线条对象。公式、Typst 和编译后的 LaTeX 片段以高分辨率图片保持视觉稳定。

## 揭示步骤

PPTX 导出为每一页 FrameSeq 幻灯片生成一页 PowerPoint。所有 `steps()` 和 `showAt()` 的内容都可见,与 PDF 和打印行为一致。交互式的逐步揭示仍然是 HTML 演示独有的能力。
