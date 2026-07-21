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
frameseq dev [file]
```

The default entry is `slides.ts`.

```bash
frameseq dev talk.slides.ts
```

The browser opens automatically and the presentation updates after source changes.

Press `P` in the audience page to open presenter view, or add `?presenter=1` to the preview URL. Both windows stay synchronized while they share the same origin and browser device.

## Build static HTML

```bash
frameseq build [file] [--output directory]
```

The default entry is `slides.ts` and the default output directory is `dist/`.

```bash
frameseq build talk.slides.ts --output site
```

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

## Project scripts

A project generated with `npm create frameseq` provides:

```bash
npm run dev
npm run build
npm run pdf
npm run check
```

Use `npx frameseq ...` when calling the local executable directly.
