<!-- translation-of: docs/deployment.md sha256:80a028f93a2b25cb -->

# 部署 HTML

FrameSeq 的交互式演示就是一个静态网站。构建完成之后不需要任何应用服务器。

## 构建可移植的静态站点

```bash
npm run build
```

这会把 `index.html`、JavaScript、CSS、字体和其它构建产物写入 `dist/`。资源链接是相对的,所以同一个目录既能放在域名根目录,也能放在 `https://user.github.io/my-talk/` 这样的子路径下。

把整个 `dist/` 目录上传到任意静态主机。**不要只传 `index.html`** —— 默认构建刻意把可缓存的资源分成独立文件。

## 用 GitHub Pages 发布

`npm create frameseq` 生成的项目自带 `.github/workflows/pages.yml`。这个工作流会检查演示、构建 `dist/`,并在 `main` 或 `master` 更新时部署。

1. 提交生成的项目并推到 GitHub 仓库。
2. 打开仓库的 **Settings → Pages**。
3. 在 **Build and deployment** 下,把来源选成 **GitHub Actions**。
4. 推送到 `main` 或 `master`,或者在仓库的 **Actions** 页手动运行 **Deploy FrameSeq presentation**。

对于名为 `my-talk` 的仓库,地址通常是 `https://<user>.github.io/my-talk/`。名为 `<user>.github.io` 的用户/组织站点仓库则直接服务于域名根目录。

GitHub 的源码页面和它的 **Raw** 链接**不是**演示托管。请使用部署任务产出的 Pages 地址。

## 为多个演示项目构建 Gallery

FrameSeq 仓库自带一个 Gallery 构建器和专用的 Pages 工作流。本地运行:

```bash
npm run build:gallery
```

它会生成 `dist/gallery/`,包含一个静态落地页和若干可独立浏览的演示示例。`.github/workflows/gallery.yml` 用官方的 Pages artifact action 上传该目录,并且只从 `main` 部署。同样的模式可以把一个仓库里的多个相关演示项目一起发布。

## 构建单个自包含 HTML

```bash
npm run build:single
```

它只生成 `dist/index.html`,把 FrameSeq 生成的 JavaScript、CSS、字体和图标全部内嵌。这个文件可以直接从磁盘打开、作为单个文件发送,或者上传到静态主机。

远程图片 URL 会**刻意保持远程**。如果演示必须完全离线可用,请改用 data URL 或由构建处理的本地资源,而不是远程资源。
