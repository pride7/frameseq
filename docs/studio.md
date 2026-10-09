# FrameSeq Studio

FrameSeq Studio puts the whole loop of writing a talk in one window: the slides as thumbnails, the `.slides.ts` source in a TypeScript editor, the live preview, and one list of everything wrong with the deck. It needs nothing beyond the FrameSeq package: no editor, extension, or separate download.

```bash
frameseq studio talk.slides.ts
```

The command starts the development server and opens the Studio. When Chrome, Edge, Chromium, or Brave is installed, the Studio opens as an app window of its own, with no tabs or address bar; otherwise it opens in the default browser. A project generated with `npm create frameseq` runs the same thing with `npm run studio`.

The source stays the only description of the talk. Everything the Studio does, whether it is typing, dragging in the preview, or reordering slides in the rail, ends as an edit to `talk.slides.ts` that the editor's own undo can take back.

## The window

| Area | What it holds |
| --- | --- |
| **Slides** (left) | Every slide, rendered by the same runtime as the preview and updated on every save. |
| **Current slide** (left, below the slides) | The objects on the slide in the preview, by region, with the values their commands state. |
| **Editor** (centre) | The slide document, with TypeScript completions, errors, hover documentation, and parameter hints. |
| **Preview** (right) | The interactive preview, with its usual navigation, zoom, and layout-editing controls. |
| **Problems** (bottom) | TypeScript errors, layout-check findings, build errors, and errors thrown while the deck ran. |

Drag the dividers to resize the areas; double-click a divider to restore its default. `Ctrl+B` (`⌘B` on macOS) hides the slide rail and `Ctrl+J` hides the bottom panel. The sizes are remembered by the browser.

The theme button beside **Auto-save** switches between following the system (◐), light (☀), and dark (☾). The slides themselves keep the presentation's own theme.

## Current slide

Below the slides, **Current slide** lists the objects on the slide the preview shows, grouped by the region they were written in, as the VS Code extension's Current Slide view does. Each row shows the kind of object, its text or name, and the line that wrote it; the row of the object under the editor's cursor is highlighted.

- **Click** an object to put the cursor on its command and outline it in the preview. Click a named region to outline the whole region.
- **Expand** an object or a named region to see the values its commands state literally: positions, sizes, spacing, colours, and the like. Edit one where it stands and press `Enter`; `Escape` puts it back. In a number, `↑` and `↓` step it by one, with `Shift` by ten and `Alt` by a tenth, and the preview follows each step. A colour written as `#rrggbb` has a colour picker beside it.

Every change rewrites only that literal, as one step in the editor's history, so `Ctrl+Z` takes it back. A value the code computes, such as `x: left + 40`, is not listed, since no single literal stands for it. For a slide made in a loop or by a helper function, the inspector shows the objects written once in the loop or the helper, and says so.

Drag the divider above **Current slide** to share the rail between it and the slides, or fold it away with the arrow beside its title.

## Editing and saving

**Auto-save** in the top bar is on by default: the Studio saves shortly after you stop typing, and the preview redraws from the saved file. Auto-save only writes text that parses. While a line is half-typed, or a bracket is unbalanced, the save indicator reads **Not saved: syntax error** and the preview keeps showing the last version that worked, instead of flashing a build error between keystrokes. `Ctrl+S` always saves, whatever the text holds.

Turn auto-save off to save only with `Ctrl+S`; the preview then shows the file as last saved.

The editor reads the project the way an editor would, from the nearest `tsconfig.json`, so its completions and errors agree with VS Code and `tsc`. Start typing a command, or a `.` after one, for completions; hover over a name for its documentation; open a call's parentheses for its parameters. A deck outside any TypeScript project still gets the FrameSeq globals.

A slide number marks the line where each `slide()` call begins. Click it to show that slide. A band beside the source marks the slide the preview is showing.

## The editor and the preview follow each other

With **Follow cursor** on, moving the cursor shows the slide that holds it and outlines the object written on that line. The preview keeps its reveal step while the cursor stays inside the same slide.

The preview's own source links work as they do in VS Code:

- **Alt-click** an object in the preview to put the cursor on the command that drew it.
- Turn on layout editing with **E**, then **drag** an object placed with `position({ x, y })`, or resize one that states its `width()` or `height()`. Only the digits change, through the editor, so `Ctrl+Z` puts the object back. The same keys work while the preview has focus: `Ctrl+Z` and `Ctrl+Y` undo and redo in the editor, and `Ctrl+S` saves.
- Drag an object in the document flow to change its place among its neighbours; its lines move in the source, comments included.
- `Ctrl`-click several objects written one after another and choose **Bind region** to wrap their lines in a named `at("…").column()` region, so they can be positioned or anchored together.

