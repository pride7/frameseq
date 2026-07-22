# FrameSeq documentation

You do not need to read every page. Most presentations can be written with the two documents below; open the other guides only when a slide needs them.

## Start here

1. [Getting started](getting-started.md) — create a project, write the first slides, preview them, and export the result.
2. [Function reference](function-guide.md) — look up what a function creates, how to call it, its parameters, and what it returns.

You can also explore the [Live Gallery](https://pride7.github.io/frameseq/) or edit the [Online Playground](https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground) before installing FrameSeq.

## Write and design slides

- [Document model](document-model.md) — how `presentation()`, `slide()`, objects, and active regions fit together.
- [Content](content.md) — text, lists, images, code, formulas, metrics, cards, and groups.
- [Layout](layout.md) — normal flow, split pages, grids, local grid sections, centering, and canvas placement.
- [Styling](styling.md) — chainable modifiers, text roles, dimensions, Tailwind CSS, and inline styles.
- [Themes](themes.md) — built-in themes, global typography, and custom design tokens.
- [Shapes and connectors](shapes.md) — editable rectangles, circles, lines, and arrows.

## Present and export

- [Presenter view and phone remote](presenter.md) — notes, next-slide preview, timer, synchronized controls, and a LAN phone remote.
- [Deploy HTML](deployment.md) — publish a static presentation, use GitHub Pages, or build one self-contained HTML file.
- [Export PowerPoint](pptx.md) — choose editable hybrid PPTX or pixel-faithful flattened slides.

## AI and advanced typesetting

- [Generate presentations with AI](ai-generation.md) — give an agent the FrameSeq contract and iterate from layout diagnostics.
- [AI-friendly layout checks](layout-checks.md) — detect empty pages, overflow, clipped text, and unreadably small type.
- [Typst integration](typst.md) — embed build-time Typst fragments while FrameSeq controls slide structure.
- [LaTeX integration](latex.md) — compile existing LaTeX tables and typeset fragments into FrameSeq objects.

## Editor and tooling

- [Visual Studio Code extension](vscode.md) — source/preview split view, slide navigation, diagnostics, and export commands.
- [CLI reference](cli.md) — commands for development, remote control, HTML, PDF, PPTX, inspection, and layout checking.

## Advanced and maintainer reference

These pages are not part of the normal learning path.

- [API reference](api-reference.md) — exact TypeScript overloads, interfaces, and all public builder methods.
- [Advanced composition](advanced.md) — the uppercase object API and lower-level components.
- [Version changelog](../CHANGELOG.md) — user-visible changes across releases.
- [Release automation](releasing.md) — npm Trusted Publishing and the version-tag workflow.

The documentation tracks the latest published FrameSeq release.
