<!-- translation-of: docs/vscode.md sha256:202d1b7dc237906c -->

# Visual Studio Code 扩展

FrameSeq 扩展给 VS Code 加上了理解演示结构的导航和命令,同时**不替换** FrameSeq 的渲染器。

## 当前功能

- 活动栏里的 FrameSeq 视图,按源码顺序列出每个 `slide()`。
- 显示页面标签、布局、对象数量和备注标记。
- 从大纲条目或布局问题一键跳到对应的 `slide()` 调用。
- 左边 `slides.ts`、右边实时预览的分屏工作区。
- 大纲与预览联动,以及当前页/上一页/下一页命令。
- 状态栏显示光标所在的页面。
- 插入新页的命令,以及常见 FrameSeq 结构的 TypeScript 代码片段。
- 实时预览的启动与停止控制。
- 布局检查结果显示在 VS Code 的 Problems 面板。
- Slides 视图工具栏上的导出按钮,可选 HTML、PDF、PPTX 和可编辑 Typst。

扩展通过 `frameseq inspect --json` 读取大纲,并调用项目里已安装的 FrameSeq CLI 来预览、校验和导出。**它不会再打包一份渲染运行时。**

## 本地构建与安装

在 FrameSeq 仓库里:

```bash
npm install
npm run vscode:package
```

打包好的扩展写入:

```text
output/vscode/frameseq-vscode.vsix
```

在 VS Code 扩展视图里用 **Install from VSIX...** 安装,或者用命令行:

```bash
code --install-extension output/vscode/frameseq-vscode.vsix
```

安装之后打开一个 FrameSeq 项目。该项目必须已经装好 npm 依赖,扩展才能调用本地的 `frameseq` 可执行文件。

运行 **FrameSeq: Preview** 会把入口文档留在第一个编辑器组,并在旁边打开预览。如果你更希望预览出现在当前编辑器组里,把 `frameseq.previewBeside` 设为 `false`。在 FrameSeq 大纲里选中某一页会同时更新源码选区和实时预览,这个行为由 `frameseq.followOutline` 控制。

## 入口文件的选择

优先使用当前打开的 `slides.ts` 或 `*.slides.ts` 编辑器。否则扩展使用 `frameseq.entry` 设置里的路径:

```json
{
  "frameseq.entry": "slides.ts"
}
```

如果该文件不存在,扩展会查找工作区里第一个 `*.slides.ts` 文档。

## 命令

打开命令面板运行:

- `FrameSeq: Refresh Slides`
- `FrameSeq: Preview`
- `FrameSeq: Preview Current Slide`
- `FrameSeq: Previous Slide`
- `FrameSeq: Next Slide`
- `FrameSeq: Insert Slide After Current`
- `FrameSeq: Stop Preview`
- `FrameSeq: Check Layout`
- `FrameSeq: Export HTML`
- `FrameSeq: Export PDF`
- `FrameSeq: Export PPTX`
- `FrameSeq: Export Typst`

保存当前幻灯片文档时默认会刷新大纲。如果有别的工具在频繁改写源码,可以关掉 `frameseq.autoRefresh`。

## 布局诊断

`FrameSeq: Check Layout` 跑的是和下面这条命令相同的渲染检查:

```bash
frameseq check slides.ts --json
```

错误和警告会标注在相关的 `slide()` 行上、出现在 Problems 面板里,同时也显示在大纲中该页的下方。**判断溢出、裁切、空白页和最小字号的依据始终是浏览器渲染结果。**
