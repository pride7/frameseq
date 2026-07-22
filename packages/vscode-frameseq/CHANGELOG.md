# Changelog

## Unreleased

- Add a local `gridSection()` card-grid snippet.

## 0.2.1

- Add a visible export button to the Slides view with HTML, PDF, and PPTX choices.
- Make outline navigation update the embedded preview iframe reliably.

## 0.2.0

- Open `slides.ts` on the left and the live preview on the right by default.
- Keep outline navigation and the previewed slide in sync.
- Add current, previous, and next slide preview commands.
- Add a current-slide status bar item and an insert-slide command.
- Add HTML export and TypeScript snippets.

## 0.1.1

- Prevent the CLI and extension from opening competing preview windows.
- Wait for Vite startup and force a fresh Simple Browser navigation to avoid a stale white page.

## 0.1.0

- Add a slide outline with source navigation.
- Add live preview controls.
- Surface FrameSeq layout checks as VS Code diagnostics.
- Add PDF and PPTX export commands.
