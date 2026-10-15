# CLI reference

The npm package installs the `frameseq` executable, and so does the [FrameSeq app](app.md), which needs no Node.js.

## Create a slide file

```bash
frameseq new [file] [--template name]
```

If no file is provided, FrameSeq creates `slides.ts` in the current directory.

```bash
frameseq new quarterly.slides.ts
```

The command refuses to overwrite an existing file.

Without `--template`, the file holds a cover and a first slide. A template starts it further along, with the slides that kind of presentation usually needs:

```bash
frameseq new poster.slides.ts --template poster
```

| Template | What it starts with |
| --- | --- |
| `blank` | A cover and a first slide on a clean white page. |
| `midnight` | A dark talk for products and code: the problem, the design, the results. |
| `paper` | Warm serif pages for a story or an essay. |
| `minimal-academic` | A research talk: motivation, method, results, conclusion. |
| `beamer-default` | A plain Beamer-style lecture with a formula and a table. |
| `beamer-madrid` | The same lecture with a blue title bar and footer. |
| `beamer-cambridge-us` | The same lecture in burgundy and cream. |
| `poster` | An A0 conference poster in three columns. |

Each template is named after the [theme](themes.md) it uses, and passes `frameseq check --strict` as written. An unknown name lists the templates. [FrameSeq Studio](studio.md) offers the same templates, with their covers, when it makes a new presentation. The command writes English placeholders; the Studio writes Chinese ones when it is shown in Chinese.

## Start the development server

```bash
frameseq dev [file] [--host] [--remote]
```

The default entry is `slides.ts`.

```bash
frameseq dev talk.slides.ts
```

The browser opens automatically and the presentation updates after source changes.

Press `P` in the audience page to open presenter view, or add `?presenter=1` to the preview URL. Both windows stay synchronized while they share the same origin and browser device.

Add `--host` when the preview must be reached through a container or browser IDE such as StackBlitz:

```bash
frameseq dev talk.slides.ts --host
```

This exposes the Vite development server without enabling FrameSeq's phone-remote interface. The default command remains bound to localhost.

Add `--remote` when presenting to expose the server on the local network and enable QR-code phone pairing:

```bash
frameseq dev talk.slides.ts --remote
```

The phone and presentation computer must be on the same local network. This mode includes the behavior of `--host` and enables a local WebSocket relay for slide navigation, reveal steps, and the laser pointer; it does not use a FrameSeq cloud service.

## Open FrameSeq Studio

```bash
frameseq studio [file] [--host] [--remote] [--no-open] [--tab] [--background]
```

This starts the development server and opens [FrameSeq Studio](studio.md): the slide rail, a TypeScript editor, the live preview, and live layout checks in one window.

```bash
frameseq studio talk.slides.ts
```

Without a file, and with no `slides.ts` in the current directory, the Studio opens on its start page, which creates new presentations and opens existing and recent ones.

The Studio opens as an app window when Chrome, Edge, Chromium, or Brave is installed, and in the default browser otherwise. `--tab` always uses a browser tab, and `--no-open` opens nothing. `--background` returns at once and leaves the Studio running without a terminal until its window closes; its output goes to `studio.log` in FrameSeq's settings folder.

