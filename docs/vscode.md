# Visual Studio Code extension

The FrameSeq extension adds presentation-aware navigation and commands to Visual Studio Code without replacing the FrameSeq renderer.

## Current features

- A FrameSeq activity-bar view containing every `slide()` and its named `at()` regions in source order.
- A Current Slide inspector that follows the editor cursor, using the lower half of the activity bar for expanded region and labelled-object navigation instead of leaving it blank.
- Slide labels, layouts, object counts, and speaker-note indicators.
- One-click navigation from an outline item or layout issue to the corresponding `slide()` call.
- A split editing workspace with `slides.ts` on the left and the live preview on the right.
- Outline-to-preview synchronization and current/previous/next slide commands.
- Status-bar items showing the slide and active authoring region containing the cursor.
- Region-aware editing: jump between the current slide's named regions, or bind selected content lines into a new movable region.
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

`frameseq.previewBeside` controls only where a new preview is created. Once the preview exists, slide-outline navigation preserves its current editor group: if you moved it into the source group as another tab, it remains a tab; if it is beside the source, the split remains. Activating the preview tab also keeps Current Slide populated from the previewed page instead of replacing it with an empty welcome view.

Outline navigation also keeps the existing preview visible. When the source is already visible in another group, its cursor follows silently; when `slides.ts` is a hidden tab behind the preview, the extension does not activate it first. This avoids a source-to-preview flash on every slide click.

The `slide()` call for the page currently shown in the preview receives a persistent source marker: a whole-line highlight, accent edge, overview-ruler tick, and a `Previewing slide N` label. Unlike VS Code's inactive selection colour, this remains conspicuous while focus stays in the preview. Saving or refreshing recomputes its source line, so edits above the slide do not leave the marker behind.

The preview page always keeps the presentation's configured ratio (`16:9`, `4:3`, or an explicit canvas size). A narrow or tall editor pane adds stage space around the page instead of stretching its rounded frame to the pane. The fixed canvas is then scaled uniformly inside that frame, so layout editing and exported coordinates still use the document's native canvas units.

## Entry selection

The active `slides.ts` or `*.slides.ts` editor takes precedence, followed by a slides editor that is visible in another group. Otherwise, the extension uses the path in the `frameseq.entry` setting, which may be relative to the workspace folder or absolute:

```json
{
  "frameseq.entry": "decks/kickoff/slides.ts"
}
```

If that file does not exist, the extension searches the whole workspace for `slides.ts` and `*.slides.ts` documents, skipping `node_modules`, `dist`, `out`, `tmp`, and `output`. A deck in a subdirectory therefore needs no configuration. When several decks exist, the one closest to the file being edited wins, then the shallowest path.

Run **FrameSeq: Select Entry** — from the palette, the Slides view title menu, or the empty-view link — to choose the deck yourself. The picker lists every deck it found, marks the one in use, and remembers the choice for the workspace, so it outranks the active editor until you pick **Follow the active editor** to clear it. The Slides view title shows the entry in use and appends `(selected)` while a choice is pinned. Switching entries clears the previous layout diagnostics and moves a running preview to the new deck.

Commands run from the deck's own project root: the closest directory above the entry that carries the FrameSeq CLI, otherwise the closest `package.json`, otherwise the workspace folder. A deck kept in a subdirectory of a monorepo therefore runs against its own dependencies.

## Commands

Open the Command Palette and run:

- `FrameSeq: Refresh Slides`
- `FrameSeq: Select Entry`
- `FrameSeq: Preview`
- `FrameSeq: Preview Current Slide`
- `FrameSeq: Previous Slide`
- `FrameSeq: Next Slide`
- `FrameSeq: Insert Slide After Current`
- `FrameSeq: Go to Named Region`
- `FrameSeq: Bind Selection to Named Region`
- `FrameSeq: Stop Preview`
- `FrameSeq: Check Layout`
- `FrameSeq: Export HTML`
- `FrameSeq: Export PDF`
- `FrameSeq: Export PPTX`
- `FrameSeq: Export Typst`

## Named regions

The region status item shows where a new content command would be written: `main`, `left`, `cell1`, or an `at()` path such as `diagram/legend`. Select **FrameSeq: Go to Named Region** to jump to the first `at()` call for any named region on the current slide. Revisited paths show their visit count in the Slides outline and region picker.

To make consecutive objects move as one unit, select their complete source lines and run **FrameSeq: Bind Selection to Named Region** from the editor context menu. The extension inserts a named column before the selection and restores the previous authoring cursor afterwards:

```ts
at("pipeline").column();
rect("Parse");
rect("Build");
main();
```

The edit is a single undo step. A selection containing `slide()`, `at()`, `main()`, `left()`, `right()`, or `cell()` is refused because moving those boundaries would silently change content ownership.

## Current Slide inspector

