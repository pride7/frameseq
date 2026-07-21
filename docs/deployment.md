# Deploy HTML

FrameSeq's interactive presentation is a static website. It needs no application server once it has been built.

## Build a portable static site

```bash
npm run build
```

This writes `index.html`, JavaScript, CSS, fonts, and other build assets to `dist/`. Asset links are relative, so the same directory works at a domain root or a nested path such as `https://user.github.io/my-talk/`.

Upload the entire `dist/` directory to any static host. Do not upload only its `index.html`, because the default build intentionally keeps cacheable assets in separate files.

## Publish with GitHub Pages

Projects created by `npm create frameseq` include `.github/workflows/pages.yml`. The workflow checks the presentation, builds `dist/`, and deploys it whenever `main` or `master` is updated.

1. Commit the generated project and push it to a GitHub repository.
2. Open the repository's **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Push to `main` or `master`, or run **Deploy FrameSeq presentation** from the repository's **Actions** tab.

For a repository named `my-talk`, the usual URL is `https://<user>.github.io/my-talk/`. A user or organization site repository named `<user>.github.io` is served at the domain root.

The GitHub source page and its **Raw** link are not presentation hosting. Use the Pages URL produced by the deployment job.

## Build one self-contained HTML file

```bash
npm run build:single
```

This creates only `dist/index.html`, with FrameSeq's generated JavaScript, CSS, fonts, and favicon embedded. It can be opened directly from disk, sent as one file, or uploaded to a static host.

Remote image URLs intentionally remain remote. If a presentation must work fully offline, use data URLs or local assets handled by the build rather than remote resources.