The Studio writes the slide document, so its interface answers only this computer. `--host` shares it with the network for a container or a browser IDE; anyone who can reach the address can then edit the deck. `--remote` starts with the [phone remote](studio.md#presenting-and-exporting) on, as **Present › Phone remote…** turns it on: the network can then open the slides and follow the show, and nothing else.

## Add a shortcut

```bash
frameseq shortcut [--remove]
```

This adds **FrameSeq Studio** to the Start menu and the desktop on Windows, to `~/Applications` on macOS, and to the applications menu on Linux. The shortcut runs `frameseq studio --background` with this installation of FrameSeq and opens the start page. `--remove` deletes it again.

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
frameseq pdf [file] [--output path] [--slides 1-3,5]
```

The default output is `output/pdf/<entry-name>.pdf`.

```bash
frameseq pdf quarterly.slides.ts
frameseq pdf quarterly.slides.ts --output reports/quarterly.pdf
```

PDF export launches a headless browser, renders all pages and reveal steps, and writes a page-sized PDF with backgrounds included. A presentation made for paper, such as a poster, prints at the paper's size; see [Posters and print](posters.md).

## Export PowerPoint

```bash
frameseq pptx [file] [--output path] [--flatten] [--slides 1-3,5]
```

The default output is `output/pptx/<entry-name>.pptx`.

```bash
frameseq pptx quarterly.slides.ts
frameseq pptx quarterly.slides.ts --output reports/quarterly.pptx
frameseq pptx quarterly.slides.ts --flatten
```

The default hybrid export keeps plain text, code, shapes, lines, and arrows as editable PowerPoint objects. Math, Typst, compiled LaTeX, and other complex rendered fragments use high-resolution image objects. Speaker notes are preserved.

`--flatten` exports each complete slide as one high-resolution image. This provides the closest browser-to-PowerPoint appearance, but individual visible objects cannot be edited. See [Export PowerPoint](pptx.md) for the mapping and limitations.

## Export Typst

```bash
frameseq typst [file] [--output path] [--slides 1-3,5]
```

The default output is `output/typst/<entry-name>.typ`.

```bash
frameseq typst quarterly.slides.ts
frameseq typst quarterly.slides.ts --output reports/quarterly.typ
```

The exporter writes editable Typst pages, maps LaTeX formulas and basic text through MiTeX, and converts common LaTeX `tabular` fragments into native Typst tables. Native Typst fragments remain source; unsupported LaTeX and CSS features use documented fallbacks or conversion notes. See [Typst integration](typst.md).

## Export some of the slides

`pdf`, `pptx`, and `typst` take `--slides` to export only the slides it names: slide numbers and ranges of them, separated by commas and counted from 1, as the slide counter counts them.

```bash
frameseq pdf quarterly.slides.ts --slides 1-3,5
frameseq pptx quarterly.slides.ts --slides 4
```

The slides keep the order they have in the presentation, and their numbers: a footer that counts the slides still counts all of them. Without `--output`, the file is named for the slides, such as `output/pdf/quarterly-slides-1-3,5.pdf` or `output/pptx/quarterly-slide-4.pptx`, so it never replaces the export of the whole presentation. A slide past the last one stops the export before anything is written. An HTML build always has every slide.

## Check the rendered layout

```bash
frameseq check [file] [--json] [--strict]
```

The checker renders every slide in a headless browser and detects empty slides, objects outside the canvas, clipped text, and text that is too small for presentation use.

```bash
frameseq check talk.slides.ts
frameseq check talk.slides.ts --json
frameseq check talk.slides.ts --strict
```

Errors return a non-zero exit code. Warnings fail only in strict mode. JSON output includes the slide index and label, FrameSeq object type and path, the line of the command that made the object, measured geometry, and suggested corrections. See [AI-friendly layout checks](layout-checks.md).

## When the document does not run

`check`, `pdf`, `pptx`, and `typst` run the slide document before anything else. When it throws, they stop at once and name the statement it was running, with the line that caused it, the way a compiler reports an error:

```text
talk.slides.ts:24:1  error  ref() cannot find an object named "decodr"; named objects on this slide: encoder, decoder
  23 | rect("Decoder").as("decoder");
> 24 | ref("decodr").fill("#dbeafe");
```

The exit code is non-zero. `check --json` reports it as a `document-error` issue.

## Inspect the source document

```bash
frameseq inspect [file] [--json]
```

Inspection parses the TypeScript source without starting a browser. It reports slide order, labels, layouts, speaker-note presence, object types, and source locations.

```bash
frameseq inspect talk.slides.ts
frameseq inspect talk.slides.ts --json
```

The stable JSON form is intended for editor integrations and coding agents. The FrameSeq VS Code extension uses it to build its slide outline and navigate directly to `slide()` calls.

## Serve the slides to a coding agent

```bash
frameseq mcp [file]
```

`frameseq mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server, so a coding agent such as Claude Code, Codex, or Cursor sees the presentation as it renders, not only its source. It speaks MCP on standard input and output and offers four tools, each of which only reads:

| Tool | What the agent gets |
| --- | --- |
| `outline` | Every slide with its title, layout, the source lines that write it, and how many objects it holds. |
| `check` | What FrameSeq Studio lists: TypeScript errors, names that refer to nothing, an error the document throws, and the [layout rules](layout-checks.md), each with its line. |
| `screenshot` | Slides as PNG pictures, up to six at once. |
| `guide` | FrameSeq's authoring guide, `llms.txt`. |

The slides render in a development server of its own, which starts on the first call and keeps running, so later calls answer in about a second. Add the server to an agent once per presentation:

```bash
claude mcp add frameseq -- npx frameseq mcp talk.slides.ts
codex mcp add frameseq -- npx frameseq mcp talk.slides.ts
```

With the [FrameSeq app](app.md), use `frameseq` in place of `npx frameseq`. FrameSeq Studio's [assistant](studio.md#the-assistant) gives the same server to the agent it runs, with nothing to set up.

## Project scripts

A project generated with `npm create frameseq` provides:

```bash
npm run dev
npm run studio
npm run present
npm run build
npm run build:single
npm run pdf
npm run pptx
npm run typst
npm run check
```

`npm run check` validates both TypeScript and the rendered slide layout.

Use `npx frameseq ...` when calling the local executable directly.
