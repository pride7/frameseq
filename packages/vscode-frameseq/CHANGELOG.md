# Changelog

## Unreleased

- Move the cursor to the command that drew an object when it is Alt-clicked in the preview.
- Apply a drag in the preview through the workspace, so one Undo puts the object back, and save so the preview reloads from the document. The extension checks the numbers still match before replacing them, and refuses a drag whose source has moved on.
- Carry a command's lines to a new place among its neighbours when an object in the document flow is dragged, as a single undoable edit.
- Add a local `gridSection()` card-grid snippet.
- Add snippets for anchored diagrams (`diagram`), region paths (`at`), and speaker notes (`note`).
- Show the notes marker in the slide outline for notes written with `note()`.
- Add editable Typst export to the Slides view export menu.

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
