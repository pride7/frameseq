# FrameSeq 鸿蒙电脑原型

这是供鸿蒙 Electron 运行时加载的应用目录。桌面入口为 `main.cjs`，窗口通过隔离的 `preload.cjs` 与 Studio 通信。

在仓库中构建：

```powershell
npm run harmony:build
```

产物在 `output/harmony/FrameSeq/`。界面和样式已在开发机编译；设备运行时只有 Node.js 内置模块、TypeScript、ws 和图标数据，不需要安装 npm、Vite、esbuild、Rollup 或 Tailwind 的原生模块。

使用开发机的 Electron 验证同一入口（自行提供 Electron 可执行文件）：

```powershell
& 'C:\path\to\electron.exe' 'D:\Projects\frameseq\output\harmony\FrameSeq'
```

也可以仅运行本地服务，在浏览器打开输出的 Studio 地址：

```powershell
node output/harmony/FrameSeq/scripts/harmony-server.mjs path/to/talk.slides.ts
```

自动验收：`npm run harmony:test` 会把产物复制到仓库之外，检查服务依赖、编辑、保存、预览、放映和文件边界。真实宿主测试需先设置 `FRAMESEQ_ELECTRON` 为开发机 Electron 可执行文件路径，再运行 `npm run harmony:shell-test`；它检查实际 preload、IPC、关闭确认和窗口操作，以测试选择结果代替系统文件对话框。两者均不代表鸿蒙真机已通过验证。

## 鸿蒙工程接入

生成 HAP 工程：

```powershell
npm run harmony:prepare
```

