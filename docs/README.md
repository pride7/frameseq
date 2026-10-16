# FrameSeq documentation

FrameSeq makes slides in two ways, and both make the same file. Click and drag in FrameSeq Studio, as you would in PowerPoint, or write the slides as code. The Studio writes every click into the code, so you can switch from one to the other at any time.

**With the mouse**, one page gets a presentation made:

1. [Studio quick start](studio-quickstart.md) — install the app, start from a template, edit with the mouse, present, and export.

**With code**, three pages get a talk written: install FrameSeq, copy the page you need, then revise it.

1. [Getting started with code](getting-started.md) — a project, the first slides, a preview, an export.
2. [Recipes](recipes.md) — a complete slide for each page a talk needs, with the result beside it.
3. [Revising a talk](revising.md) — what a second draft costs, edit by edit.

Everything else is here for the moment a slide asks for it. You can also edit the [Online Playground](https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground) before installing anything.

A Chinese translation of this reading path is at [中文文档](zh/README.md).

## Studio and the app

The window you make slides in, and the download that installs it.

- [FrameSeq Studio](studio.md) — Every menu, panel, and shortcut, from the slide rail to presenter view.
- [FrameSeq app](app.md) — Install Studio and the frameseq command in one download, with no Node.js needed.

## Write slides

The model behind the recipes, one subject at a time.

- [Language tour](language.md) — The six ideas of FrameSeq: documents, slides, objects, the cursor, names, and checks.
- [Document model](document-model.md) — How presentation(), slide(), objects, and the active region fit together.
- [Content](content.md) — Text, lists, images, tables, charts, icons, QR codes, formulas, metrics, cards, and groups.
- [Citations and references](citations.md) — Cite from a BibTeX file, list each slide's sources at its foot, and build the reference list.
- [Layout](layout.md) — Normal flow, split pages, grids, local grids, region paths, and canvas.
- [Diagrams](diagrams.md) — Region paths, automatic rows and columns, names, and connectors that follow their objects.
- [Shapes and connectors](shapes.md) — The primitives a diagram is built from: 27 shapes, tones, and connectors that bend around them.
- [Styling](styling.md) — Chainable modifiers, text roles, dimensions, Tailwind utilities, and inline styles.
- [Themes](themes.md) — Built-in themes, presentation-wide typography, CJK text, and custom tokens.
- [Masters and templates](masters.md) — Slide masters drawn behind every slide, placeholders for titles and content, and templates of your own.
- [Posters and print](posters.md) — Pages for paper: A0 posters and handouts, printed sizes, and the poster theme.

## Typeset mathematics and tables

Bring an external typesetter in for the fragments that need one.

- [Typst integration](typst.md) — Embed Typst fragments, or export the whole presentation as editable .typ source.
- [LaTeX integration](latex.md) — Compile existing LaTeX tables and fragments into presentation objects.

## Check and generate

Verify the slides before presenting them, and hand the format to an agent.

- [Layout checks](layout-checks.md) — Detect empty pages, overflow, clipped text, small type, and mistyped region paths.
- [Generate with AI](ai-generation.md) — Give an agent the FrameSeq contract and iterate from layout diagnostics.

## Present and export

Deliver the talk and hand the file over afterwards.

- [Presenter and remote](presenter.md) — Notes, next-slide preview, timer, synchronised controls, and a phone remote.
- [Deploy HTML](deployment.md) — Publish a static presentation, use GitHub Pages, or build one portable file.
- [Export PowerPoint](pptx.md) — Editable hybrid PPTX or pixel-faithful flattened slides.

## VS Code and the command line

Drive FrameSeq from the tools you already use.

- [VS Code extension](vscode.md) — Split view, slide navigation, diagnostics, and export commands.
- [CLI reference](cli.md) — Development, remote control, HTML, PDF, PPTX, Typst, inspection, and checking.

## Reference

Look something up. Not part of the reading path.

- [Function reference](function-guide.md) — What each authoring function creates, its signature, parameters, and return value.
- [API reference](api-reference.md) — Exact TypeScript overloads, interfaces, and every public builder method.
- [Advanced composition](advanced.md) — The uppercase object API and lower-level components.
- [Changelog](../CHANGELOG.md) — User-visible changes across releases.
- [Release automation](releasing.md) — npm Trusted Publishing and the version-tag workflow.

The documentation tracks the latest published FrameSeq release.
