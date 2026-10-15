# Changelog

All notable changes to FrameSeq are recorded here. The project follows [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- Export some of the slides. `frameseq pdf`, `pptx`, and `typst` take `--slides 1-3,5`, and in FrameSeq Studio, **File › Export** asks for PDF, PowerPoint, and Typst whether to export all the slides, the current one, or some typed by number. The slides keep their numbers, and the file is named for them, such as `talk-slides-1-3,5.pdf`, so it never replaces the export of the whole presentation.
- Catch formulas whose backslashes a quoted string turned into escapes, as in `text("$\frac{1}{2}$")`, where `\f` is a form feed, which TypeScript accepts. FrameSeq Studio lists them under **Formulas** in Problems and underlines them, with a button that writes the string as `` text`...` ``, which keeps backslashes as written, or doubles them where a template cannot go; `frameseq mcp`'s check reports them too. Words typed into **Current slide** with a backslash in a formula are written as `` text`...` `` from the start.
- Right-click menus in FrameSeq Studio, as in PowerPoint. On an object in the preview, which the right-click selects: Cut, Copy, Paste, Duplicate, Delete, an **Order** submenu that brings it to the front or sends it to the back by moving its lines, Edit text, Format…, and Go to code; on several objects, **Align** and Bind into a region; on the slide itself, Paste, Insert, New slide, and Layout editing; on an object in Current slide; and in the code, Go to definition, Rename, the clipboard, Comment, and Find. Copied objects travel as their lines, comments included, and go to the clipboard as code; pasted, a name the slide already has becomes a new one along with the references to it, and a copy pasted onto its own slide moves over so it does not hide the original. `Ctrl+C`, `Ctrl+X`, `Ctrl+V`, and `Ctrl+D` do the same in the preview, and `Shift+F10` opens the menu from the keyboard. Each command in these menus, and in **Insert**, has a picture beside it, drawn from Lucide. Elsewhere in the window, the browser's own menu no longer opens.
- Present on two screens from FrameSeq Studio, as PowerPoint does with presenter view: on a computer with a second screen, such as a laptop with a projector, the slides fill the other screen and presenter view opens on the Studio's, with the notes, the next slide, and a timer. Presenter view fills its screen as a maximized window does, moves the show on, and ends it with `Esc` or **End show**; its new **Full screen** button covers the taskbar too, in any presentation. **Present › Show screen** chooses the screen the slides go to, from a list of the screens by where they are and their size. The FrameSeq app's window moves to the other screen by itself; in Chrome or Edge the browser asks once whether the Studio may place windows on the screens. **Present › Use presenter view** turns presenter view off.
- Add slide masters, as PowerPoint has them. `master("cover")` and `master("content")` draw the objects written after them behind every cover and every other slide; `placeholder()` marks where each slide's content flows, and `placeholder("title" | "subtitle" | "author")` where its title, subtitle, and author go, in the type the placeholder sets. Master text shows fields such as `{title}`, `{page}`, and `{total}`. Other masters are chosen per slide with `.master("section")`, and `.master(false)` draws a slide on none. PDF, PowerPoint, and Typst export draw each slide with its master, and the layout check leaves a master's objects out of each slide's.
- Edit masters in FrameSeq Studio: **View › Slide master** shows the master pages in the rail and the preview, where they are dragged, set, and inserted into as slides are, with **Insert › Placeholders** for the slides' title and content boxes. The rail's **+** adds a cover, content, or named master that starts where the theme puts things, and **Slide › Master** picks the master the slide in the preview is drawn on.
- Keep templates of your own. **File › Save as template…** in FrameSeq Studio keeps the open presentation, masters and theme included, in a templates folder, `FrameSeq/Templates` in Documents unless the Studio or `FRAMESEQ_TEMPLATES` names another, together with the pictures and other files it names. The new-presentation dialog lists them under **My templates** with their covers, to start from, edit, show, or delete, and keeps a copy of a built-in template to change. `frameseq new --template` takes their names too. `frameseq inspect --json` reports the master pages beside the slides, as `masters`.
- **Insert** in FrameSeq Studio puts content on a slide, as a word processor does: text, a bulleted list, numbered steps, a quote, code, a LaTeX formula, a Typst formula, a LaTeX table, a picture, a table, a chart, a QR code, or an icon. On a slide that flows it is written after the selected object, in its region; on a canvas it is drawn out like a shape. Current slide then opens the new object's settings with its sample words selected, ready to be typed over. A picture is chosen with the computer's own dialog and copied into an `images` folder beside the presentation, and an icon from a searchable picker of the whole set; Current slide can change either later, and duplicates an object with `Ctrl+D`. The same objects are snippets in the editor: type `typst`, `table`, or `chart` at the start of a line.
- Pair a phone with FrameSeq Studio's slide show. **Present › Phone remote…** asks, starts the Studio again on the local network, and shows a QR code; `frameseq studio --remote` starts with it on. The phone steps through the show and its reveal steps, points at the screen with its laser, and shows the notes in its presenter view. While the remote is on, other devices on the network can open the slides and the files they import, and nothing else: only this computer can change the slides, open files, or use the terminal and the assistant.
- Show and edit speaker notes under the preview in FrameSeq Studio. **Notes** follows the slide in the preview; typing rewrites the string that holds its notes, in the quotes it was written with, or adds `.notes()` to a slide that has none, and emptying them takes the call away, each as an undoable edit. Notes written in several places, computed by code, or made by a loop or helper are shown read-only, with a button that shows their code. `frameseq inspect --json` lists where each slide's notes are written, as `noteSources` and `notesAt`.
- Hide the code in FrameSeq Studio to work on the slides alone: **Code** in the top bar, **View › Code**, or `Ctrl+E` folds the editor away and gives its room to the preview, and `Ctrl+Z` undoes from anywhere outside a text field. Going to a slide's source, picking a problem, or `Alt`-clicking an object brings the code back, at the object.
- Delete objects from the preview: in layout editing, select them and press `Delete` or `Backspace`, in FrameSeq Studio, `frameseq dev`, and the VS Code extension alike. Their lines leave the source as one undoable step, along with any connector that ends at one of them; an object another one is placed against by its name, one written inside another command, and a region are left alone, and the preview says why.
- Add a terminal to FrameSeq Studio. The bottom panel's **Terminal** tab, opened with `` Ctrl+` ``, runs a shell in the presentation's folder: PowerShell on Windows, the person's own shell elsewhere. It outlives a reload of the window, leaves `Ctrl+C`, `Alt`, and the other keys to the shell, opens the links it prints in the browser, and in the FrameSeq app finds the app's own `frameseq` first. It opens only in the Studio's own window on the computer running the Studio.
- Add an assistant to FrameSeq Studio: a panel beside the preview that runs Claude Code or Codex, whichever the computer has, on its own sign-in, in the presentation's folder. A request carries the slide in view, the selected lines, and the problems in the list; the agent edits the file and checks and looks at the slides through `frameseq mcp`, and the panel shows each step as it happens. Its edits reload into the editor, which takes no typing meanwhile, and `Ctrl+Z` undoes them. The conversation carries on from one request to the next until a new one starts. Each request can choose the model, the effort, and fast mode, starting from the agent's own defaults, and the panel shows how much of the plan is used and when it resets. When the agent has finished, the editor shows its changes against the text before the request, each to accept or reject, with **Accept all** and **Reject all** in the editor and the panel. **View › Assistant**, the top bar, or `Ctrl+Alt+I` opens it, and only the computer running the Studio has it.
- Add `frameseq mcp`, a Model Context Protocol server through which a coding agent such as Claude Code, Codex, or Cursor outlines a presentation, checks it as the Studio does, sees its slides as pictures, and reads FrameSeq's guide.
- Add posters and other pages for paper. `poster({ title, author, institute })` starts an A0 portrait page in the new `poster` theme, whose title band is built from the metadata, and returns the page so its layout can follow. Any presentation can be made for paper with `size`, `"A0"` to `"A5"`, `"letter"`, `"legal"`, `"tabloid"`, or a size such as `"36x48in"`, and `orientation`.
  - The canvas keeps units of its own, 1600 across the paper's short side, so themes, layouts, and checks work as on a slide.
  - `mm()` is new, and on paper `mm()` and `pt()` measure the printed sheet, wherever they appear.
  - PDF, PowerPoint, and Typst export print at the paper's size, such as 841 × 1189 mm for A0.
  - The theme option `chrome.header` gives any theme the poster's title band.
- Add `table(rows)`: a table ruled like a paper's, whose columns of quantities align right, with `.header()`, `.columnAlign()`, and `.striped()`. PowerPoint export makes it a PowerPoint table with editable cells, and Typst export a native table.
- Add `chart(kind, data)` for bar, horizontal bar, line, pie, and donut charts drawn from the data written beside them, at their real size, with `.unit()`, `.values()`, `.legend()`, `.max()`, and `.colors()`. PowerPoint export makes each one a PowerPoint chart that can be edited there.
- Add `qr(text)` for a QR code the audience can scan, and `icon(name)` for an icon from Lucide's set. TypeScript knows every icon name, and a built presentation carries only the icons its source names.
- Add `.fit()`, which shrinks an object's text until the object holds it. Display equations wider than their region now shrink to fit across it by themselves.
- Add citations: `presentation({ bibliography })` takes an imported `.bib` file or references written out by key, `cite()` numbers works in citation order or writes names and years, each slide lists the works it cites at its foot, `footnote()` adds a note there, and `references()` builds the full list.
- Make the names given with `.as()` and `at()` identifiers in FrameSeq Studio and the VS Code extension: completion in `ref()`, `group()`, connectors, placements, and `at()`, with anchor sides after a dot; go to definition; find references; rename on the slide; hover; and a diagnostic for a name that refers to nothing, a name given twice, or a layout region the slide does not have.
- Report an error the slide document throws against the statement that caused it. The Studio lists it with its line and underlines the statement; `frameseq check`, `pdf`, `pptx`, and `typst` stop at once and print the file, line, and the code around it, instead of waiting out a timeout; `check --json` reports it as a `document-error` issue. Anchors that cannot be resolved name the object that refers to them.
- Give every `frameseq check` finding the line of the command that made the object, as `element.source`, and place the VS Code extension's layout diagnostics on that line.
- Add the FrameSeq app: an installer for Windows, disk images for macOS, and archives for Linux that bring their own Node.js, the Typst compiler, Tectonic, and on macOS and Linux a browser for exports, so FrameSeq Studio and the `frameseq` command need nothing installed first. `scripts/app-bundle.mjs` builds it, and version tags attach it to the GitHub release.
- Add a language tour to the documentation, and pages on posters, citations, and the app, in English and Chinese.
- Give FrameSeq Studio a window of its own in the FrameSeq app, a small Tauri program in the system's web view. On Windows the menu bar is the title bar, which moves and maximizes the window, with minimize, maximize, and close at its right end; on macOS the traffic lights sit over its left end. The window starts the Studio with the app's Node.js, opens presenter view in a window of its own and links in the default browser, asks about unsaved edits before it closes, and stops the Studio when it does. `frameseq studio` run from the app opens it too. Where it cannot open, as without WebView2 or WebKitGTK, or where Smart App Control refuses it, unsigned as it is, the Studio opens in a browser's app window as before; the Windows shortcut runs the signed Node.js, which opens the window, for that reason.
- Add `shape(kind, label)` for diagrams: 27 outlines, from `diamond`, `cylinder`, `document`, `cloud`, and `callout` to `chevron`, `step`, and block arrows, each at a usual size of its kind and with its label set in the outline's own room. `.tone(color, "soft" | "solid" | "outline")` paints a shape, a `rect()`, or a `circle()` from one named or CSS colour, worked out against the theme so a dark theme gets darker tints and lighter labels; `.shadow()` and `.dashed()` finish it. PowerPoint export makes each shape PowerPoint's own preset, so it stays editable there, and Typst export an editable polygon or curve.
- Give connectors `.route("elbow")`, which turns at right angles, leaves and enters its objects square, and runs around the other objects on its canvas; `.route("curve")`; `.label(text)`, written halfway along on the slide's background; and `.dashed()`. PowerPoint export keeps them as paths with their arrowheads and labels.
- Draw objects onto a slide in FrameSeq Studio, as a drawing program does: **Insert**, in the menu bar and above the preview, offers a gallery of every shape, a text box, a line, an arrow, and a connector. Drag one out on the slide and its command is written with the coordinates and size drawn, its placeholder text selected for typing, and layout editing on. A connector dragged between two objects names them where needed and follows them when they move.
- Add the `label-overflow` layout check, a warning when a shape's label does not fit inside its outline.
- Start a new presentation from a template. FrameSeq Studio's **New presentation** shows one template for each built-in theme by its real cover: a blank page, a dark talk for products and code, serif pages for a story, a research talk, the same lecture in the three Beamer-inspired themes, and an A0 conference poster. `frameseq new talk.slides.ts --template poster` writes the same ones. Each passes `frameseq check --strict` as written, with placeholders in English or, in a Studio shown in Chinese, in Chinese.
- Add a slide from a layout. The **+** above FrameSeq Studio's slides, **New slide after…** on a thumbnail, and **Slide › New slide after this one** offer twelve layouts taken from the recipes, from title and points and two columns to a table, a chart, a flow diagram, and a closing line, and select the new slide's title for typing.
- Show FrameSeq Studio in Chinese as well as English. It starts in the browser's language, and **View › Language** or the switch on the start page changes it, keeping any unsaved text. In Chinese, TypeScript's error messages are in Chinese too, and a new presentation starts with Chinese placeholders.

### Changed

- FrameSeq Studio presents in its own window: **Present**, `F5`, or `Shift+F5`, from the editor, the preview, or the slide rail, shows the slides full screen, edge to edge on black, as PowerPoint does, instead of opening presenter view in another window. A click, the arrow keys, `Space`, `Enter`, and `Page Down` or `Page Up` move through the slides and their reveal steps, the pointer hides while it rests, the screen goes black after the last slide until one more step ends the show, and `Esc` brings the Studio back on the slide the show ended on. In the FrameSeq app the window itself goes full screen. Presenter view, for a second screen, is **Present › Presenter view in a new window**.
- FrameSeq Studio's **Current slide** panel is a format pane. Selecting an object, in the panel, the preview, or the code, opens its settings below its row, and clicking the row again folds them: its words, a list's items, or a formula's Typst, LaTeX, or TeX source; text style, font size, bold, colour, and alignment; background, fill, outline, and a shape's colour scheme; size and position; and **More settings** for the rest. A setting the code does not state yet is added as a method after the object's last one, and clearing it takes the call away, each as one step of the editor's history. Rows show what an object says with a tag for its kind or style, and regions, layouts, and settings are named in the Studio's language. **Delete** removes an object that is a statement of its own, with the comments above it and any connector that ends at it, as deleting it in the preview does.
- FrameSeq Studio's problems panel starts folded. The status bar counts the problems and the editor underlines them; `Ctrl+J`, **View › Problems panel**, or the counts open it, and a build error opens it by itself.
- FrameSeq Studio has a menu bar, **File**, **Edit**, **View**, **Slide**, **Present**, and **Help**, in place of the buttons and switches along its top. Every command is there with its shortcut; `Alt` or `F10` reaches the menus from the keyboard, and `Alt` with a menu's letter opens it. New in them are **Present › From the beginning** (`Shift+F5`), **Help › Keyboard shortcuts**, and **Help › About**.

- The smallest readable type that `frameseq check` accepts now grows with the canvas: 14px on a 1280-wide slide, as before, and proportionally more on a wider one. On paper it is judged by printed size, and the finding gives both.
- Exports and checks render with an installed Chrome or Edge when Puppeteer has no browser of its own; `FRAMESEQ_BROWSER` names another.

### Fixed

- The Studio's **Current slide** panel shows a tagged template such as `` latex`\begin{tabular}…` `` with its backslashes, where it showed `\b` as an unknown character.
- Spaces at the end of a line no longer make `frameseq check` report text in a clipped box as clipped on the right.
- A diagram centred with `anchor()` no longer comes apart in PDF export when another slide follows it: each slide is laid out as one page, instead of the diagram being split at the page's edge away from its connectors.
- Typst export resolves named placements and connectors before writing them, rather than leaving connectors at the page's corner, and draws arrowheads.
- Building the app on Windows no longer fails while a Studio or `frameseq dev` runs from the same checkout, whose server no longer watches `output/` and `desktop/target/`.

## [0.38.0] - 2026-10-09

### Added

- Open, create, and switch presentations inside FrameSeq Studio. The file name in the top bar opens a menu with **New presentation…**, **Open…** (`Ctrl+O`), the recent presentations, and **Show in folder**; the other presentation opens in the same window, and the Studio works from its folder, so its exports land beside it.
  - **New presentation** takes a title and a folder, names the file after the title, writes a cover and a first slide, and never overwrites an existing file.
  - **Open** uses the computer's own open dialog, or asks for the path where there is none.
  - Unsaved edits are saved or set aside only when the person says so.
- Start `frameseq studio` without a file to open the Studio's start page: a new presentation, an existing one, or a recent one.
- Add `frameseq shortcut`, which puts FrameSeq Studio, with its icon, in the Start menu and on the desktop on Windows, in `~/Applications` on macOS, and in the applications menu on Linux. It opens the start page; `--remove` takes it away.
- Add `frameseq studio --background`, which runs the Studio without a terminal and stops it once its window has closed. The shortcut uses it.

### Fixed

- A slide document with no project of its own, such as a file in any folder run by a global install, now previews, opens in the Studio, checks, builds, and exports. It failed to resolve `@pride7/frameseq`, so only `inspect` worked; it now uses the FrameSeq that runs it.
- The VS Code extension runs such a deck through the `frameseq` command a global install put on the PATH, and says how to install FrameSeq when there is none, where on Windows it failed to start. The extension is now version 0.7.0.

## [0.37.0] - 2026-10-09

### Added

- Add a Current slide inspector to FrameSeq Studio, below the slide rail. It lists the objects on the slide in the preview by region, highlights the one under the cursor, shows each object's source and outlines it in the preview, and edits the literal values commands state: type a value, step numbers with the arrow keys, or pick a colour. Each edit is one undoable change.
- Add **FrameSeq: Open in Studio** and **FrameSeq: Stop Studio** to the VS Code extension, which is now version 0.6.0.

## [0.36.0] - 2026-10-09

### Added

- Add FrameSeq Studio, started with `frameseq studio talk.slides.ts` or `npm run studio` in a generated project. One window, opened as an app window when Chrome, Edge, Chromium, or Brave is installed, holds live slide thumbnails, the slide document in a TypeScript editor, the interactive preview, and one Problems list.
  - The editor completes FrameSeq commands and methods, underlines errors, and shows documentation and parameter hints, all from the project's own `tsconfig.json`.
  - Auto-save writes only text that parses, so the preview never shows a half-typed line as a build error; `Ctrl+S` always saves.
  - The rules of `frameseq check` run against the live deck after every save, and each finding leads to its slide and source line. Build errors and errors thrown while the deck runs join the same list.
  - Preview drags, Alt-clicks, and **Bind region** act through the editor, so `Ctrl+Z` undoes them even while the preview has focus. The cursor shows the slide that holds it.
  - Thumbnails reorder slides by dragging, and duplicate, insert, or delete them from a menu, each as one undoable edit. Slides made by a loop or a helper call move, repeat, and disappear together as the statement that made them, and the slides around them still move one at a time.
  - A theme button switches the Studio between following the system, light, and dark.
  - A change made on disk, by a coding agent for instance, reloads into a clean editor; with unsaved edits, the Studio asks which version to keep.
  - **Present** opens presenter view, and **Export** runs every CLI export to its usual location.
  - The Studio's interface exists only on a server started by `frameseq studio`, answers only this computer unless `--host` is given, and refuses requests from any other page.
- Document the authoring commands, text roles, slide layouts, and chainable modifiers in the type declarations, so an editor's hover and completion explain what each one does rather than only showing its type.

### Fixed

- Keep the reveal step of the slide on screen when an editor asks the live preview to show an object on that same slide, so following the cursor no longer resets `steps()` to the start.
- Replace the slide document in one step when a preview drag or the Studio saves it, so a development server or an editor reading the file at that moment never finds it empty.

## [0.35.0] - 2026-08-13

### Added

- Add a notes text size control to presenter view: **A−** and **A+** in the **Speaker notes** heading, or the `-` and `+` keys, step the notes between 70% and 200% of their default size so a long script fits on screen or reads from a step back. The size is remembered per browser and changes nothing the audience sees.

## [0.34.0] - 2026-08-13

### Added

- Report `inert-modifier` from `frameseq check`: a layout modifier that lands where the browser cannot honour it — `align()` on a leaf object, `selfAlign()` or `grow()` inside a block container — is now named along with the nearest modifier that would have worked, instead of being dropped in silence.
- Add `spacer(size?)` to the linear document API, so the room left over in a row or column can push the objects after it to the far end.
- Add `.maxWidth()` and `.maxHeight()`, which is how a paragraph is held to a readable measure.
- Accept individual sides in `.padding()` and `.margin()`, a second value in `.gap()` for column spacing, `"space-evenly"` in `.justify()`, and a new `.alignContent()` for wrapped rows and columns. The build-time layout engine resolves all of them, including the `space-around` distribution it previously refused.
- Create slide grid cells on demand, so `cell(5)` on a three-column grid opens a second row instead of failing.

### Fixed

- Resolve asymmetric padding correctly at build time: a container's inner size and intrinsic size now use each side of the padding rather than assuming the leading side is repeated, so anchors and connectors inside a padded row or column land where the browser puts them.


## [0.33.0] - 2026-08-12

### Added

- Add `.selfAlign()` and `.centerSelf()` so a single object can be centred or aligned across the axis of the region that holds it, without centring the whole region and without dropping to `.style({ alignSelf: ... })`. The build-time layout engine resolves `alignSelf`, so anchors and connectors agree with the browser, and Typst export honours it.

## [0.32.0] - 2026-08-12

### Added

- Add centred Ctrl/Command+mouse-wheel zoom to interactive previews, with a visible percentage plus fit-to-window and 100% reset controls.

### Fixed

- Keep the VS Code live-preview canvas horizontally centred by clearing the webview's injected body padding, restoring equal left and right gutters.

## [0.31.0] - 2026-08-12

### Added

- Generate a shared `AGENTS.md` authoring guide and a thin `CLAUDE.md` import in both new FrameSeq projects and `frameseq new`, covering the linear DSL, persistent `at()` cursor, formula input, diagram structure, editing discipline, and required rendered-layout validation without overwriting existing project instructions.
- Add **FrameSeq: Select Entry** to the VS Code extension for workspaces holding several presentations, remembering the picked deck per workspace and moving a running preview to it.

### Fixed

- Discover VS Code decks kept outside the workspace root: the extension now searches every directory for `slides.ts` and `*.slides.ts`, prefers the deck closest to the file being edited, and runs commands from that deck's own project root.

## [0.30.0] - 2026-08-12

### Added

- Include named `at()` regions and their visit counts in `frameseq inspect --json`, so editor integrations can expose the authoring structure inside each slide.
- Give inspected objects stable IDs, authoring regions, parent relationships, complete source ranges, and editable literal-property metadata.
- Group Current Slide components by region and hierarchy, with validated, undoable editing for source-backed number, boolean, and string properties.
- Synchronise the source cursor, Current Slide component/property selection, and preview highlight, including automatic preview-page changes when the cursor moves across slides.
- Mark `at()` call chains as source-backed preview containers, expose their editable properties and every revisit in inspect JSON, and support moving a positioned named region as one unit by Shift-dragging any child.
- Add direct preview selection in editing mode, Ctrl/Command multi-selection, a named-region breadcrumb, and one-click binding of validated consecutive top-level components into a new `at()` region.
- Make editing mode visibly persistent with an active `E` control, preserve an existing preview's editor group during outline navigation, and retain Current Slide while the preview tab is active.
- Stop outline navigation from briefly activating `slides.ts` before returning to an existing preview; only an already-visible source editor is moved silently.
- Mark the source line for the currently previewed slide with a persistent whole-line highlight, accent edge, overview-ruler tick, and line-end label, including after source refreshes shift its line number.
- Make a Current Slide component outline dismissible from the preview by clicking the canvas, pressing Escape, selecting an editing target, or navigating to another slide.
- Remove the redundant edit-mode instruction pill and single-selection label from the canvas; the active `E` control carries mode state, while the top toolbar now appears only when multiple components make its count and bind action useful.
- Add source-backed multi-selection alignment on all six edges/centres and equal horizontal or vertical distribution, with disabled states for flow, computed, or nested selections and one undoable literal-coordinate edit per action.
- Add one- and ten-pixel keyboard nudging for positioned single or multi-selections, compact geometry feedback, and a two-stage Escape that clears selection before leaving edit mode.
- Snap dragged objects to nearby edges and centres with transient full-slide smart guides, with Ctrl/Command providing an explicit free-movement bypass.
- Keep keyboard focus in the embedded preview after direct selection instead of activating `slides.ts`, and distinguish positioned selections from flow items with explicit actionable feedback.
- Delay pointer capture until a real drag crosses its threshold, so clicking a positioned component selects it instead of retargeting the click to the canvas; restore canvas focus after selection and toolbar actions for reliable real arrow-key input.
- Hot-swap a fully rendered and scaled canvas after source-backed edits while the old canvas remains visible, eliminating the empty-frame flash on drop; preserve selection and focus so consecutive arrow presses keep moving the same component.

### Fixed

- Keep the visible audience preview frame at the presentation canvas ratio inside tall or narrow browser and VS Code panes. The canvas was already scaled correctly, but its rounded outer frame filled the window, making a 16:9 slide look like a portrait page.

## [0.29.0] - 2026-08-07

### Added

- Drag an object in the document flow to change its place among its neighbours. An object with no coordinates to rewrite has an order instead, so releasing it carries the whole lines its command occupies to the gap the preview drew, comments above and beside it included. Reordering stays inside one run of the document: a cursor move such as `left()` or `cell(1)`, a new slide, and a `group(a, b)` that collects the objects written above it each end a run, because carrying lines across one of those would change what the code means rather than only its order. A command sharing its line with another has no lines of its own and is left where it is.
- Undo a drag with `Ctrl+Z` in the preview itself. A browser has no editor to undo into, so the development server keeps the text each drag replaced and puts it back on request, exactly as it was written: a coordinate given as `80.5` returns as `80.5`, not as a number formatted afresh. The history belongs to one slide document and one server run, and is dropped rather than misapplied once the file no longer matches it.
- Apply a drag in the VS Code preview through the workspace, so one Undo puts the object back. The preview asks the editor around it rather than the development server, the extension checks the numbers still match and replaces exactly their ranges, and saving reloads the preview from the document. A preview embedded in anything that does not answer reloads instead of going on showing a position the slide document does not state, so a drag is never quietly lost.

- Alt-click any object in the live preview to open the command that wrote it. The development transform records where each command sits in the slide document and the renderer publishes it as `data-frameseq-source`, so the preview can point back at the source. Inside the VS Code preview the click moves the cursor in the editor beside it; in a browser it asks the development server to open the file. Production builds carry no source spans.
- Drag objects in the live preview to change the coordinates their command states. The `E` control turns on layout editing, where an object placed with `position({ x, y })` can be moved and one given a `width()` or `height()` can be resized from its corner. Only the digits themselves are rewritten, so comments, formatting, and everything else in the file survive unchanged, and a drag whose numbers no longer match the file on disk is refused rather than guessed at. An object whose coordinates are computed, or whose command runs in a loop or a helper, is not draggable: there is no single number a drag could stand for. It stays clickable, and still leads back to its line.

### Fixed

- Keep the documentation header off the edge of a phone. Fitting the brand, the Contents control, and the remaining links into 390 pixels left about two pixels over, which any platform whose fonts are a shade wider spends, so the page overflowed sideways where it was built rather than where it was written. The brand already leads back to the gallery, so the link that repeated it now goes with the others the drawer already reaches, and the check measures the room left over instead of only the overflow.
- Turn the documentation navigation into a drawer on a phone. It used to sit above the article, first scrolling sideways with cut-off labels and then filling half the screen, so a reader met the contents before the page they asked for. A Contents control now opens it on demand, the page opens on the article, and the desktop layout is unchanged. The drawer is a checkbox and a label, so the documentation still ships no JavaScript.
- Keep a documentation link on the landing page on a phone. The small-screen rule hid the whole navigation, and the only link to the documentation lived inside it, so a phone visitor could reach GitHub but not the docs. The in-page anchors are still hidden, since scrolling reaches those sections anyway.
- Keep the language switch visible on a phone. The small-screen rule hid whichever link happened to be third in the header, which became the switch itself once it was added, so the Chinese documentation had no entry point on a phone. The external link is now hidden by name.

## [0.28.1] - 2026-07-31

### Documentation

- Publish the documentation reading path in Chinese: the home page, getting started, recipes, and revising a talk. Every page carries a language switch, the Chinese sidebar offers untranslated pages in English rather than hiding them, and both home pages are rendered from the shared navigation structure.
- Translate the remaining guides: Typst, LaTeX, layout checks, AI generation, presenter view and phone remote, deployment, PowerPoint export, the VS Code extension, the CLI, and advanced composition. Twenty-one of the twenty-five documentation pages are now available in Chinese.
- Translate the seven pages that explain how to write slides: the document model, content, layout, diagrams, shapes, styling, and themes. A Chinese reader can now write a talk end to end without English; export, tooling, and the references remain English and are offered as such in the sidebar.
- Allow a translation to admit that it is behind by recording `sha256:stale`. The build stays green and the page tells its reader that the English version is authoritative, which is better than either blocking a release or leaving a translation that quietly lies.
- Keep translations honest with a recorded hash of the English source. The documentation test fails when a translated page's source has changed, naming the page and asking for `npm run docs:stamp` once the translation has caught up. Code samples are not translated, so the Chinese recipes are held to the same deck as the English ones.

## [0.28.0] - 2026-07-31

### Added

- Add `grid(columns, gap?)` to containers, so a region created by `at()` can be a grid as well as a row or a column. The resolver computes grid geometry too: equal columns divide a declared width, tracks may be given in pixels instead, rows are as tall as their tallest item, and an item without a width of its own fills its cell. A matrix of connected boxes now needs one container rather than three.

### Documentation

- Reorganise the documentation as a reading path followed by reference: Start, Write slides, Typeset mathematics and tables, Check and generate, Present and export, Editor and command line, Reference. The function and API references move out of the first group, the task pages move into it, and every group carries a one-line summary.
- Describe the navigation once, in `scripts/docs-structure.mjs`. The Gallery sidebar is built from it and `docs/README.md` is rendered from it with `npm run docs:index`, so the two views of the documentation cannot disagree. The documentation test fails when the committed home page is out of date, when a group is missing a summary, when a page has no one-line description, and when a page in `docs/` is missing from the navigation entirely.

## [0.27.1] - 2026-07-31

### Documentation

- Add a Recipes guide organised by what a slide is for rather than by which function it uses: cover, one idea and its evidence, comparison, a row of measurements, code beside its explanation, a formula, a flow diagram, a two-dimensional architecture, a progressive reveal, and a closing statement. Every recipe is a complete slide taken from a deck that ships with the Gallery and passes the layout checker.
- End the getting-started guide with the next task rather than a pointer into the reference.
- Show the rendered slide beside every recipe. The Gallery build photographs each slide of the recipes deck and injects it into the page, so the pictures are regenerated on every build and cannot fall out of step with the source they illustrate.
- Add a guide to revising a talk: seven real edits to the recipes deck, each shown as a diff and measured in lines, from a theme change to adding a node to a diagram. The edits were applied together and the result passes the layout checker, so none of them needs a repair pass.

## [0.27.0] - 2026-07-31

### Fixed

- Render a shape at the height it was given. A shape carries a minimum height from the stylesheet, and a minimum always clamps an explicit height, so `rect("A").height(80)` was drawn 96px tall. An explicit `height()` now releases that minimum, while an explicit `minHeight()` set before it still applies.

### Added

- Add a Diagrams guide that puts the whole model in one place: `at()` for which container an object belongs to, `row()` and `column()` for how it arranges them, `anchor()` for where the container sits, and names for how objects relate. The composition sections move there from the shapes guide, which now covers the primitives.
- Resolve nested rows and columns, so a two-dimensional diagram needs no coordinates either. A nested container is as large as the layout it produces, and the container around it decides its size on the other axis. Using `align()` or `justify()` on a nested container requires an explicit `width()` and `height()`, because otherwise its size is not its own to decide.

## [0.26.0] - 2026-07-31

### Added

- Resolve `row()` and `column()` layout before rendering, so objects inside them can be anchored and connected without coordinates of their own. Only the exactly computable part of flexbox is supported; `wrap()`, `grow()`, a theme-supplied gap or padding, and children of unknown size are reported as errors instead of guessed.
- Add `.anchor(position, margin)`, which places an object against its container using the same nine positions as connector anchors, so a diagram can be written without a single coordinate.
- Add a test that measures the rendered boxes in a browser and checks every connector endpoint against them, so build-time layout cannot silently drift from what the browser draws.

### Removed

- Remove `slide().place(element, bounds)` and the `PlaceBounds` type. Geometry now has one spelling: `.position({ x, y })` with `.width()` and `.height()`. Objects created by the linear API attach themselves, and detached objects from the explicit object API reach a slide through `custom(...)`. Call `canvas()` explicitly, which `place()` used to do silently.

## [0.25.0] - 2026-07-31

### Added

- Add Chinese, Japanese, and Korean fallbacks to every built-in theme font stack, for body, heading, and code text. Families resolve per character, so Latin text keeps the theme font while CJK text gets a real face instead of empty boxes. The same list reaches Typst export, which also falls back per character.
- Add a CJK rendering test that compares rendered glyph bitmaps in interactive and print mode and fails when characters render as identical tofu boxes. The test validates its own detector against unassigned code points.
- Install `fonts-noto-cjk` in the CI, publish, and Gallery workflows so exports rendered on a Linux runner carry real glyphs.

### Fixed

- Export a CJK typeface for PowerPoint runs that contain CJK characters. PowerPoint stores one typeface per run, so the Latin family that leads the stack previously left those runs to viewer substitution.

## [0.24.0] - 2026-07-31

### Removed

- Remove `.parent(container)`. Region paths and name-based grouping cover every case it served: use `at("panel")` to name a container before its contents, and `group("first", "second")` or `gridSection(2, "first", "second")` to collect objects that were written first. Unlike `.parent()`, neither requires a local variable, so slide source stays flat.

## [0.23.0] - 2026-07-31

### Added

- Add `.as(name)` to give a diagram object a slide-scoped name.
- Add anchored connectors: `line().from("enc")` and `line().to("dec.left")` resolve to endpoints before rendering, pick the facing edges when no anchor is given, and accept a `{ dx, dy }` offset. `line()` no longer requires coordinates.
- Add relative placement modifiers `.rightOf()`, `.leftOf()`, `.above()`, `.below()`, `.centerOn()`, `.alignTop()`, and `.alignLeft()`, so a diagram can position one object and describe the rest in relation to it.
- Add `note(content)`, the linear form of `slide().notes(content)`. It returns the current slide, and repeated calls append a line, so speaker notes can be written beside the content they explain.
- Add `ref(name)` for selecting a named object or region again, and let `group()` and `gridSection()` take names as well as objects, so regrouping and later styling need no local variables.
- Add `at(path)`, a region cursor that addresses regions by path and creates the containers it names, so grouping no longer requires nested source. The first segment may be an existing region such as `main`, `left`, `right`, or `cell0`; revisiting a path appends to the same region; paths are scoped to their slide and are also registered as anchor names.

- Add two layout checks for named regions: `empty-region` reports a region created by `at()` that never received content, and `similar-name` reports two names on the same slide that are one edit apart, which usually means a mistyped path.

### Changed

- Resolve every named reference into finished geometry before rendering, so HTML, PDF, PPTX, and Typst output stay identical, and report unresolved references as errors that name the slide, the reference, and the available objects.

- Report notes written with `note()` in `frameseq inspect`, so the editor outline stays accurate.

### Documentation

- Document names, anchors, and relative placement in the README, shapes guide, function guide, and AI generation notes.

## [0.22.1] - 2026-07-22

### Changed

- Generate `components/content.ts` and `components/theme.ts` in new projects so `slides.ts` stays focused on presentation structure, with direct imports and no barrel `index.ts`.

## [0.22.0] - 2026-07-22

### Added

- Add incremental parent-child composition: create an empty `group()` or `gridSection()`, then move later objects into it with `.parent(container)`.
- Add container `.canvas()` for local positioned coordinate systems and `.clip()` for controlling child overflow.

### Changed

- Track object ownership centrally so regrouping and reparenting preserve source order without duplicates while rejecting cycles and cross-slide moves.

### Documentation

- Document both direct and incremental container forms in the README, layout guide, styling guide, function guide, and API reference.

## [0.21.2] - 2026-07-22

### Fixed

- Preserve bottom-aligned CSS flex text in editable PPTX export so underline-style theme titles remain visually close to their rule.

## [0.21.1] - 2026-07-22

### Fixed

- Preserve partial CSS borders in editable PPTX export by emitting separate PowerPoint line objects for the visible top, right, bottom, or left edges instead of expanding the largest edge into a full rectangular border.

## [0.21.0] - 2026-07-22

### Added

- Add `frameseq typst` and `npm run typst` to export a complete presentation as editable `.typ` source with native Typst pages, grids, text, positioning, shapes, images, and MiTeX-powered inline and display LaTeX math.
- Convert common LaTeX `tabular`, `tabular*`, and `tabularx` fragments into editable native Typst tables, using MiTeX text mode for cell formatting.
- Preserve native `typst` fragments directly in the exported source, use MiTeX text mode for basic LaTeX prose, and retain explicit SVG fallbacks plus conversion notes for unsupported LaTeX or CSS features.

### Documentation

- Add a Typst-inspired function reference that documents each common authoring function with a one-sentence definition, minimal example, readable signature, parameters, return value, and relevant behavior.
- Replace the flat documentation list with a task-based index for getting started, slide authoring, presenting and export, AI and typesetting, editor tooling, and maintainer reference.
- Build the Markdown documentation into the Gallery as responsive static pages with categorized navigation, readable code and tables, working internal links, and GitHub edit links.
- Add `npm run preview:gallery` to rebuild and open the complete Gallery and documentation site locally before committing or publishing.

## [0.20.0] - 2026-07-22

### Added

- `gridSection(columns, ...items)` for placing a local grid inside the normal slide flow without manually selecting cells.
- `group(...items)` and `card(title, content?)` for composing grid items while keeping slide source content-first and linear.

### Changed

- `metric()` now returns the metric object it creates, so it can be passed directly to `gridSection()` and styled independently.

## [0.19.0] - 2026-07-22

### Added

- A companion VS Code extension with a native slide outline, side-by-side live editing, source-and-preview synchronization, slide navigation and insertion, snippets, layout diagnostics, and HTML/PDF/PPTX export commands.
- `frameseq inspect [file] --json` for fast static slide metadata and source locations shared by editor and future AI integrations.

### Fixed

- Make development entry matching insensitive to Windows drive-letter casing so VS Code previews render correctly.
- Allow editor integrations to start Vite without opening a competing system-browser window.

## [0.18.0] - 2026-07-21

### Added

- Static `latex` and `latexFile()` objects for build-time Tectonic rendering of LaTeX tables, with embedded fonts, content caching, normal FrameSeq modifiers, and HTML/PDF/PPTX support.

## [0.17.0] - 2026-07-21

### Added

- `frameseq check` now reports an `empty-slide` warning when a rendered slide has no visible content, while `slide().allowEmpty()` explicitly permits intentional blank pages.

### Fixed

- The online Playground cover now includes visible title, subtitle, and author objects instead of opening on an empty themed canvas.

## [0.16.1] - 2026-07-21

### Fixed

- StackBlitz and other container previews can use the new `frameseq dev --host` option to expose Vite without enabling phone-remote mode; the online Playground now uses it by default.

## [0.16.0] - 2026-07-21

### Added

- A standalone StackBlitz playground with one-click entry points from the README, documentation, and Gallery.
- Tag-based Trusted Publishing for both npm packages through GitHub Actions and OIDC.
- A release guide and automated checks that keep tags, package versions, the creator template, and playground dependency aligned.

## [0.15.0] - 2026-07-21

### Added

- A root `llms.txt` contract and practical AI generation guide for coding agents.
- A complete AI-oriented research presentation with a live Gallery preview and editable source.

## [0.14.0] - 2026-07-21

### Changed

- Standardized project terminology on “slides” across the public API, runtime, CLI, tests, documentation, and Gallery.
- The low-level structural API now uses `SlidesRoot`, `SlidesRootDefinition`, and `SlidesOptions`; the browser renderer now mounts presentations with `mountSlides()`.
- Gallery presentation sources now live in `gallery/slides/`.

## [0.13.1] - 2026-07-21

### Fixed

- Puppeteer-based tests and exports now launch Chromium correctly on Linux CI and root containers.
- Gallery builds now compile the local package first, so they work from a clean checkout without a pre-existing `lib/` directory.
- Release checks no longer open browser tabs for each programmatic Vite preview.
- GitHub workflows now use the current Node 24-based official Actions releases.

## [0.13.0] - 2026-07-21

### Added

- A live example Gallery with deployable Midnight, Minimal Academic, and Beamer Madrid presentations.
- GitHub Actions workflows for continuous integration and Gallery deployment.

## [0.12.0] - 2026-07-21

### Added

- Editable hybrid PPTX export for text, lists, code, shapes, images, math, and Typst.
- Pixel-faithful `--flatten` PowerPoint export.
- PowerPoint speaker notes and centered native list markers.

## [0.11.0] - 2026-07-21

### Added

- QR-based phone remote control over the local network.
- Mobile presenter mode with notes, next-slide preview, timer, and page selector.
- Synchronized navigation, reveal steps, and laser pointer coordinates.

## [0.10.0] - 2026-07-21

### Added

- Portable static HTML builds and single-file HTML export.
- Generated GitHub Pages deployment workflow for new projects.

## [0.9.0] - 2026-07-21

### Added

- AI-friendly layout checks for overflow, clipping, and small text.
- Machine-readable `--json` diagnostics and strict CI mode.

## [0.8.0] - 2026-07-21

### Added

- Synchronized presenter view with notes, timer, next slide, and page navigation.
- Audience-visible virtual laser pointer.

## [0.7.0] - 2026-07-21

### Added

- Editable rectangles, circles, SVG lines, connectors, and arrowheads.

## [0.6.0] - 2026-07-21

### Added

- Build-time Typst fragments and local Typst file support.

## [0.5.1] - 2026-07-21

### Fixed

- Interactive slides remain centered and visible in narrow desktop and mobile viewports.

## [0.5.0] - 2026-07-21

### Added

- Zero-configuration Tailwind CSS utilities through `style()`.

## [0.4.0] - 2026-07-21

### Added

- Presentation-wide typography settings and local font overrides.
- The Minimal Academic theme.

## [0.3.0] - 2026-07-21

### Added

- Beamer-inspired Madrid, Berlin, Copenhagen, and AnnArbor themes.

## [0.2.1] - 2026-07-21

### Fixed

- npm documentation links now open rendered pages on GitHub.

## [0.2.0] - 2026-07-21

### Added

- Built-in themes, custom theme definitions, and reusable presentation metadata.

## [0.1.1] - 2026-07-21

### Changed

- Published the framework under the `@pride7/frameseq` npm scope.
- Added the first documentation set and project scaffolding guide.

## [0.1.0] - 2026-07-21

### Added

- Initial linear TypeScript slide document, browser runtime, layouts, formulas, and PDF export.

[0.22.1]: https://www.npmjs.com/package/@pride7/frameseq/v/0.22.1
[0.22.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.22.0
[0.21.2]: https://www.npmjs.com/package/@pride7/frameseq/v/0.21.2
[0.21.1]: https://www.npmjs.com/package/@pride7/frameseq/v/0.21.1
[0.21.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.21.0
[0.20.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.20.0
[0.19.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.19.0
[0.18.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.18.0
[0.17.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.17.0
[0.16.1]: https://www.npmjs.com/package/@pride7/frameseq/v/0.16.1
[0.16.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.16.0
[0.15.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.15.0
[0.14.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.14.0
[0.13.1]: https://www.npmjs.com/package/@pride7/frameseq/v/0.13.1
[0.13.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.13.0
[0.12.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.12.0
[0.11.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.11.0
[0.10.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.10.0
[0.9.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.9.0
[0.8.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.8.0
[0.7.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.7.0
[0.6.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.6.0
[0.5.1]: https://www.npmjs.com/package/@pride7/frameseq/v/0.5.1
[0.5.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.5.0
[0.4.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.4.0
[0.3.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.3.0
[0.2.1]: https://www.npmjs.com/package/@pride7/frameseq/v/0.2.1
[0.2.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.2.0
[0.1.1]: https://www.npmjs.com/package/@pride7/frameseq/v/0.1.1
[0.1.0]: https://www.npmjs.com/package/@pride7/frameseq/v/0.1.0
