# FrameSeq for Visual Studio Code

Edit FrameSeq presentations with `slides.ts` on the left and a live FrameSeq preview on the right.

## Features

- Lists every `slide()` and its named `at()` regions in the FrameSeq activity-bar view.
- Uses the lower half of the activity bar for a cursor-synchronised Current Slide inspector, grouping components by authoring region and preserving nested component hierarchy.
- Expands a component to inspect and edit literal layout/style properties such as position, size, gap, fill, and colour; every edit is validated, undoable, and saved back to TypeScript.
- Treats an `at()` region as a real group: inspect and edit its own properties, highlight it from any visit, and Shift-drag a child in preview editing mode to move the positioned region as one unit.
- Turns preview editing mode into a selection surface: click to select, Ctrl/Command-click to multi-select, inspect the named-region breadcrumb, and bind consecutive top-level components into a new `at()` region from the preview toolbar.
- Aligns a positioned multi-selection on any edge or centre and distributes three or more objects horizontally or vertically, with unavailable source-backed axes disabled automatically.
- Nudges positioned selections with the arrow keys (`Shift` for ten pixels), displays compact geometry, and snaps drags to nearby edge/centre guides with a Ctrl/Command bypass.
- Keeps preview focus after selection so those shortcuts work immediately, while flow items receive an explicit drag-to-reorder explanation instead of silent arrow-key failure.
- Separates click selection from pointer-captured dragging, then returns focus to the canvas after selection and arrangement toolbar actions.
- Hot-swaps a prepared, fully scaled canvas after a saved edit, avoiding a blank flash while repeated arrow presses continue moving the same source-backed selection.
- Makes editing state unmistakable without covering the canvas: the `E` button stays accent-filled, single selection uses only an outline, and the top toolbar is reserved for multi-selection.
- Preserves the preview's current editor group when navigating from Slides: a same-group preview stays a tab, and a split preview stays split.
- Keeps source, Current Slide, and the live preview paired: moving the source cursor selects the matching component/property and can change the preview page; selecting an inspector component highlights it; Alt-clicking a preview object performs the reverse mapping.
- Shows each slide's layout, object count, and speaker-note status.
- Opens the exact `slide()` source line when an outline item is selected.
- Keeps that source location obvious even when the preview owns focus, using a persistent whole-line highlight, accent edge, overview-ruler marker, and `Previewing slide` label.
- Opens the development preview beside the source editor by default.
- Keeps the canvas centred with equal gutters and adds Ctrl/Command+wheel zoom, a live percentage, Fit, and 1:1 controls.
- Keeps outline navigation and the previewed slide in sync.
- Adds current, previous, and next slide commands plus a current-slide status item.
- Shows the active `at()` region in the status bar and jumps between named regions on the current slide.
- Binds selected content commands into a new named region as one undoable edit, restoring the previous authoring cursor afterwards.
- Inserts a new slide after the slide containing the cursor.
- Converts `frameseq check --json` results into Problems-panel diagnostics.
- Exports the active presentation to HTML, PDF, PPTX, or editable Typst source from a visible Slides-view toolbar button.
- Provides TypeScript snippets for presentations, slides, whole-page and local-grid layouts, bullets, LaTeX, and Typst.

The extension uses the `@pride7/frameseq` CLI installed in the current project. It does not bundle a second renderer.

## Requirements

Open a project containing FrameSeq and install its dependencies:

```bash
npm install
```

The active `slides.ts` or `*.slides.ts` editor is used automatically, including one kept in a subdirectory. Otherwise the extension searches the workspace for `slides.ts` and `*.slides.ts` documents. Run **FrameSeq: Select Entry** to choose between several decks; the choice is remembered per workspace until you switch back to following the active editor. Set `frameseq.entry` when the entry file has another name.

## Commands

- `FrameSeq: Refresh Slides`
- `FrameSeq: Select Entry`
- `FrameSeq: Preview`
- `FrameSeq: Preview Current Slide`
- `FrameSeq: Previous Slide`
- `FrameSeq: Next Slide`
- `FrameSeq: Insert Slide After Current`
- `FrameSeq: Go to Named Region`
- `FrameSeq: Bind Selection to Named Region`
- `FrameSeq: Edit Component Property`
- `FrameSeq: Stop Preview`
- `FrameSeq: Check Layout`
- `FrameSeq: Export HTML`
- `FrameSeq: Export PDF`
- `FrameSeq: Export PPTX`
- `FrameSeq: Export Typst`
