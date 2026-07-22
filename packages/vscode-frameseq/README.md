# FrameSeq for Visual Studio Code

Edit FrameSeq presentations with `slides.ts` on the left and a live FrameSeq preview on the right.

## Features

- Lists every `slide()` in the FrameSeq activity-bar view.
- Shows each slide's layout, object count, and speaker-note status.
- Opens the exact `slide()` source line when an outline item is selected.
- Opens the development preview beside the source editor by default.
- Keeps outline navigation and the previewed slide in sync.
- Adds current, previous, and next slide commands plus a current-slide status item.
- Inserts a new slide after the slide containing the cursor.
- Converts `frameseq check --json` results into Problems-panel diagnostics.
- Exports the active presentation to HTML, PDF, or PPTX from a visible Slides-view toolbar button.
- Provides TypeScript snippets for presentations, slides, layouts, bullets, LaTeX, and Typst.

The extension uses the `@pride7/frameseq` CLI installed in the current project. It does not bundle a second renderer.

## Requirements

Open a project containing FrameSeq and install its dependencies:

```bash
npm install
```

The active `slides.ts` or `*.slides.ts` editor is used automatically. You can set `frameseq.entry` when the entry file has another name.

## Commands

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
