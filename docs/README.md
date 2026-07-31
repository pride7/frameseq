# FrameSeq documentation

Three pages get a talk written: install FrameSeq, copy the page you need, then revise it. Everything else is here for the moment a slide asks for it.

1. [Getting started](getting-started.md) — a project, the first slides, a preview, an export.
2. [Recipes](recipes.md) — a complete slide for each page a talk needs, with the result beside it.
3. [Revising a talk](revising.md) — what a second draft costs, edit by edit.

You can also explore the [Live Gallery](https://pride7.github.io/frameseq/) or edit the [Online Playground](https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground) before installing anything.

A Chinese translation of this reading path is at [中文文档](zh/README.md).

## Write slides

The model behind the recipes, one subject at a time.

- [Document model](document-model.md) — How presentation(), slide(), objects, and the active region fit together.
- [Content](content.md) — Text, lists, images, code, formulas, metrics, cards, and groups.
- [Layout](layout.md) — Normal flow, split pages, grids, local grids, region paths, and canvas.
- [Diagrams](diagrams.md) — Region paths, automatic rows and columns, names, and connectors that follow their objects.
- [Shapes and connectors](shapes.md) — The primitives a diagram is built from: rectangles, circles, lines, and arrows.
- [Styling](styling.md) — Chainable modifiers, text roles, dimensions, Tailwind utilities, and inline styles.
- [Themes](themes.md) — Built-in themes, presentation-wide typography, CJK text, and custom tokens.

## Typeset mathematics and tables

Bring an external typesetter in for the fragments that need one.

- [Typst integration](typst.md) — Embed Typst fragments, or export the whole presentation as editable .typ source.
- [LaTeX integration](latex.md) — Compile existing LaTeX tables and fragments into presentation objects.

## Check and generate

Verify a deck before presenting it, and hand the format to an agent.

- [Layout checks](layout-checks.md) — Detect empty pages, overflow, clipped text, small type, and mistyped region paths.
- [Generate with AI](ai-generation.md) — Give an agent the FrameSeq contract and iterate from layout diagnostics.

## Present and export

Deliver the talk and hand the file over afterwards.

- [Presenter and remote](presenter.md) — Notes, next-slide preview, timer, synchronised controls, and a phone remote.
- [Deploy HTML](deployment.md) — Publish a static presentation, use GitHub Pages, or build one portable file.
- [Export PowerPoint](pptx.md) — Editable hybrid PPTX or pixel-faithful flattened slides.

## Editor and command line

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