See [Visual Studio Code extension](vscode.md) for the rules that decide which numbers a drag may rewrite.

## Arranging slides

The slide rail edits the document by the statements that make slides. A slide's lines run from its `slide()` statement, with the comments written just above it, to where the next slide's lines begin, so its content and the blank lines after it travel with it.

- **Click** a thumbnail to show the slide and move the editor to the code that made it.
- **Drag** a thumbnail up or down to move the slide.
- **Right-click** for **New slide after**, **Duplicate**, **Move up**, **Move down**, **Go to source**, **Present from here**, and **Delete**. `Delete` also works on the selected thumbnail.
- **+** above the rail adds a slide after the one in the preview, with its title selected for typing.

Each of these is one step in the editor's history.

### Slides made in code

A loop, or a call to a helper function, makes several slides from one statement:

```ts
for (const topic of ["Alpha", "Beta", "Gamma"]) {
  slide(topic);
  text(`About ${topic}`);
}

section("Results"); // a helper that writes two slides
```

No block of lines belongs to any one of those slides, so they are moved, duplicated, and deleted together, as the statement that made them. The rail brackets such slides, the editor numbers the statement with all of them (`2–4`), the slide menu says how many slides an action touches, and dropping a dragged slide is only possible between groups. Moving the slides around a loop still works one slide at a time, and a helper function declared between two slides stays where it is.

Clicking a slide made in a loop puts the cursor on the `slide()` call inside the loop; clicking one made by a helper puts it on the call that ran the helper. A slide made outside the slide document, by an imported module, can be shown but not rearranged.

## Problems

The Problems panel collects four kinds of finding, refreshed as you work:

- **TypeScript**: the same errors the editor underlines.
- **Layout**: the rules of [`frameseq check`](layout-checks.md), measured against the live deck after every save rather than on demand: canvas overflow, clipped text, small type, empty slides and regions, similar region names, and modifiers that have no effect.
- **Build**: errors the server reported while compiling the deck, such as a Typst or LaTeX fragment that does not compile.
- **Preview**: an error thrown while the deck ran. The preview keeps showing the last version that ran until the error is fixed.

Click a finding to go to it: TypeScript errors select the text, and layout findings show their slide, outline the object, and put the cursor on the line that wrote it.

## Changes made elsewhere

The Studio watches the slide document. When it changes on disk, for example because a coding agent or another editor wrote it, and the Studio has no unsaved edits, the new text is loaded at once and `Ctrl+Z` can still take it back. If you do have unsaved edits, a banner asks which version to keep: **Use the file on disk** or **Keep my version**. Nothing is overwritten without that choice.

## Presenting and exporting

**Present** (`F5`) opens [presenter view](presenter.md) on the current slide in a window of its own. **Export** runs the same exports as the CLI and writes to the same places:

| Export | Writes |
| --- | --- |
| PDF | `output/pdf/<name>.pdf` |
| PowerPoint, editable | `output/pptx/<name>.pptx` |
| PowerPoint, one image per slide | `output/pptx/<name>.pptx` |
| Single HTML file | `dist/index.html` |
| HTML site | `dist/` |
| Typst source | `output/typst/<name>.typ` |

The paths are relative to the directory the Studio was started from. The document is saved before an export starts. When it finishes, the notice offers **Download** and **Show in folder**; the full log is in the **Output** tab.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+S` | Save |
| `Ctrl+Z`, `Ctrl+Y` | Undo and redo, also from the preview and the slide rail |
| `Ctrl+Space` | Show completions |
| `Ctrl+F` | Find and replace in the editor |
| `Ctrl+PageDown`, `Ctrl+PageUp` | Next and previous slide |
| `F5` | Present from the current slide |
| `Ctrl+B` | Show or hide the slide rail |
| `Ctrl+J` | Show or hide the bottom panel |

On macOS, use `⌘` in place of `Ctrl`.

## Network access

The Studio writes whole documents, which the plain preview never does: a drag in `frameseq dev` may only rewrite numbers. So the Studio's interface exists only on a server started by `frameseq studio`, answers only the computer it runs on, and refuses requests sent by any other web page. Add `--host` only when the Studio must be reached from outside the machine, as in a container or a browser IDE:

```bash
frameseq studio talk.slides.ts --host
```

Anyone who can reach that address can then edit the deck. Use `--no-open` to start the server without opening a window, and `--tab` to open a browser tab instead of an app window.
