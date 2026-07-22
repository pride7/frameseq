# CLI reference

The npm package installs the `frameseq` executable.

## Create a slide file

```bash
frameseq new [file]
```

If no file is provided, FrameSeq creates `slides.ts` in the current directory.

```bash
frameseq new quarterly.slides.ts
```

The command refuses to overwrite an existing file.

## Start the development server

```bash
frameseq dev [file] [--remote]
```

The default entry is `slides.ts`.

```bash
frameseq dev talk.slides.ts
```

The browser opens automatically and the presentation updates after source changes.

Press `P` in the audience page to open presenter view, or add `?presenter=1` to the preview URL. Both windows stay synchronized while they share the same origin and browser device.

Add `--remote` when presenting to expose the server on the local network and enable QR-code phone pairing:

```bash
frameseq dev talk.slides.ts --remote
```

The phone and presentation computer must be on the same local network. This mode enables a local WebSocket relay for slide navigation, reveal steps, and the laser pointer; it does not use a FrameSeq cloud service.

## Build static HTML

```bash
frameseq build [file] [--output directory] [--single-file]
```

The default entry is `slides.ts` and the default output directory is `dist/`.

```bash
frameseq build talk.slides.ts --output site
```

The default build uses relative asset paths, so the whole output directory can be deployed at a domain root or a repository subpath such as GitHub Pages.

Use `--single-file` to inline the JavaScript, CSS, fonts, and framework assets into one portable `index.html`:

```bash
frameseq build talk.slides.ts --single-file
```

The single file can be opened directly or uploaded wherever one HTML file is more convenient. Images loaded from remote URLs remain remote; use data URLs or build-managed local assets when every resource must be embedded.

## Export PDF

```bash
frameseq pdf [file] [--output path]
```

The default output is `output/pdf/<entry-name>.pdf`.

```bash
frameseq pdf quarterly.slides.ts
frameseq pdf quarterly.slides.ts --output reports/quarterly.pdf
```

PDF export launches a headless browser, renders all pages and reveal steps, and writes a page-sized PDF with backgrounds included.

## Export PowerPoint

```bash
frameseq pptx [file] [--output path] [--flatten]
```

The default output is `output/pptx/<entry-name>.pptx`.

```bash
frameseq pptx quarterly.slides.ts
frameseq pptx quarterly.slides.ts --output reports/quarterly.pptx
frameseq pptx quarterly.slides.ts --flatten
```

The default hybrid export keeps plain text, code, shapes, lines, and arrows as editable PowerPoint objects. Math, Typst, and other complex rendered fragments use high-resolution image objects. Speaker notes are preserved.

`--flatten` exports each complete slide as one high-resolution image. This provides the closest browser-to-PowerPoint appearance, but individual visible objects cannot be edited. See [Export PowerPoint](pptx.md) for the mapping and limitations.

## Check the rendered layout

```bash
frameseq check [file] [--json] [--strict]
```

The checker renders every slide in a headless browser and detects objects outside the canvas, clipped text, and text that is too small for presentation use.

```bash
frameseq check talk.slides.ts
frameseq check talk.slides.ts --json
frameseq check talk.slides.ts --strict
```

Errors return a non-zero exit code. Warnings fail only in strict mode. JSON output includes the slide index and label, FrameSeq object type and path, measured geometry, and suggested corrections. See [AI-friendly layout checks](layout-checks.md).

## Project scripts

A project generated with `npm create frameseq` provides:

```bash
npm run dev
npm run present
npm run build
npm run build:single
npm run pdf
npm run pptx
npm run check
```

`npm run check` validates both TypeScript and the rendered slide layout.

Use `npx frameseq ...` when calling the local executable directly.
