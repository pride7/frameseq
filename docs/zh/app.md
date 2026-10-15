<!-- translation-of: docs/app.md sha256:243da81d02539dd0 -->

# FrameSeq 应用

FrameSeq 应用一个下载就装好 FrameSeq 需要的一切,包括 Node.js,所以不需要事先安装任何东西。它把 FrameSeq Studio 放到打开程序的地方,并提供与 npm 安装相同的 `frameseq` 命令。

从[发布页](https://github.com/pride7/frameseq/releases/latest)下载:

| 系统 | 下载 | 安装内容 |
| --- | --- | --- |
| Windows | `FrameSeq-Setup-<version>-win-x64.exe` | 只为当前用户安装,不需要管理员权限:Studio 放进开始菜单,可选放到桌面,以及把 `frameseq` 加入 PATH。 |
| Windows,便携版 | `FrameSeq-<version>-win-x64.zip` | 什么都不安装:解压到任意位置,运行 `bin\frameseq.cmd`。 |
| macOS | `FrameSeq-<version>-mac-arm64.dmg`(Apple 芯片)、`…-mac-x64.dmg`(Intel) | 把 FrameSeq Studio 拖进"应用程序"。 |
| Linux | `FrameSeq-<version>-linux-x64.tar.gz`、`…-linux-arm64.tar.gz` | 解压后运行 `./FrameSeq/install.sh`:应用放在 `~/.local/share`,`frameseq` 放在 `~/.local/bin`,Studio 放进应用菜单。 |

## 里面有什么

- **Node.js**,FrameSeq 所用的运行时,只供 FrameSeq 使用。
- **FrameSeq** 及其全部依赖,和 npm 安装的是同一个包。
- **Typst 编译器和 Tectonic**,不另装它们,Typst 片段和 LaTeX 表格也能用。Tectonic 第一次编译某个片段时,会下载它需要的 TeX 文件。
- macOS 和 Linux 版附带**一个无头浏览器**,用于 PDF、PowerPoint 和布局检查。Windows 使用每台 Windows 电脑都有的 Microsoft Edge。
- **FrameSeq Studio 的窗口**,一个小程序,用系统自带的网页视图显示 Studio:Windows 上是 WebView2,macOS 和 Linux 上是 WebKit。

## 使用

从开始菜单、"应用程序"或应用菜单打开 FrameSeq Studio。它从启动页开始,在那里点一下就能新建演示;见 [FrameSeq Studio](studio.md)。

Studio 像桌面程序一样在自己的窗口里打开。在 Windows 上,菜单栏就是标题栏:拖动它移动窗口,双击它最大化,最小化、最大化和关闭按钮在它的右端。在 macOS 上,红绿灯按钮在菜单栏的左端。在 Linux 上,窗口保留桌面自己的标题栏,并且需要 WebKitGTK 4.1(`libwebkit2gtk-4.1`),大多数桌面都已经装了。关闭窗口会停止 Studio,有未保存的修改时会先询问。窗口打不开时,比如 Windows 上没有 WebView2、Linux 上没有 WebKitGTK,Studio 会改在浏览器的应用窗口里打开;设置 `FRAMESEQ_NO_STUDIO_WINDOW=1` 也会这样做。

`frameseq` 命令能做 [CLI 参考](cli.md)里描述的所有事情:

```bash
frameseq new talk.slides.ts
frameseq studio talk.slides.ts
frameseq pdf talk.slides.ts
```

从应用里运行时,`frameseq studio` 打开的也是这个窗口。

在 macOS 上,这个命令在应用内部。想把它放进 PATH:

```bash
sudo ln -s "/Applications/FrameSeq Studio.app/Contents/Resources/frameseq/bin/frameseq" /usr/local/bin/frameseq
```

VS Code 扩展会在 PATH 上找到应用的 `frameseq` 命令,就像它找到全局的 npm 安装一样。

## 导出与浏览器

PDF、PowerPoint 和 `frameseq check` 用 Chromium 浏览器渲染。应用按这个顺序寻找浏览器:

1. 环境变量 `FRAMESEQ_BROWSER` 指定的那个;
2. 应用自带的那个;
3. 电脑上安装的 Chrome、Edge、Chromium 或 Brave。

## 更新与卸载

把新版本装在旧版本上即可。在 Windows 上,从 **设置 › 应用** 卸载 FrameSeq;在 macOS 上,把 FrameSeq Studio 移到废纸篓;在 Linux 上,先运行 `frameseq shortcut --remove` 把 Studio 从菜单里移除,再删除 `~/.local/share/frameseq` 和 `~/.local/bin/frameseq`。

## 用应用还是用 npm?

两者运行的是同一个 FrameSeq。当演示放在一个有自己依赖的项目里,或者希望编程代理和 CI 像运行其他东西一样运行它时,按[快速上手](getting-started.md)用 npm 安装。如果只想写演示,而不想搭建开发环境,就安装应用。

安装程序目前还没有签名。在开启了**智能应用控制**的 Windows 11 上,Windows 偶尔会拒绝启动未签名的安装程序,取决于微软在线检查当时的结果;稍后再试一次,或者改用便携版 zip。Studio 的窗口同样没有签名,也可能这样被拒绝。所以开始菜单的快捷方式运行的是有 OpenJS 基金会签名的 Node.js,再由 Node.js 打开窗口;Windows 拒绝窗口时,Studio 改在浏览器的应用窗口里打开,而且在窗口程序改变之前(比如更新之后),FrameSeq 不会再尝试它。在其他 Windows 电脑上,SmartScreen 可能会在运行安装程序前询问(**更多信息 › 仍要运行**)。macOS 会要求确认第一次打开(在访达里 **按住 Control 点按 › 打开**)。给安装程序和窗口签名后,这些情况都会消失。

## 构建应用

在仓库的检出目录里,`node scripts/app-bundle.mjs` 为这台电脑构建应用;`--platform` 和 `--arch` 为其他平台构建。Windows 安装程序需要 Inno Setup 6,可以用它自己的安装程序、Chocolatey 或 Scoop(`scoop install extras/inno-setup`)安装;没有它时只生成 zip。

Studio 的窗口是 `desktop/` 里的 [Tauri](https://tauri.app) 程序,由 `node scripts/desktop-build.mjs` 用 Rust 构建,构建应用时会自动运行;在 Linux 上还需要 WebKitGTK 的开发文件(`libwebkit2gtk-4.1-dev`)。它只能在目标系统上构建,所以为其他系统构建的应用、没有 Rust 时构建的应用,或者加了 `--no-window` 的应用,会在浏览器的应用窗口里打开 Studio。想在检出目录里试用这个窗口,就让它使用检出目录里的命令:

```bash
node scripts/desktop-build.mjs
FRAMESEQ_DESKTOP_CLI=scripts/frameseq.mjs desktop/target/release/frameseq-studio talk.slides.ts
```推送版本标签时,GitHub Actions 会构建所有平台,并把下载附加到发布页上。见 [Release automation](../releasing.md)(英文)。
