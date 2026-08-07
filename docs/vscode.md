# Visual Studio Code extension

The FrameSeq extension adds presentation-aware navigation and commands to Visual Studio Code without replacing the FrameSeq renderer.

## Current features

- A FrameSeq activity-bar view containing every `slide()` in source order.
- Slide labels, layouts, object counts, and speaker-note indicators.
- One-click navigation from an outline item or layout issue to the corresponding `slide()` call.
- A split editing workspace with `slides.ts` on the left and the live preview on the right.
- Outline-to-preview synchronization and current/previous/next slide commands.
- A status-bar item showing the slide containing the cursor.
- An insert-slide command and TypeScript snippets for common FrameSeq structures.
- Start and stop controls for the live FrameSeq preview.
- Layout-check results in the VS Code Problems panel.
- A visible export button in the Slides-view toolbar with HTML, PDF, PPTX, and editable Typst choices.
- Alt-click in the preview to move the cursor to the command that drew an object.
- Dragging in the preview to change the coordinates a command states, or an object's place among its neighbours, as an undoable edit.

The extension reads the outline through `frameseq inspect --json` and runs preview, validation, and export through the project's installed FrameSeq CLI. It does not bundle another copy of the rendering runtime.

## Build and install locally

From the FrameSeq repository:

```bash
npm install
npm run vscode:package
```

The packaged extension is written to:

```text
output/vscode/frameseq-vscode.vsix
```

Install it from the VS Code Extensions view with **Install from VSIX...**, or use the command line:

```bash
code --install-extension output/vscode/frameseq-vscode.vsix
```

Open a FrameSeq project after installation. The project must already have its npm dependencies installed so the extension can call the local `frameseq` executable.

Running **FrameSeq: Preview** keeps the entry document in the first editor group and opens the preview beside it. Set `frameseq.previewBeside` to `false` if you prefer the preview in the active editor group. Selecting a slide in the FrameSeq outline updates both the source selection and the live preview; this behavior is controlled by `frameseq.followOutline`.

## Entry selection

The active `slides.ts` or `*.slides.ts` editor takes precedence. Otherwise, the extension uses the path in the `frameseq.entry` setting:

```json
{
  "frameseq.entry": "slides.ts"
}
```

If that file does not exist, the extension looks for the first `*.slides.ts` document in the workspace.

## Commands

Open the Command Palette and run:

- `FrameSeq: Refresh Slides`
- `FrameSeq: Preview`
- `FrameSeq: Preview Current Slide`
- `FrameSeq: Previous Slide`
- `FrameSeq: Next Slide`
- `FrameSeq: Insert Slide After Current`
- `FrameSeq: Stop Preview`
- `FrameSeq: Check Layout`
- `FrameSeq: Export HTML`
- `FrameSeq: Export PDF`
- `FrameSeq: Export PPTX`
- `FrameSeq: Export Typst`

Saving the active slide document refreshes the outline by default. Disable `frameseq.autoRefresh` if another tool rewrites the source frequently.

## Layout diagnostics

`FrameSeq: Check Layout` runs the same rendered check as:

```bash
frameseq check slides.ts --json
```

Errors and warnings are placed on the relevant `slide()` line in the Problems panel and also appear beneath the slide in the outline. The browser renderer remains the source of truth for overflow, clipping, empty pages, and minimum text size.

## Editing from the preview

While a preview is running, the source and the page point at each other in both directions.

Hold `Alt` over the preview to outline the object under the pointer, and Alt-click it to move the cursor to the command that wrote it.

The `E` control in the preview turns on layout editing:

- An object placed with `position({ x, y })` can be dragged, and one given a `width()` or a `height()` can be resized from its corner. Releasing the drag rewrites those numbers.
- An object in the document flow has no coordinates to change, so dragging it changes its place among its neighbours instead. The preview draws where it would land, and the whole lines the command occupies travel there, with any comment written above or beside it.
- `Ctrl+Z` undoes the last drag. In the VS Code preview the change is applied through the workspace, so the editor's own undo covers it; in a browser the development server keeps the history instead.
- `Escape` leaves the mode.

Only the characters a drag actually changes are rewritten, so comments and formatting survive it. A drag is refused rather than guessed at when the numbers no longer match the file, which is what happens if the document was edited while the preview was being dragged.

Editing is offered only where one change in the source stands for what was dragged:

- `position({ x: cursor, y: 90 })` computes its x, so there is no number to rewrite.
- A command inside a loop or a helper function renders several objects from one line, so there is no one object the drag could mean.
- Reordering stays inside one run of the document. A `left()`, a `cell(1)`, a new `slide()`, and a `group(a, b)` that collects the objects written above it each end a run, because carrying lines across one would change which region an object belongs to rather than only its order.

Objects that cannot be dragged stay clickable and still lead back to their line. Source positions are recorded only while `frameseq dev` is serving; a built presentation carries none.