The compact Slides view remains at the top of the FrameSeq activity bar. **Current Slide** fills the space below it and follows the source cursor. Its summary shows the page number, layout, object count, and note state. Components are grouped by their authoring cursor (`main`, `cell0`, or a named `at()` path), and nested builders remain nested in the tree. Object labels come from literal content such as `text("Latency")` or `rect("Model")`. Preview, layout check, and PPTX export stay available in the view title bar.

Expand a component to inspect source-backed literal properties such as `x`, `y`, `width`, `height`, `gap`, `fill`, and `color`. Selecting a property opens a validated input box and replaces only that literal in TypeScript. The extension checks that the expected source is still present before editing, applies one workspace edit so Undo works normally, saves, then refreshes both the inspector and live preview. Computed expressions are deliberately shown only through source navigation until they can be edited without changing their meaning.

A named `at()` region is an editable component too. Expand its region heading to edit literal `position`, size, spacing, padding, fill, and alignment values stated on any visit to that path. In preview editing mode, drag the visible region itself, or hold Shift and drag any child to choose the nearest positioned named region. The extension rewrites only the region's literal `x` and `y`, so all children move together and one Undo restores the group. A region without literal `position({ x, y })` remains in automatic flow and is not silently converted to absolute placement.

Preview editing mode is also a source-backed selection surface. Click a component to select it without holding Alt; Ctrl-click or Command-click adds or removes components. A toolbar at the top shows the named-region breadcrumb and selection count. With two or more components selected, **Bind region** validates that they are consecutive top-level siblings on one slide and in one authoring region, then applies the existing named-region binding as one undoable edit. A skipped component, nested child, region container, or cross-region selection is refused rather than silently included.

The same multi-selection toolbar aligns left, horizontal centre, right, top, vertical centre, or bottom. Three or more objects can also be distributed horizontally or vertically; the first and last stay fixed while the objects between them receive equal visual gaps. An axis is enabled only when every selected object has a source-backed literal coordinate on that axis. Computed coordinates, flow-layout objects, and a selection containing both a parent and its child remain disabled rather than being converted or guessed. One action replaces the affected coordinate literals as one undoable workspace edit.

With a positioned selection active, the arrow keys nudge it by one canvas pixel and `Shift` + arrow nudges by ten. A held key is coalesced into one source edit, and a multi-selection moves as a unit without changing its internal spacing. A compact badge beside a single selection shows `x`, `y`, width, and height. `Escape` clears the selection first; pressing it again exits editing mode.

Clicking in the embedded preview keeps keyboard focus there. If `slides.ts` is already visible beside it, its selection follows silently; a hidden source tab is not activated. The compact badge says **Selected** explicitly. For a flow-layout component it reports **flow item · drag to reorder**, because no literal `x` or `y` exists for arrow-key movement; pressing an unavailable arrow also explains which coordinate is missing.

Positioned components distinguish a click from a drag before capturing the pointer. A press and release selects the component and focuses the canvas for immediate arrow-key use; only movement beyond the drag threshold captures the pointer. After an align or distribute toolbar action, focus returns to the canvas as well.

Each completed nudge saves the source and refreshes the live preview. FrameSeq renders and scales the replacement canvas off-screen while the old canvas remains visible, then swaps them atomically, so releasing a drag does not expose a blank or native-size frame. The selection is restored by source location and the canvas regains focus, allowing consecutive arrow presses without another click. A full page reload remains only as the safety fallback when an edit is rejected or the host does not answer.

Dragging a positioned object now snaps its left, centre, or right edge and its top, middle, or bottom edge to nearby editable objects. Thin guides span the slide while an anchor is within six screen pixels and disappear as soon as it leaves the threshold or the pointer is released. Hold Ctrl or Command while dragging to bypass snapping for unrestricted movement.

Editing mode is deliberately persistent but compact: the `E` control remains filled with the accent colour until `E` or Escape leaves the mode. A single selection uses only its canvas outline; the top selection toolbar appears only for a multi-selection, when its count, region context, and **Bind region** action are useful.

The source editor, inspector, and preview share the same mapping. Moving the cursor through a component chain selects that component in Current Slide and highlights it in the preview; a cursor on an editable literal selects the exact property. Moving to an object on another slide changes the open preview page as well. Blank source clears the previous preview highlight. Set `frameseq.followCursor` to `false` to disable this automatic following.

Selecting a region or object in Current Slide opens its command and places a visible accent outline around the corresponding preview component. Alt-clicking an object in the preview performs the reverse operation: it opens the source and selects the matching Current Slide entry. Region selection uses its `at()` name, so the whole named container is outlined rather than only its first child.

That outline represents the current inspection target, not a permanent annotation. Click the canvas or another ordinary preview location, press `Escape`, select directly in editing mode, or change slides to dismiss it.

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
