# FrameSeq documentation

FrameSeq is a TypeScript framework for writing presentations as a linear document while keeping the styling and composition model of a UI toolkit.

## Start here

- [Live Gallery](https://pride7.github.io/frameseq/) — open the product tour, AI-oriented research example, and all seven built-in themes in the browser.
- [Online Playground](https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground) — edit a standalone presentation and see the result without installing anything.
- [Getting started](getting-started.md) — create, preview, build, and export a presentation.
- [Document model](document-model.md) — understand `presentation()`, `slide()`, and content ownership.
- [Content](content.md) — text, formulas, code, images, lists, and metrics.
- [Layout](layout.md) — split pages, grids, regions, centered pages, and freeform composition.
- [Generate presentations with AI](ai-generation.md) — give an agent the FrameSeq contract, write a useful brief, and iterate with rendered-layout diagnostics.
- [AI-friendly layout checks](layout-checks.md) — detect empty pages, overflow, clipped text, and unreadably small type with human or JSON diagnostics.
- [Deploy HTML](deployment.md) — publish to GitHub Pages or create a portable single-file presentation.
- [Export PowerPoint](pptx.md) — create editable hybrid PPTX files or pixel-faithful flattened slides.
- [Themes](themes.md) — choose a built-in appearance or define reusable design tokens.
- [Styling](styling.md) — chainable modifiers, text roles, and units.
- [Shapes and connectors](shapes.md) — draw editable boxes, circles, lines, and arrows on a canvas.
- [Presenter view and phone remote](presenter.md) — use private notes, a timer, synchronized controls, or QR-based LAN control.
- [Typst integration](typst.md) — embed build-time Typst fragments without giving up FrameSeq structure.
- [LaTeX integration](latex.md) — compile real LaTeX tables into controllable FrameSeq objects.
- [API reference](api-reference.md) — signatures and behavior of the public authoring API.
- [CLI reference](cli.md) — `new`, `dev`, local phone remote, `build`, single-file HTML, `pdf`, `pptx`, and `check`.
- [Advanced composition](advanced.md) — the explicit object API and low-level components.
- [Release automation](releasing.md) — publish both npm packages from a version tag with GitHub OIDC.
- [Version changelog](../CHANGELOG.md) — follow user-visible changes across FrameSeq releases.

## Recommended learning path

Read the getting-started and document-model pages first. Most presentations only need the linear authoring API. Use the layout and styling pages when the defaults are not enough, and treat the low-level component layer as an escape hatch for special slides.

The documentation tracks the latest published FrameSeq release.
