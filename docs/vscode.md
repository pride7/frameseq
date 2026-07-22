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
- A visible export button in the Slides-view toolbar with HTML, PDF, and PPTX choices.

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

Saving the active slide document refreshes the outline by default. Disable `frameseq.autoRefresh` if another tool rewrites the source frequently.

## Layout diagnostics

`FrameSeq: Check Layout` runs the same rendered check as:

```bash
frameseq check slides.ts --json
```

Errors and warnings are placed on the relevant `slide()` line in the Problems panel and also appear beneath the slide in the outline. The browser renderer remains the source of truth for overflow, clipping, empty pages, and minimum text size.
