<p align="center">
  <img src="public/favicon.svg" width="64" height="64" alt="">
</p>

<h1 align="center">FrameSeq</h1>

<p align="center"><strong>Slides you can click. Code you can read.</strong></p>

<p align="center">
  <a href="https://pride7.github.io/frameseq/download/">Download</a> ·
  <a href="https://pride7.github.io/frameseq/">Website</a> ·
  <a href="https://pride7.github.io/frameseq/docs/">Documentation</a> ·
  <a href="https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground">Try it online</a> ·
  <a href="https://github.com/pride7/frameseq/blob/main/README.zh-CN.md">中文</a>
</p>

<p align="center">
  <a href="https://github.com/pride7/frameseq/actions/workflows/ci.yml"><img src="https://github.com/pride7/frameseq/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://pride7.github.io/frameseq/"><img src="https://github.com/pride7/frameseq/actions/workflows/gallery.yml/badge.svg" alt="Website"></a>
  <a href="https://www.npmjs.com/package/@pride7/frameseq"><img src="https://img.shields.io/npm/v/@pride7/frameseq" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

FrameSeq Studio has the menus, Insert gallery, format pane, slide masters, and presenter view you know from PowerPoint. Underneath, every slide is one readable file: AI can write it, Git can track it, and one command makes it an editable PowerPoint, a PDF, or a website.

