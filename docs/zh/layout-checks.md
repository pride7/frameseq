<!-- translation-of: docs/layout-checks.md sha256:da7a13df1dbca91a -->

# 面向 AI 的布局检查

FrameSeq 可以检查**最终的浏览器布局**,给出人或编码代理都能直接照做的诊断。

```bash
frameseq check slides.ts
```

检查器会构建幻灯片、在无头浏览器里按原生画布尺寸打开、等字体加载完成,然后逐页检查。目前能发现:

- `empty-slide` —— 某一页没有可见内容,而且没有被显式标记为"有意留白"。
- `canvas-overflow` —— 渲染出的对象超出了页面画布。
- `text-clipped` —— 文字被裁切的文本框或祖先元素遮住。
- `font-too-small` —— 正文或代码小于 14px,或者页面标题小于 24px。
- `empty-region` —— `at()` 创建的命名区域从未收到任何内容。
- `similar-name` —— 同一页上两个名字只差一次编辑,通常意味着某个 `at()` 路径或 `.as()` 名字拼错了。

**画布溢出和文字裁切是错误**;空白页、字号过小、空区域、近似重名是警告。严格模式下任何警告都会失败。

拼错的路径在运行时是看不出来的 —— `at()` 你给什么它就建什么 —— 所以上面这两条规则专门用来抓"本想回到 `at("cell0/now")`,却写成了 `at("cell0/nwo")`"这种情况:

```text
WARNING Slide 1 "Roadmap" [similar-name]
  Names "cell0/now" and "cell0/nwo" are one edit apart.
  Suggestion: Rename one of them so the difference is deliberate.
```

由演示元数据自动生成的标题页算作可见内容。如果留白是有意的,就在源码里标明这个意图:

```ts
slide({ name: "Pause" }).allowEmpty();
```

用对象形式更顺手时,写 `SlideOptions` 里的 `allowEmpty: true`。在确认留白确实是有意的之前,不要急着消掉这条警告。

## 人类可读的输出

```text
ERROR Slide 4 "Architecture" [text-clipped]
  Text is clipped by 38px on the bottom.
  Object: text 3.1.2 "FrameSeq owns presentation structure..."
  Suggestion: Increase the text box size, reduce the font size, or shorten the content.
```

对象路径标识的是渲染后的 FrameSeq 节点。对自动化编辑器来说,它比生成的 CSS 选择器更有用,而且不依赖浏览器生成的类名。

## 给代理用的 JSON 输出

当结果要被另一个程序或 AI 代理消费时,用 `--json`:

```bash
frameseq check slides.ts --json
```

```json
{
  "version": 1,
  "file": "slides.ts",
  "canvas": { "width": 1280, "height": 720 },
  "summary": { "slides": 8, "errors": 1, "warnings": 0 },
  "issues": [
    {
      "severity": "error",
      "rule": "canvas-overflow",
      "slide": { "index": 4, "label": "Architecture" },
      "element": {
        "type": "text",
        "path": "3.1.2",
        "text": "FrameSeq owns presentation structure..."
      },
      "message": "Text exceeds the slide canvas by 38px on the bottom.",
      "details": { "left": 0, "right": 0, "top": 0, "bottom": 38 },
      "suggestions": [
        "Move the object inward or reduce its width, height, or font size."
      ]
    }
  ]
}
```

JSON 模式只把报告写到标准输出,便于重定向或直接解析。

## 退出码与严格模式

默认情况下,发现**错误**时命令以非零状态退出;警告只报告,不影响退出码。

```bash
frameseq check slides.ts --strict
```

严格模式下警告同样返回非零状态,适合放在 CI 里或发布幻灯片之前。

## 生成的项目

`npm create frameseq` 创建的项目会同时跑 TypeScript 和渲染布局检查:

```bash
npm run check
```

检查器**刻意只从高置信度的几何规则开始**。它目前不会否定有意的对象重叠,也不做主观的视觉评分。
