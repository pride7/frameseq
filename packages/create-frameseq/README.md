# create-frameseq

Create a new FrameSeq presentation project:

```bash
npm create frameseq@latest my-talk
cd my-talk
npm install
npm run dev
```

Press `P` in the presentation to open the synchronized presenter view.

Run `npm run present`, select `R`, and scan the QR code to control navigation and the laser pointer from a phone on the same Wi-Fi.

Run `npm run check` to validate TypeScript and inspect the rendered deck for overflow, clipped text, and text that is too small.

`npm run build` creates a static site in `dist/`. `npm run build:single` creates one self-contained `dist/index.html`.

`npm run pdf` exports a PDF. `npm run pptx` exports an editable hybrid PowerPoint; add `-- --flatten` to render each slide as one image for maximum fidelity.

Every generated project includes `.github/workflows/pages.yml`. Push the project to a GitHub repository, select **GitHub Actions** under **Settings → Pages → Build and deployment**, and each push to `main` or `master` will publish the presentation.