![FrameSeq Studio with slide thumbnails, the slide's code, and its preview side by side](https://pride7.github.io/frameseq/images/studio.webp)

Free and open source, for Windows, macOS, and Linux.

## Get started

**Download the app.** The [download page](https://pride7.github.io/frameseq/download/) has an installer for Windows, disk images for macOS, and archives for Linux. The app brings its own Node.js, Typst, and Tectonic, so there is nothing to install first, and it keeps itself up to date. Then the [Studio quick start](https://pride7.github.io/frameseq/docs/studio-quickstart.html) makes your first slides, step by step.

**Install with npm.**

```bash
npm create frameseq@latest my-talk
cd my-talk
npm install
npm run studio
```

To write a single slide file in any folder instead, install FrameSeq once and open the file in the Studio:

```bash
npm install --global @pride7/frameseq
frameseq studio my-talk.slides.ts
```

**Try it in the browser.** The [playground on StackBlitz](https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground) opens a slide file beside a live preview, ready to edit.

## Everything you reach for in PowerPoint

There is nothing to learn first: point, drag, and type, and the Studio writes the code.

- **Insert anything.** Text, formulas, pictures, tables, charts, icons, and 27 shapes from one gallery. Drag a shape out, and it lands where you drew it.
- **Format pane.** Select an object to change its words, colour scheme, fill, outline, size, and position. Each change is one undoable step.
- **Right-click menus.** Cut, copy, paste, duplicate, bring to front, align, and go to code, with the shortcuts you already know.
- **Slide masters and templates.** Draw a logo, a footer, or a title bar once, and every slide follows. Keep any presentation as a template of your own.
- **New slides from 12 layouts**, speaker notes right under the slide, and `Ctrl+Z` for everything.
- **English and Chinese**, menus and messages alike.

<table>
  <tr>
    <td width="50%"><img src="https://pride7.github.io/frameseq/images/studio-insert.webp" alt="The Insert gallery"></td>
    <td width="50%"><img src="https://pride7.github.io/frameseq/images/studio-format.webp" alt="The format pane"></td>
  </tr>
  <tr>
    <td align="center">Insert gallery</td>
    <td align="center">Format pane</td>
  </tr>
</table>

`Ctrl+E` folds the code away for anyone who never wants to see it. Keep it open, and Alt-click any object to jump to its line, with TypeScript completions, hover help, and errors as you type. Dragging a shape changes only its numbers. See [FrameSeq Studio](https://pride7.github.io/frameseq/docs/studio.html).

## Ask the AI assistant for a change

The Assistant panel runs Claude Code or Codex, whichever your computer has, on your own sign-in. It edits the slides, checks the layout, looks at what it drew, and lays out every edit for you to accept or reject.

![The AI assistant turning a roadmap slide into four chevrons](https://pride7.github.io/frameseq/images/studio-assistant.webp)

Prefer your own agent? Claude Code, Codex, and Cursor connect to `frameseq mcp` to outline, check, and see the slides, and any model can learn the language from [llms.txt](https://pride7.github.io/frameseq/llms.txt). See [AI generation](https://pride7.github.io/frameseq/docs/ai-generation.html).

## One file that reads from top to bottom

Every slide is a few lines of TypeScript, with no imports, no nesting, and no markup. Source order is reading order, so a diff shows exactly what changed, and an AI writes it without getting lost.

```ts
presentation({ title: "Atlas 2.0", theme: "minimal-academic" });

slide("Faster every release").split("38:62")
  .notes("Median load time, measured on a mid-range phone over 4G.");
text("Median time to first tile fell by two thirds in a year.").lead();
bullets(
  "Vector tiles replaced images",
  "A cache at every edge",
  "Fonts shipped with the app",
);
right();
chart("bar", { "1.0": 840, "1.4": 610, "1.8": 430, "2.0": 280 })
  .unit(" ms")
  .colors("#0d9488");
```

`.split()`, `.grid()`, and `.canvas()` lay a slide out, and `right()` and `cell()` say where the next lines go. Before you present, `frameseq check` measures the drawn slides and names each overflow, clipped line, and tiny font by its object:

```text
$ npx frameseq check talk.slides.ts
ERROR Slide 4 "Architecture" [text-clipped]
  Text is clipped by 38px on the bottom.
```

Start with the [language tour](https://pride7.github.io/frameseq/docs/language.html), then the [function reference](https://pride7.github.io/frameseq/docs/function-guide.html).

## Built for real talks

- **Diagrams.** 27 shapes with colour schemes worked out against your theme, and connectors that turn at right angles around everything in their way. See [Diagrams](https://pride7.github.io/frameseq/docs/diagrams.html).
- **Equations and typesetting.** Inline or display equations in LaTeX, and Typst or LaTeX tables where a fragment needs more.
- **Charts and tables.** Bar, line, pie, and donut charts and ruled tables, drawn from the numbers in the file.
- **Posters.** A0 posters from the same language, with type sized for paper and PDFs at the sheet's real size. See [Posters and print](https://pride7.github.io/frameseq/docs/posters.html).
- **Citations, icons, and QR codes.** Import a `.bib` file and `cite()` as you write; Lucide's icons come by name, and `qr()` puts a link on the last slide.
- **Themes.** Seven themes ship with FrameSeq, and a master or `defineTheme()` makes one your own. See [Themes](https://pride7.github.io/frameseq/docs/themes.html).

## Present with two screens and a phone

Press `F5` and the slides fill the screen. With a projector attached, they go to the projector, and presenter view stays on your laptop with the notes, the next slide, and a timer. Scan a QR code to change slides from your phone, read the notes on it, and point a laser at the screen.

![Presenter view with the notes, the next slide, and a timer](https://pride7.github.io/frameseq/images/studio-presenter.webp)

## One file, four formats

Shapes, charts, and tables reach PowerPoint as native objects your colleagues can edit, and any export can take just the slides you choose.

| Format | Command | What you get |
| --- | --- | --- |
| PowerPoint | `frameseq pptx talk.slides.ts` | Editable text boxes, preset shapes, charts, and tables |
| PDF | `frameseq pdf talk.slides.ts` | Faithful to the last pixel, at the paper's size for posters |
| Website | `frameseq build talk.slides.ts` | Interactive slides with presenter view, for any static host |
| Typst | `frameseq typst talk.slides.ts` | Typst source you can keep typesetting |

The Studio's **Export** menu does the same. See the [command line reference](https://pride7.github.io/frameseq/docs/cli.html).

## Fits the way you work

- **Visual Studio Code.** A live preview beside the source, layout findings in Problems, export, and Open in Studio. Get the [extension](https://marketplace.visualstudio.com/items?itemName=pride7.frameseq).
- **Command line and CI.** An overflowing slide can stop a merge, and the slides publish as a static site. See [Deployment](https://pride7.github.io/frameseq/docs/deployment.html).
- **Git.** Every revision is a readable diff. Branch a talk for a new audience, and share pieces between talks. See [Revising slides](https://pride7.github.io/frameseq/docs/revising.html).

## Documentation

- [Getting started](https://pride7.github.io/frameseq/docs/getting-started.html)
- [Language tour](https://pride7.github.io/frameseq/docs/language.html)
- [Function reference](https://pride7.github.io/frameseq/docs/function-guide.html)
- [All documentation](https://pride7.github.io/frameseq/docs/), also [in Chinese](https://pride7.github.io/frameseq/docs/zh/)
- [Changelog](https://github.com/pride7/frameseq/blob/main/CHANGELOG.md)

## Development

```bash
npm ci
npm run studio          # open slides.ts in the Studio
npm run release:check   # everything CI runs
```

`release:check` builds the library, demo, and website, runs the browser tests at desktop and mobile sizes, installs the packed npm tarballs in a clean project, and exports PDF and PowerPoint files. Every push runs it on GitHub Actions, in four groups side by side (`node scripts/test-suite.mjs studio` runs one of them), and pushes to `main` deploy the website. User-visible changes go under **Unreleased** in [CHANGELOG.md](CHANGELOG.md); [Release FrameSeq](https://pride7.github.io/frameseq/docs/releasing.html) covers publishing.

## License

[MIT](LICENSE)
