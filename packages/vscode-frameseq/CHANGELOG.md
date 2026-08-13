# Changelog

## Unreleased

## 0.4.0 - 2026-08-12

- Find decks kept in subdirectories: entry discovery now searches the whole workspace for `slides.ts` as well as `*.slides.ts`, prefers the deck closest to the file being edited, and falls back to a visible or open slides document.
- Add **FrameSeq: Select Entry**, a picker over every deck in the workspace. The choice is remembered per workspace, shown beside the Slides view title, outranks the active editor until cleared, and moves a running preview to the selected deck.
- Run commands from the deck's own project root — the closest directory above the entry carrying the FrameSeq CLI, otherwise the closest `package.json` — so a deck nested in a monorepo uses its own dependencies.

## 0.3.0 - 2026-08-12

- Synchronise Current Slide components with the live preview in both directions: selecting a region or object highlights it on the slide, while Alt-clicking a preview object selects its inspector entry as well as opening its source.
- Group Current Slide components by authoring region and preserve nested component hierarchy instead of presenting a flat object list.
- Expand components into source-backed properties and edit literal positions, sizes, spacing, fills, and colours through a validated, undoable TypeScript replacement.
- Follow the source cursor into the exact Current Slide component or property and update the preview highlight, including navigation across slides; expose `frameseq.followCursor` for opting out.
- Expand named regions into their own editable properties, map every repeated `at()` visit back to the same group, and Shift-drag a child to move its nearest positioned region as one undoable edit.
- Select preview components with a plain click in editing mode, multi-select with Ctrl/Command, synchronise the primary selection to source and Current Slide, and bind valid consecutive selections into a new named region from the preview toolbar.
- Keep the active `E` control visibly lit, preserve the preview's current tab group or split when an outline slide is opened, and keep Current Slide populated while focus is in the preview webview.
- Avoid the source-tab flash during outline navigation: an existing preview stays visible, while a source editor already visible in another group follows the selected slide silently.
- Keep the currently previewed slide unmistakable in an unfocused source editor with a persistent whole-line marker, accent edge, overview-ruler tick, and line-end label that follows refreshed line numbers.
- Treat the Current Slide component outline as a dismissible inspection target: canvas clicks, Escape, direct edit selection, and slide navigation now clear it.
- Remove redundant top-of-canvas text: the lit `E` button is the edit-state indicator, single selection uses only an outline, and the selection toolbar appears only for multi-selection.
- Align positioned multi-selections on six edges or centres and distribute three or more objects horizontally or vertically, writing all affected literal coordinates in one safe, undoable edit.
- Nudge positioned selections by one pixel, or ten with Shift, show compact geometry beside a single selection, and clear selection before Escape exits editing.
- Show smart guides and snap dragged objects to nearby edges or centres; hold Ctrl/Command to bypass snapping.
- Keep direct preview selections keyboard-active rather than focusing the source editor, and explain when a selected flow item must be reordered instead of nudged by coordinates.
- Make positioned objects reliably clickable by capturing their pointer only after drag movement begins, and restore canvas focus after selection or arrangement actions so real arrow keys work immediately.
- Replace saved source edits with a prepared off-screen canvas instead of reloading the webview, eliminating the drop-time flash while retaining selection, focus, and consecutive arrow-key nudges.
- Add a cursor-synchronised **Current Slide** view below the compact slide outline. It expands named regions and labelled content objects by default, supports exact source navigation, and keeps preview, check, and PPTX actions in its title bar.
- Show named `at()` regions beneath their slide in the outline, including repeated cursor visits.
- Show the active authoring region in the status bar and add a quick picker for jumping between regions on the current slide.
- Add **Bind Selection to Named Region**, which wraps consecutive content lines with `at(path)` and restores the previous cursor as one undoable edit.
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
