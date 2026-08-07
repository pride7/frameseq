<!-- translation-of: docs/vscode.md sha256:c0b5e02ad719a070 -->

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
- 在预览里 Alt+点击,把光标移到画出该对象的那条命令上。
- 在预览里拖拽,改变命令写下的坐标、或对象在邻居之间的位置,作为一次可撤销的编辑。

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

## 从预览里编辑

预览运行期间,源码和页面是互相指向的。

在预览上按住 `Alt`,指针下的对象会描出轮廓;Alt+点击它,光标就移到写出它的那条命令上。

预览里的 `E` 控件开启布局编辑:

- 用 `position({ x, y })` 放置的对象可以拖动,写了 `width()` 或 `height()` 的可以从右下角缩放。松手即把这些数字写回。
- 处在文档流里的对象没有坐标可改,拖动它改变的是它在邻居之间的位置。预览会画出落点,该命令占据的整行会被搬过去,连同写在它上面或旁边的注释。
- `Ctrl+Z` 撤销上一次拖拽。在 VS Code 预览里,改动是通过工作区应用的,所以由编辑器自己的撤销覆盖;在浏览器里则由开发服务器保存历史。
- `Escape` 退出该模式。

只有拖拽真正改变的那几个字符会被重写,所以注释和格式都能留存。当数字和文件对不上时,拖拽会被**拒绝**而不是猜测——预览被拖动期间文档在编辑器里被改过,就是这种情况。

只有当源码里存在唯一一处改动能代表这次拖拽时,才会提供编辑:

- `position({ x: cursor, y: 90 })` 的 x 是算出来的,没有数字可以重写。
- 循环或辅助函数里的命令会从一行渲染出多个对象,拖拽指不到其中哪一个。
- 重排只在文档的同一个**运行段**内进行。`left()`、`cell(1)`、新的 `slide()`,以及会收拢上方对象的 `group(a, b)`,各自结束一段;把行搬过这些调用,改变的就不只是顺序,而是对象归属哪个区域。

不能拖拽的对象仍然可以点击,依旧能跳回它所在的行。源码位置只在 `frameseq dev` 服务期间记录,构建出来的演示文稿不含这些信息。