这会先构建应用，再取得 [ohosvscode 的 HAP 宿主](https://github.com/ohosvscode/ohos_electron_hap)的固定版本，输出 `output/harmony/hap/`。宿主提交、五个 ARM64 库的 SHA-256 和电脑设备类型保存在 [host.lock.json](host.lock.json)，生成过程验证库文件，拒绝 Git LFS 指针、错误架构和校验不一致的二进制。首次执行需要 Git、Git LFS、tar 和网络；宿主缓存保存在 `tmp/harmony-host/`。

FrameSeq 以 `io.github.pride7.frameseq` 为包名，应用名为 FrameSeq Studio，使用项目图标，设备类型为 `2in1`。应用资源放入 `web_engine/src/main/resources/resfile/resources/app/`；保留 `node_modules`、`client`、`lib` 和 `scripts` 的相对位置，入口为 `main.cjs`。宿主当前声明的兼容 SDK 为 `5.0.3(15)`；这是兼容下限，不代表已完成对应系统的真机验证。关于运行时 API 和宿主更新，参阅 [Electron 鸿蒙化指导](https://gitcode.com/openharmony-sig/electron)。

已有同一固定提交的宿主源码时，可以复用它，脚本不会修改该源码：

```powershell
npm.cmd run harmony:prepare -- --source 'D:\path\to\ohos_electron_hap'
```

生成的工程默认不携带签名配置。重复生成只替换本脚本创建的工程；发现被修改的构建配置、目录链接或其他项目时会拒绝覆盖。若已在 DevEco 中配置签名，请保留该工程，直接构建，不要重新生成。签名材料留在生成目录或仓库之外的本机目录。

## 构建未签名 HAP

从华为官方下载 [Command Line Tools](https://developer.huawei.com/consumer/cn/download/command-line-tools-for-hmos) 或 [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/)。使用包含 OpenHarmony 工具链及 HMS Kit 的完整 HarmonyOS SDK，普通 OpenHarmony SDK 不包含此宿主所引用的全部 Kit。

官网目前同时提供 6.1.1 和 26.0.0 系列。本项目正在使用 26.0.0 Release 尝试编译，它配套 HarmonyOS 7／API 26；工具链版本不等于应用最低系统版本。生成工程显式设置 `compatibleSdkVersion` 和 `targetSdkVersion` 为宿主原来的 `5.0.3(15)`，分别保留最低兼容配置和目标 API 行为，编译 SDK 则使用工具链自带版本。参阅[官方升级说明](https://developer.huawei.com/consumer/en/doc/harmonyos-releases/upgrade-adaptation)和[版本编号调整说明](https://developer.huawei.com/consumer/cn/doc/doccenter-release-notes/version-number-26)。这些配置仍需真实编译和设备验证。

本次 Windows 工具包版本、SHA-256 和已核对的华为 PGP 密钥指纹记录在 [toolchain.lock.json](toolchain.lock.json)。脚本会自动查找 `tmp/harmony-tools/<版本>/command-line-tools/` 中的本地安装。如果将工具解压在本仓库内部，请在其外层目录（例如 `tmp/harmony-tools/<版本>/`）放置内容为 `{"private":true,"type":"commonjs"}` 的 `package.json`，避免工具继承本仓库的 ES module 配置。工具在仓库外安装时无需此文件。

解压或安装后，先检查工具链，再构建：

```powershell
npm.cmd run harmony:doctor -- --tools 'C:\path\to\command-line-tools'
npm.cmd run harmony:hap -- --tools 'C:\path\to\command-line-tools'
```

`--tools` 也接受 DevEco Studio 的安装目录。SDK 不在该目录的 `sdk/` 下时，补充 `--sdk 'C:\path\to\sdk'`。也可以为当前终端设置 `FRAMESEQ_HARMONY_TOOLS` 和 `FRAMESEQ_HARMONY_SDK`，无需改动系统 PATH。

上述带参数的 PowerShell 示例显式使用 `npm.cmd`，避免本机 `npm.ps1` 吞掉 `--` 后的选项。在其他终端中可以使用普通的 `npm run`。

`harmony:doctor` 检查 `hvigorw`、`ohpm`、完整 SDK 和 Java，并报告是否发现用于设备调试的 `hdc`。`harmony:hap` 会先安装工程依赖，再调用 Hvigor 构建 `electron@default`；只有构建成功、产物的包名与版本匹配，并且包含 FrameSeq 应用资源和 ARM64 库时才报告成功。产物位于 `output/harmony/hap/electron/build/default/outputs/`，文件大小与 SHA-256 记录在 `output/harmony/hap/frameseq-hap-artifacts.json`。

若保持默认生成的构建配置，产物为 **未签名 HAP**。本机已使用官方 Windows Command Line Tools 26.0.0.851（SDK 26.0.0.105、Hvigor 6.26.8）完成真实 ArkTS 编译和 HAP 打包，核对了包内应用资源、五个 ARM64 库及应用标识。上游宿主仍有 ArkTS、弃用 API、权限和重复资源警告；构建通过不代表这些警告已解决，也不代表已完成系统兼容性验证。

接下来需要在 DevEco 中完成开发者签名，再进行鸿蒙电脑实机验收。宿主声明的权限包含 JIT 所需的 `ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY` 等权限，签名配置需按宿主要求处理；目前尚未验证签名及设备安装。`npm run harmony:hap-test` 使用测试宿主和测试工具检查接入逻辑，不代替真实 SDK 编译和设备验证。

文件选择通过 Electron 对话框取得路径，并在运行时提供该能力时持久化文件授权。配置和示例的可写副本放在应用自己的用户目录；应用安装资源不会被编辑。

## 第一阶段范围

- 新建、打开、编辑、保存及重新打开 `.slides.ts`。
- 实时预览、中文、图片、形状、表格、图表、KaTeX 公式、主题、母版和放映。
- 引用同目录内的 TypeScript/JavaScript、JSON、BibTeX 和图片文件；不支持任意 npm 包、计算得到的动态导入和 CommonJS。
- 沿用 Studio 的冲突检测、源代码定位、可视编辑、模板和 TypeScript 语言服务。
- 原型中导出、终端、外部 AI 命令行助手、自动更新和手机配对暂不可用，界面按实际能力禁用。
- Typst/LaTeX 原生排版、任意 Tailwind 工具类的运行时生成，以及鸿蒙多屏投影仍需适配；普通 `math()` 公式使用 KaTeX。

## 真机验收

在目标系统和选定 Electron 版本上验证以下流程后，才能称为可用的鸿蒙版：

1. 首次启动展示示例；关闭后再次启动保留编辑。
2. 系统选择器打开一个含中文文件名、图片、图表和公式的文稿，授权后重启仍可打开；检查同目录资源授权，以及临时文件加重命名的原子保存权限。
3. 双击编辑中文、拖动对象、撤销、修改代码，预览与磁盘文件一致。
4. 连续快速保存、外部修改和冲突处理均保持最后一次内容。
5. 新建文稿、切换文稿、用户模板封面与图片导入正常。
6. F5 放映、Esc 返回和关闭窗口的保存提示正常；单独记录外接显示器表现。

开发机浏览器测试不能代替鸿蒙的输入法、文件授权、窗口行为和系统兼容性测试。
