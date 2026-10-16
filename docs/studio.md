# FrameSeq Studio

FrameSeq Studio puts the whole loop of writing a talk in one window: the slides as thumbnails, the source in a TypeScript editor, the live preview, and one list of everything wrong with the slides. It needs nothing beyond the FrameSeq package: no editor, extension, or separate download.

This page describes every part of the window. To make a first presentation step by step, start with the [Studio quick start](studio-quickstart.md).

With the [FrameSeq app](app.md) installed, open FrameSeq Studio from the Start menu, Applications, or the applications menu. From a terminal, the same Studio opens on a file:

```bash
frameseq studio talk.fsq
```

The command starts the development server and opens the Studio. When Chrome, Edge, Chromium, or Brave is installed, the Studio opens as an app window of its own, with no tabs or address bar; otherwise it opens in the default browser. A project generated with `npm create frameseq` runs the same thing with `npm run studio`.

Without a file, and with no `slides.ts` in the folder it starts from, `frameseq studio` opens on its start page, where you start a new presentation, open one, or pick up a recent one. To open the Studio like any other program instead of from a terminal, [add a shortcut](#a-shortcut):

```bash
frameseq shortcut
```

The source stays the only description of the talk. Everything the Studio does, whether it is typing, dragging in the preview, or reordering slides in the rail, ends as an edit to `talk.fsq` that the editor's own undo can take back.

## The window

| Area | What it holds |
| --- | --- |
| **Slides** (left) | Every slide, rendered by the same runtime as the preview and updated on every save. |
| **Current slide** (left, below the slides) | The objects on the slide in the preview, by region, and the settings of the one selected. |
| **Editor** (centre) | The slide document, with TypeScript completions, errors, hover documentation, and parameter hints. |
| **Preview** (right) | The interactive preview, where objects are selected, dragged, and typed into directly, with its usual navigation and zoom, and a lock for the layout. |
| **Notes** (right, below the preview) | The speaker notes of the slide in the preview, typed in place. |
| **Problems** (bottom) | TypeScript errors, layout-check findings, build errors, and errors thrown while the slides ran. |
| **Terminal** (bottom, beside Problems and Output) | A shell in the presentation's folder. |

Drag the dividers to resize the areas; double-click a divider to restore its default. `Ctrl+B` (`⌘B` on macOS) hides the slide rail, `Ctrl+J` shows or hides the bottom panel, and `` Ctrl+` `` opens the [terminal](#the-terminal). The panel starts folded, since the status bar counts the problems and the editor underlines them; the counts open it too, and a build error opens it by itself. The sizes are remembered by the browser.

To work on the slides without the code, click **Code** in the top bar or press `Ctrl+E`: the editor folds away and the preview takes its room, where objects are dragged, typed into, inserted, and deleted directly, with `Ctrl+Z` still undoing. The cursor keeps following what you pick, so the code comes back at the object you last touched, and the commands that are about the code, such as **Go to the slide's source**, a problem in the list, or `Alt`-clicking an object, bring it back by themselves.

### The menu bar

Every command is in the menu bar along the top, beside each one's shortcut:

| Menu | Commands |
| --- | --- |
| **File** | New presentation, Open, Open recent, Show in folder, Save, Auto-save, Page setup, Save as template, Open templates folder, Export |
| **Edit** | Undo, Redo, Find and replace, Select all, Go to definition, Rename |
| **View** | The slide rail, the current slide, the speaker notes, the code, the bottom panel, and the assistant; Problems, Output, and Terminal; Follow cursor; Slide master; Theme; Language |
| **Slide** | New, duplicate, move, and delete the current slide; Previous and Next slide; Go to its source; Master |
| **Insert** | The shape gallery; Text box, Line, Arrow, and Connector; every shape, by group; in the master view, Placeholders |
| **Present** | From the beginning, From the current slide, Presenter view in a new window, Phone remote…, Open the preview in a browser |
| **Help** | Documentation, Language tour, Keyboard shortcuts, Check for updates, Automatic updates, Report an issue, About |

Press `Alt` or `F10` to reach the menus from the keyboard, or `Alt` with a menu's underlined letter, such as `Alt+F` for **File**; the arrow keys move between menus and commands, and `Esc` closes them. **View › Theme** follows the system, or stays light or dark. The slides themselves keep the presentation's own theme.

### Right-click menus

Right-click something, or press `Shift+F10` or the menu key, for the commands that apply to it, as in PowerPoint:

| Where | Commands |
| --- | --- |
| **An object in the preview** | Cut, Copy, Paste; Duplicate, Delete; **Order**: Bring to front, Bring forward, Send backward, Send to back, or, for an object in the flow, Move to the start, Move earlier, Move later, Move to the end; on a table's cell, **Table**: Insert row above or below, Insert column left or right, Delete row, Delete column; Edit text, Format…, Go to code |
| **Several selected objects** | Cut, Copy, Paste, Duplicate, Delete; **Align** by their edges or centres, or distribute them evenly; Bind into a region…; Go to code |
| **The slide itself** | Paste; Insert; New slide after this one; on a cover drawn from the presentation's details, Convert to an editable cover; Lock layout; Go to the slide's source; Present from here |
| **A detail of the cover** | Edit text, Go to code, Convert to an editable cover |
| **An object in Current slide** | Cut, Copy, Paste, Duplicate, Delete, Edit text, Format…, Go to code |
| **The code** | Go to definition, Rename; Cut, Copy, Paste; Comment or uncomment; Select all; Find and replace |
| **A thumbnail in the slide rail** | New slide after…, Duplicate, Move up, Move down, Go to source, Present from here, Edit the master, Delete; in the master view, New master, Go to source, Delete |

A right-click on an object selects it, alone, unless it is already selected, when the selection stays as it is; a right-click on the slide's empty part clears the selection. The stacking order is the order of the lines: **Bring to front** moves an object's lines after those of the other objects beside it that are placed by coordinates, so it is drawn above them, and in the flow the same commands move it among its neighbours. **Edit text** types the object's words on the slide, as a [double-click](#typing-on-the-slide) does, or, for a formula or a picture, opens its settings in Current slide with its words selected; **Format…** opens them at its row. Each command is one step in the editor's history.

**Copy** keeps the lines that write the objects, with the comments above them, and puts them on the clipboard as text, so they can be pasted into the code as well. **Paste** writes them onto the slide in the preview, after the selected object, as **Insert** does. A name that slide already has becomes a new one, such as `box` to `box2`, and the pasted lines that refer to it follow. Pasted back onto the slide they came from, objects placed by coordinates move 24 down and to the right each time, so a copy never hides the original. In the preview, `Ctrl+C`, `Ctrl+X`, `Ctrl+V`, and `Ctrl+D` copy, cut, paste, and duplicate. An object written inside another command is copied in the code.

In the code, a right-click outside the selection moves the cursor there first, so the commands act where it landed. **Paste** reads the clipboard where the browser allows it, and otherwise asks for `Ctrl+V`.

Elsewhere in the window a right-click opens nothing, except in fields that take text, on links, on selected text, and in the terminal, which keep the browser's own menu; `Shift`+right-click opens that menu anywhere.

### In the FrameSeq app

The [FrameSeq app](app.md) gives the Studio a window of its own, whose menu bar is the title bar on Windows: drag its empty part to move the window, double-click it to maximize, and use the minimize, maximize, and close buttons at its right end. On macOS the traffic lights sit at the menu bar's left end. **Present** turns the window itself full screen to show the slides, on a second screen when there is one, with presenter view on this one; **Present › Presenter view in a new window** opens presenter view in a window of its own, and links such as **Help › Documentation** open in the default browser. Closing the window asks about unsaved edits, as opening another presentation does, and then stops the Studio.

### Language

The Studio speaks English and Chinese. It starts in the language of the browser, and **View › Language**, or the switch on the start page, changes it. The window reloads in the new language and keeps any unsaved text. In Chinese, TypeScript's own error messages are in Chinese too, and a new presentation starts with Chinese placeholders. The choice is remembered by the browser.

### Updates

The [FrameSeq app](app.md#updates), and FrameSeq installed with npm, check once a day whether a newer FrameSeq is out. The app installs a version that changes only FrameSeq by itself, and the Studio says it starts the next time the Studio opens; for a version that needs a new app, the notice's **Download** opens the release page with the installers. An npm install shows the command that updates it. **Skip this version** stops mentioning that version until a newer one comes. **Help › Check for updates…** checks at once, and offers **Update** where the app can install the version itself; **Help › Automatic updates** turns the daily check, and with it the app's own updating, off, as `FRAMESEQ_NO_UPDATE_CHECK=1` does. The app asks the npm registry and GitHub, and an npm install asks the npm registry; neither sends anything but FrameSeq's version. A checkout of the repository does not check, and a Studio started with `--no-open`, as scripts and tests start it, checks only when asked.

## Presentations

**File** holds **New presentation…**, **Open…** (`Ctrl+O`), the presentations opened recently, and **Show in folder**; the file name in the middle of the top bar opens the same list. The start page offers them too, and lists the recent presentations with a button that removes one from the list.

- **New presentation** asks for a title, a template, and a folder, names the file after the title, as `quarterly-review.fsq` for *Quarterly review*, and writes the template into it with the title in place. A file of that name is never overwritten; the dialog offers to open it instead. The folder starts as the one used last, or Documents.
- The templates are shown by their real covers, rendered as the presentation will be. There is one for each built-in theme: **Blank**, a cover and a first slide; **Midnight**, a dark talk for products and code; **Paper**, serif pages for a story; **Academic talk**, a research talk in `minimal-academic`; **Beamer**, **Beamer Madrid**, and **Beamer CambridgeUS**, the same lecture in the three Beamer-inspired themes; and **Poster**, an A0 conference poster in three columns. Each passes the layout check as written. Double-click a template to create the presentation at once; the next dialog starts on the template used last.
- **My templates**, below them, are your own: presentations kept with **File › Save as template…**, masters and theme included. Right-click one to edit it, show it in its folder, or delete it, and right-click a built-in template to keep a copy among yours to change. The line under the templates names the templates folder, with buttons that open it and move it elsewhere; see [Masters and templates](masters.md#templates-of-your-own).
- **Open** shows this computer's own open dialog. Where there is none, as on Linux without `zenity` or `kdialog`, the Studio asks for the file's path instead; `FRAMESEQ_NO_DIALOGS=1` makes it always ask.
- When the open document has unsaved changes, the Studio asks whether to save them first. **Cancel** keeps the document open.

A presentation is an `.fsq` file, FrameSeq's own extension, which the FrameSeq app and `frameseq shortcut` let Windows open in the Studio with a double-click. Its text is TypeScript, exactly what a `.slides.ts` file holds, and the Studio opens both: rename one to the other and nothing else changes. Keep `.slides.ts` for a presentation that a TypeScript project checks with `tsc` or that VS Code should check as you type, since TypeScript itself reads only `.ts` files; see [VS Code](vscode.md#fsq-files).

The other presentation then opens in the same window, and the Studio works from its folder from then on: its exports land beside it, in its own `output/` and `dist/`. Recent presentations are kept in FrameSeq's settings folder, `%APPDATA%\FrameSeq` on Windows, `~/Library/Application Support/FrameSeq` on macOS, and `~/.config/frameseq` on Linux, or `FRAMESEQ_CONFIG_DIR` when it is set; a Studio started with `--no-open`, as scripts and tests start it, leaves the list alone. Only the computer the Studio runs on can open files and show dialogs, even with `--host`.

## A shortcut

```bash
frameseq shortcut
```

This adds **FrameSeq Studio**, with the FrameSeq icon, to the Start menu and the desktop on Windows, to `~/Applications` on macOS, and to the applications menu on Linux. The shortcut opens the start page. It runs `frameseq studio --background`, which starts the Studio without a terminal and stops it once its window has closed; what the server prints goes to `studio.log` in the settings folder. `--background` works with a file as well: `frameseq studio talk.fsq --background`. On Windows the shortcut also opens `.fsq` files in the Studio when they are double-clicked, and gives them the FrameSeq icon; `--remove` undoes that too.

The shortcut runs the FrameSeq that made it, usually a global install, so run `frameseq shortcut` again after moving or reinstalling FrameSeq. `frameseq shortcut --remove` takes it away.

## Current slide

Below the slides, **Current slide** lists the objects on the slide the preview shows, grouped by the region they were written in: the main area, the left and right columns, a grid's cells, or a named region. Each row shows what the object says, or what it is, with a tag for its kind or its text style, such as *Lead* or *Caption*; hover over it for the line that wrote it.

Select an object, by clicking its row, clicking it in the preview, or putting the editor's cursor in its command, and its settings open below its row, as a drawing program's format pane does; click the row again to fold them away, and once more to open them:

- **Content**: the words of a text object, the items of a list, the Typst, LaTeX, or TeX source of a formula, an image's file, a shape's kind and label. Source written over lines in a template is shown without the indent it has in the code, which it keeps when written back. A long formula or text wraps in its box, and the box can be dragged taller by its corner. Edit it and press `Enter`, or leave the box; text that runs over lines takes `Enter` as a line break and `Ctrl+Enter` to finish. Words with a backslash in a formula, such as `$\frac{1}{2}$`, are written as `` text`...` ``, which keeps the backslashes as typed.
- **Text**: the style (body text, heading, lead, caption, quote, and the others), font size, bold, colour, and alignment.
- **Appearance**: background, fill, outline, corners, and opacity; a shape's colour scheme is one click on a colour.
- **Size** and **Position**: width and height, and on a canvas X and Y.
- **More settings** adds one that is not shown, such as line height or rotation; **Go to code** puts the cursor on the command; **Duplicate** (or `Ctrl+D` on the selected row) writes a copy after the object, with a name of its own if it has one and, when it is placed by coordinates, a step aside so both can be seen; and **Delete** (or the `Delete` key on the selected row) removes an object that is a statement of its own as deleting it in the preview does: with the comments above it and any connector that ends at it, and not while another object is placed by its name.

A box shows the value written in the code, or *Auto* or *Default* when none is. Typing a value rewrites the one written, or adds the method after the object's last one, so `text("Hi").lead()` becomes `text("Hi").lead().color("#f97316")`; clearing the box takes the call away again. A number steps with `↑` and `↓`, with `Shift` by ten and `Alt` by a tenth, and its name can be dragged left or right; the preview follows each step. A value the code computes, such as `width(size * 2)`, is shown as code and not overwritten: clicking it goes to it.

Every change is one step in the editor's history, so `Ctrl+Z` takes it back. For a slide made in a loop or by a helper function, the panel shows the objects written once in the loop or the helper, and says so.

### Cover details

A cover the theme draws from the presentation's details, as `minimal-academic` and the Beamer themes draw `slide().cover()`, and a poster's header, show words no line on the slide writes: the title, subtitle, author, institute, and date of `presentation({ … })`. On such a slide, Current slide opens with **Cover**, or **Poster header**, which lists all five; typing in one writes it into `presentation()`, on a line of its own when the options have lines of their own, and emptying one takes it away. The cover's words work as objects do on the slide: click one to select it, which selects its option in the code and its row here, [double-click](#typing-on-the-slide) it to type it in place, and `Alt`-click it for its code. A detail the code works out is shown as code.

**Convert to an editable cover**, below the details and in the cover's right-click menu, writes the cover's words on its slide as text: `text("…").hero()`, `.subtitle()`, `.author()`, and captions for the institute and the date. They are then moved, styled, and typed into like any other text, and a [cover master](masters.md)'s placeholders decide where they go. The details stay in `presentation()`, where footers, PDF properties, and the other exports read them.

Drag the divider above **Current slide** to share the rail between it and the slides, or fold it away with the arrow beside its title.

## Speaker notes

Below the preview, **Notes** shows the [speaker notes](presenter.md) of the slide the preview shows, as presenter view and PowerPoint will. Click in them and type: the Studio rewrites the string that holds them, so `slide("Results").notes("…")` or `note("…")` changes as you type, in the quotes it was written with, and notes written as an indented block keep their indentation. A slide without notes gets `.notes("…")` added to its `slide()` call with the first letter typed, and emptying the notes takes the call away again. Each change is an ordinary edit, which `Ctrl+Z` in the code takes back.

Notes that no single string holds are shown but not edited here: several `note()` calls on one slide, notes the code computes, and slides made by a loop or a helper. The title bar says why, and the **</>** button beside it shows the code that writes them. Drag the divider above **Notes** to give them more room, or fold them away with the arrow beside the title or **View › Speaker notes**.

## Editing and saving

**File › Auto-save** is on by default: the Studio saves shortly after you stop typing, and the preview redraws from the saved file. Auto-save only writes text that parses. While a line is half-typed, or a bracket is unbalanced, the save indicator reads **Not saved: syntax error** and the preview keeps showing the last version that worked, instead of flashing a build error between keystrokes. `Ctrl+S` always saves, whatever the text holds.

Turn auto-save off to save only with `Ctrl+S`; the preview then shows the file as last saved.

The editor reads the project the way an editor would, from the nearest `tsconfig.json`, so its completions and errors agree with VS Code and `tsc`. Start typing a command, or a `.` after one, for completions; hover over a name for its documentation; open a call's parentheses for its parameters. A slide file outside any TypeScript project still gets the FrameSeq globals.

A slide number marks the line where each `slide()` call begins. Click it to show that slide. A band beside the source marks the slide the preview is showing.

### Names

The names a document gives with `.as()` and `at()` are strings to TypeScript, so the Studio reads them itself:

- Inside the string of `ref()`, `group()`, a connector's `.from()` or `.to()`, or a placement such as `.rightOf()`, completions offer the names on that slide, and after `"encoder.` the anchor sides. Inside `at()`, they offer the slide's regions: `main`, `left` and `right` on a split slide, the cells of a grid, and the paths already visited.
- **F12** on a name jumps to where it was given: the `.as()` that named the object, or the first `at()` that made the region. In a path, the segment under the cursor decides, so `cell0` in `"cell0/now"` leads to the `cell0` region.
- **F2** renames a name everywhere on its slide in one step: the `.as()` or `at()` that gives it, every reference, and the paths of the regions inside a renamed region.
- Hovering over a name says what it is, where it was given, and how often the slide refers to it.
- A name that refers to nothing on its slide is underlined, with the nearest name it might have meant, and listed under **Names** in Problems. So are two objects given the same name, and `at("left")` on a slide that was never split. A slide that builds names at runtime, or calls helper functions that might, is left unchecked rather than guessed at.

## The editor and the preview follow each other

With **Follow cursor** on, moving the cursor shows the slide that holds it and outlines the object written on that line. The preview keeps its reveal step while the cursor stays inside the same slide.

Objects in the preview are worked on as in PowerPoint, with no mode to turn on first:

- **Click** an object to select it, and **drag** it: one placed with `position({ x, y })` moves. Only the digits change, through the editor, so `Ctrl+Z` puts the object back. The same keys work while the preview has focus: `Ctrl+Z` and `Ctrl+Y` undo and redo in the editor, and `Ctrl+S` saves.
- **Drag across the slide's empty part** to draw a box: the objects wholly inside it are selected, and `Ctrl` or `Shift` adds them to what is selected already.
- The **handles** on a selected object's sides and corners resize it from there: the right and bottom ones change the `width()` and `height()` it states, and the left and top ones its `x` and `y` too, so the opposite side stays put. `Shift` on a corner keeps its proportions. A side shows a handle only where the code states the numbers it changes.
- The **round handle above** an object placed by coordinates turns it about its middle, written as `.rotate(30)`, or rewriting the angle already written; `Shift` turns it by steps of 15°.
- Drag an object in the document flow to change its place among its neighbours; its lines move in the source, comments included. The pointer has to travel a little further before this starts than before a move does, so a click that wobbles never reorders the slide.
- A value the code works out, such as `position({ x: left + 40, y: 120 })`, `width(size * 2)`, or a placement such as `.rightOf("box")`, is never overwritten by a drag. The selected object says what places it, its corner handle is grey, and a drag that tries leaves it where it is and says why, with **Go to code**.
- The padlock among the preview's controls, or **Lock layout** in the slide's right-click menu, locks the layout: objects can still be selected, formatted, and typed into, but not dragged, resized, or nudged with the arrow keys until it is unlocked.
- **Alt-click** an object to put the cursor on the command that drew it.
- Click an object, or `Ctrl`-click several, and press `Delete` or `Backspace` to delete them: their lines leave the source, comments written above them included, along with any connector that ends at one of them. An object that another object is placed against by its name, an object written inside another command, and a region stay, and the preview says why. One `Ctrl+Z` brings everything back.
- `Ctrl`-click several objects written one after another and choose **Bind region** to wrap their lines in a named `at("…").column()` region, so they can be positioned or anchored together.
- Right-click an object to cut, copy, paste, duplicate, or stack it, or for the rest of its [menu](#right-click-menus).

See [Visual Studio Code extension](vscode.md) for the rules that decide which numbers a drag may rewrite.

## Typing on the slide

Double-click an object's words in the preview to type them where they are, as in PowerPoint: a text, an item of a list, a cell of a table, a card's title or its text, a metric, the label of a shape or a box, or one of the [cover details](#cover-details), which are written into `presentation()`. The words show as the slide does, with their bold, italic, and coloured words, and with inline math as `$...$`; the caret lands where you double-clicked.

- `Enter`, `Tab`, or a click elsewhere writes them into the string that holds them, in the quotes it was written with, as one step in the editor's history; `Esc` puts them back as they were.
- `Shift+Enter` starts a new line. In code, which runs over lines, `Enter` does, and `Ctrl+Enter` finishes.
- Select some of the words and press `Ctrl+B` for bold or `Ctrl+I` for italics, or use the bar over the words, which also colours them in the theme's accent or a tone and takes a colour away. They are written with the marks of [bold, italic, and coloured words](content.md#bold-italic-and-coloured-words), such as `**grew**` and `[42%]{red}`, and stars or brackets typed as words stay words. Code is typed as plain text.
- A number in a table's cell stays a number while it reads as one. A shape written without a label, such as `rect()`, takes the words typed on it, as `rect("Cache")`.
- Right-click a table's cell for **Table**, which inserts a row above or below it or a column left or right of it, with empty cells written as the others are, one row to a line when they are, and takes its row or column away. A new row or column is typed into at once.
- **Edit text** in the right-click menu types the object's words the same way, all of them selected.
- Words typed with a formula in them, such as `Area $\frac{1}{2}ab$`, are written as `` text`...` ``, which keeps their backslashes.

Words the code works out, such as `` text(`Hi ${name}`) ``, and words a loop or a helper function writes for several objects at once, are changed in the code: the Studio says so, with **Go to code**. A formula, a picture, a chart, a QR code, and an icon open their settings in **Current slide** instead, where a LaTeX formula is set as it is typed.

## Inserting content

**Insert**, in the menu bar and at the top of the preview, puts objects on the slide in the preview, as a word processor and a drawing program do. Its gallery has two sides. **Content**, on the left, is named:

| Group | Items | Writes |
| --- | --- | --- |
| Text | Text, Bulleted list, Numbered steps, Quote, Code | `text()`, `bullets()`, `steps()`, `text().quote()`, `code()` |
| Formulas | LaTeX formula, Typst formula, LaTeX table | `` math`...` ``, `` typst`...` ``, `` latex`...` `` with a booktabs `tabular` |
| Pictures and data | Picture, Table, Chart, QR code, Icon | `image()`, `table()`, `chart()`, `qr()`, `icon()` |

On a slide that flows, which is every layout but a canvas, the object is written **after the selected object**: the one chosen in the preview or in **Current slide**, or the statement holding the editor's cursor; with nothing selected, after the slide's last line. It lands in the same region as that object. On a canvas, where nothing flows, it is drawn like a shape instead: drag out its width, or click to place it at its usual size.

The new object arrives with sample words, in the Studio's language, selected so that typing replaces them. Text, a list, steps, a quote, code, and a table are [typed on the slide](#typing-on-the-slide) itself, from a list's first item or a table's first heading. A formula, a picture, a chart, a QR code, and an icon open their settings in **Current slide** instead, with the formula's source or the picture's description selected; with that panel folded, the editor selects them. A LaTeX formula is set by KaTeX as you type; a Typst formula and a LaTeX table are compiled by Typst and Tectonic, which the [FrameSeq app](app.md) includes.

**Picture** asks for a picture with this computer's own dialog, or for its path when there is none, and copies it into an `images` folder beside the presentation, unless it is there already, so the slides carry it wherever the folder goes. It is written as `image(new URL("./images/photo.png", import.meta.url).href, "Picture")`; the second string describes it for people who cannot see it. A web address is written as it is.

**Icon** opens a picker of the whole icon set, searched by name, such as `chart`, `user`, or `arrow`; `Enter` takes the first match. The icon chosen is written as `icon("rocket")`.

In **Current slide**, a picture's file and an icon's name have a **Choose…** button beside them, which picks another picture or icon in the same way.

The same content is a snippet in the editor. At the start of a line, type the command it writes, such as `typst`, `table`, or `chart`, and pick the entry marked ◇: the whole object is written, with its sample words selected and ready to be typed over. Writing code and inserting from the gallery give the same source.

## Drawing objects

The right side of **Insert**'s gallery draws objects onto the slide in the preview, as a drawing program does: a text box, a line, an arrow, a connector, a polygon, and every [shape](shapes.md).

- Pick a shape or a text box, then drag across the slide to draw it, or click to place one at its usual size. `Shift` keeps a shape square; a circle always is.
- Pick a line or an arrow, then drag from where it starts to where it ends. `Shift` holds it to steps of 45°.
- Pick a connector, then drag from one object to another. An object without a name gets one, written as `.as("shape1")` at the end of its command, and the connector is written after the later of the two as `line().from("shape1").to("box1").arrow()`, so it follows them wherever they move.
- Pick a polygon, then click on the slide for each of its corners. A double-click, `Enter`, or a click on the first corner finishes it, and it is written as `polygon([[0, 0], [120, 0], [120, 90]]).position({ x, y })`, its corners counted from its top-left. `Backspace` takes back the last corner, and `Shift` holds an edge to steps of 45°.
- `Esc` puts the tool down without writing anything.

The object is written at the end of the slide's code, in the slide's first region, with the coordinates and size you drew. A shape or a text box arrives with its placeholder text selected on the slide, ready to be typed over, and can be dragged and resized at once. Each drawing is one step in the editor's history.

A slide made by a loop or a helper function has no lines of its own to write into, so nothing can be drawn onto it.

## Arranging slides

The slide rail edits the document by the statements that make slides. A slide's lines run from its `slide()` statement, with the comments written just above it, to where the next slide's lines begin, so its content and the blank lines after it travel with it.

- **Click** a thumbnail to show the slide and move the editor to the code that made it.
- **Drag** a thumbnail up or down to move the slide.
- **Right-click** for **New slide after…**, **Duplicate**, **Move up**, **Move down**, **Go to source**, **Present from here**, **Edit the master**, and **Delete**. `Delete` also works on the selected thumbnail.
- **+** above the rail adds a slide after the one in the preview, from a layout you pick: title and text, title and points, a section title, two columns, three numbers, code and notes, a formula, a table, a chart, a flow diagram, steps revealed one by one, or a closing line. The slide comes in with its title, or its main line, selected for typing. **Slide › New slide after this one** lists the same layouts.

The layouts are the slides of the [recipes](recipes.md), with placeholders in the Studio's language, and each passes the layout check as it comes in.

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

## Slide masters

**View › Slide master** shows the presentation's [master pages](masters.md) in the rail and the preview in place of the slides, under a bar that says so and closes the view. A master page is edited the way a slide is: drag and resize its objects, set them in **Current master**, and add pictures, shapes, and text from **Insert**. **Insert › Placeholders** draws the boxes the slides' own title, subtitle, author, and content go into; a placeholder's settings are the type its text takes on every slide.

The rail's **+** adds the cover master, the content master, or a master named as you like, written after `presentation()`. Each starts where the theme already puts things, so the slides look the same until it is changed. **Slide › Delete** and the rail's right-click menu delete a master, and **Present** leaves the view and shows the slides.

With the slides showing, **Slide › Master** picks the master the slide in the preview is drawn on: its usual one, another by name, or none, written as the slide's `.master()`. **Edit the master**, there and in the rail's right-click menu, opens the master view on the slide's master.

## Page setup

**File › Page setup…** sets the size of every slide, as PowerPoint's slide size does, and writes it into `presentation()`:

- **Widescreen 16:9** and **Standard 4:3** are for the screen: nothing for 16:9, and `ratio: "4:3"`.
- A sheet of paper, from A0 to A5, Letter, Legal, or Tabloid, stands upright or on its side: `size: "A4", orientation: "landscape"`.
- **Custom size** takes a width and a height: in canvas units for the screen, as `width: 1920, height: 1080`, or in millimetres, centimetres, or inches for paper, as `size: "900x1200mm"`.

The slides are laid out on a canvas of their own units: 1280 across a slide for the screen, and 1600 across a sheet's short side. **Scale the content with the page**, on at first, keeps the canvas as many units across as it is, written as `width: 1280`, so every object and every size of type keeps its size against the new page, as PowerPoint scales a slide's content. Without it, the new page takes its own canvas, and the objects keep their units. The line under the choices gives the canvas, and for paper its printed size, before anything changes; the change is one step that `Ctrl+Z` takes back.

A [poster](posters.md) offers paper only. For a [figure](posters.md#figures-for-a-paper), the dialog sets its canvas in units and the width it prints at: 170 mm across a page, 85 mm in one column, or a width of its own. Every slide of a presentation has the same size, as in PowerPoint, and the exports keep it.

## Problems

The Problems panel collects six kinds of finding, refreshed as you work:

- **TypeScript**: the same errors the editor underlines.
- **Names**: names that refer to nothing on their slide, names given twice, and layout regions the slide does not have; see [Names](#names).
- **Formulas**: a formula in a quoted string whose backslashes became escapes, which TypeScript accepts: in `text("$\frac{1}{2}$")` the `\f` is a form feed, and `\alpha` reads as `alpha`. The button beside it writes the string as `` text`...` ``, which keeps backslashes as written, or, where a template cannot go, as in a list's items, doubles them.
- **Layout**: the rules of [`frameseq check`](layout-checks.md), measured against the live slides after every save rather than on demand: canvas overflow, clipped text, small type, empty slides and regions, similar region names, and modifiers that have no effect.
- **Build**: errors the server reported while compiling the slides, such as a Typst or LaTeX fragment that does not compile.
- **Preview**: an error thrown while the slides ran, with the line of the statement it stopped in, which the editor underlines. The preview keeps showing the last version that ran until the error is fixed.

Click a finding to go to it: TypeScript, name, and formula findings select the text, preview errors put the cursor on the statement that failed, and layout findings show their slide, outline the object, and put the cursor on the line that wrote it.

## Changes made elsewhere

The Studio watches the slide document. When it changes on disk, for example because a coding agent or another editor wrote it, and the Studio has no unsaved edits, the new text is loaded at once and `Ctrl+Z` can still take it back. If you do have unsaved edits, a banner asks which version to keep: **Use the file on disk** or **Keep my version**. Nothing is overwritten without that choice.

## Presenting and exporting

**Present** (`F5`) shows the slides full screen from the current slide, in the Studio's own window, as PowerPoint does; **Present › From the beginning** (`Shift+F5`) starts at the first slide. `F5` works from the preview and the slide rail too. A click, `→`, `↓`, `Space`, `Enter`, or `Page Down` moves on, including through a slide's reveal steps; `←`, `↑`, `Backspace`, or `Page Up` goes back; `Home` and `End` go to the first and last slide. After the last slide the screen goes black, as in PowerPoint, and one more click or key ends the show; `Esc` ends it at any time. The Studio comes back on the slide the show ended on. Where the browser refuses full screen, the show still fills the window.

On a computer with a second screen, such as a laptop with a projector, the show works as PowerPoint's does with presenter view: the slides fill the other screen, and [presenter view](presenter.md), with the notes, the next slide, and a timer, opens on the screen the Studio is on. With more than two screens, the slides go to an external one first, or to the one chosen in **Present › Show screen**. Presenter view moves the show on with the same keys and the same remote, and `Esc` or **End show** there ends the show, as `Esc` on the slides does; presenter view closes with it. Presenter view fills its screen as a maximized window does, and its **Full screen** button covers the taskbar too.

- In the [FrameSeq app](app.md), the window takes the slides to the other screen by itself and comes back when the show ends.
- In Chrome or Edge, the first show on two screens says what it will do, and the browser then asks once whether the Studio may place windows on your screens. **This screen only** presents in the window instead. If the browser is not allowed to, the slides fill the window as on one screen. Other browsers present on one screen.
- **Present › Show screen** lists the screens by where they are from the Studio's, with their size, such as *on the right · 1920 × 1080*, and the name a browser or macOS gives them. The slides go to the chosen one, and presenter view stays on the Studio's screen, or goes to another when the slides take that one. **Automatic**, the first choice, picks as above. A chosen screen that is not connected leaves the choice to **Automatic** until it is again. In a browser, **Find the other screens…** asks for the permission the list needs.
- **Present › Use presenter view**, on at first, turns presenter view off: the slides then fill the screen chosen in **Show screen**, or with **Automatic**, the Studio's own screen even when there is another.

**Present › Presenter view in a new window** opens presenter view by itself, for rehearsing or to place where you like; it follows the show and the preview, and they follow it.

**Present › Phone remote…** lets a phone on the same Wi-Fi step through the show, as [`npm run present`](presenter.md#pair-a-phone-remote) does in a browser. The first time, the Studio asks, starts again on the local network, and then shows a QR code for the phone to scan. The phone moves through the slides and their reveal steps, its laser shows on the screen, and its **Presenter view** shows the notes. While the remote is on, other devices on the network can open the slides and the files they import, and nothing else: only this computer can change the slides, open files, or use the terminal and the assistant. The remote stays on until the Studio stops; `frameseq studio --remote` starts with it on. The operating system may ask whether Node.js may accept connections on private networks.

**File › Export** runs the same exports as the CLI and writes to the same places:

| Export | Writes |
| --- | --- |
| PDF | `output/pdf/<name>.pdf` |
| PowerPoint, editable | `output/pptx/<name>.pptx` |
| PowerPoint, one image per slide | `output/pptx/<name>.pptx` |
| Single HTML file | `dist/index.html` |
| HTML site | `dist/` |
| Typst source | `output/typst/<name>.typ` |

PDF, both PowerPoints, and Typst first ask which slides to export: all of them, the current slide, or slides typed by number, such as `1-3, 5`. Some of the slides go to a file named for them, such as `output/pdf/<name>-slides-1-3,5.pdf`, beside the export of them all, as [`--slides`](cli.md#export-some-of-the-slides) does. HTML always has every slide.

The paths are relative to the directory the Studio was started from, or to the folder of a presentation opened from the Studio. The document is saved before an export starts. When it finishes, the notice offers **Download** and **Show in folder**; the full log is in the **Output** tab.

## The terminal

The **Terminal** tab of the bottom panel is a shell in the presentation's folder, for `git`, `npm`, a coding agent, or anything else run beside the slides. It is PowerShell on Windows, PowerShell 7 when it is installed, and your own shell on macOS and Linux. In the FrameSeq app, the app's own `frameseq` command comes first on its PATH, so `frameseq pdf talk.slides.ts` works there with nothing else installed.

- `` Ctrl+` `` shows the terminal, focuses it when it is already showing, and folds the panel away when it has the focus. It is `` Ctrl+` `` on macOS too.
- Every key goes to the shell except `` Ctrl+` ``, `Ctrl+J`, and `Ctrl+Alt+I`, so `Ctrl+C` interrupts a program and `Alt` reaches the shell, not the menus. Outside macOS, `Ctrl+C` copies instead when text is selected, `Ctrl+Shift+C` always copies, and `Ctrl+V` pastes.
- Links the shell prints open in the default browser.
- The shell outlives a reload of the window, as when the language changes, and the terminal picks it up with what it printed last. It ends when the Studio stops or opens another presentation. The bin button at the panel's right end ends it at once; any key then starts a new one.

A shell runs whatever is typed into it, so the terminal opens only in the Studio's own window on the computer running the Studio, even when the Studio was started with `--host`.

## The assistant

**Assistant** in the top bar, **View › Assistant**, or `Ctrl+Alt+I` opens a conversation with Claude Code or Codex beside the preview. Ask for a change in your own words, such as *make this slide two columns, with the chart on the right*, and the agent edits the slide document itself:

1. The Studio saves the editor's text and sends the request with where you are: the slide in the preview with its lines, the lines you selected, and the problems in the list. Clear **Include** to send the request alone.
2. The agent reads the document and edits it, using [`frameseq mcp`](cli.md#serve-the-slides-to-a-coding-agent), which the Studio gives it, to check the slides and look at them. The panel shows each step as it happens.
3. Each edit reloads into the editor, and the preview shows it at once. While the agent works, the editor takes no typing, and **Stop** ends the request.
4. When the agent has finished, the editor shows what it changed against the text before the request: the replaced text in red, the new text in green, and **Accept** and **Reject** beside each change. The editor's header, and the panel, count the changes left and offer **Accept all** and **Reject all**; **↑** and **↓** move between changes. A rejected change is put back in the file, and `Ctrl+Z` takes back either choice. Further requests before the review is settled add to the same review.

The conversation continues from one request to the next, so a follow-up such as *a little smaller* knows what it refers to; **+** starts a new one, as switching between Claude Code and Codex does.

To have the agent work from material of your own, attach it to the request: click the paper clip under the box, drop files on the panel, or paste them, a screenshot for example. Attach your notes in Markdown and ask for *slides from these notes*, a PDF to sum up, or a logo for the cover. A request carries at most ten files of up to 32 MB each. The agent reads them where the Studio keeps them, outside the presentation's folder, for as long as the conversation lasts. A picture is also copied into the `images` folder beside the presentation, as **Insert › Picture** does, so that a slide can show it. Claude Code reads text, pictures, and PDFs; Codex reads what its own tools can open.

Under the agent's name, choose the **model**, the **effort**, and **Fast** for the next request; each starts as the agent's own default, and the panel remembers your choice for each agent. Codex lists the models and efforts your account has. Claude Code offers Fable, Opus, Sonnet, and Haiku, and Fast with Opus only; fast answers use more of the plan. At the right, the panel shows how much of the plan is used, such as *5 h 21% · 7 d 6%*, with the reset times on hover. Codex reports it at any time, and Claude Code while it answers, so its figures appear after the first request; click them to refresh.

The assistant uses the agent installed on this computer, on its own sign-in and plan, so the Studio needs no key of its own. Install [Claude Code](https://claude.com/claude-code) or Codex (`npm install -g @openai/codex`), sign in once in a terminal, and the panel finds it. The agent works only in the presentation's folder: Claude Code may read and edit files there, read the files you attach, and use FrameSeq's tools, but not run commands, and Codex runs in its `workspace-write` sandbox. Only the computer running the Studio has the assistant, even with `--host`.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+S` | Save |
| `Ctrl+O` | Open another presentation |
| `Ctrl+Z`, `Ctrl+Y` | Undo and redo, also from the preview and the slide rail |
| `Ctrl+Space` | Show completions |
| `F12` | Go to where the name under the cursor was given |
| `F2` | Rename the name under the cursor on its slide |
| `Ctrl+F` | Find and replace in the editor |
| `Ctrl+PageDown`, `Ctrl+PageUp` | Next and previous slide |
| `F5` | Present from the current slide |
| `Shift+F5` | Present from the beginning |
| `Esc` | End the slide show |
| `Ctrl+B` | Show or hide the slide rail |
| `Ctrl+B`, `Ctrl+I` while typing on the slide | Bold and italics for the selected words |
| `Ctrl+E` | Show or hide the code |
| `Ctrl+J` | Show or hide the bottom panel |
| `` Ctrl+` `` | Show the terminal, focus it, or fold it away |
| `Ctrl+Alt+I` | Show or hide the assistant |
| `Ctrl+C`, `Ctrl+X`, `Ctrl+V` | Copy, cut, and paste objects in the preview |
| `Ctrl+D` | Duplicate the selected objects |
| `Shift+F10` | Open the menu of what is selected |
| `Alt`, `F10` | Move to the menu bar |
| `Alt+F`, `Alt+E`, `Alt+V`, `Alt+S`, `Alt+P`, `Alt+H` | Open a menu |

On macOS, use `⌘` in place of `Ctrl`, except in `` Ctrl+` ``. **Help › Keyboard shortcuts** lists them in the Studio.

## Network access

The Studio writes whole documents, which the plain preview never does: a drag in `frameseq dev` may only rewrite numbers. So the Studio's interface exists only on a server started by `frameseq studio`, answers only the computer it runs on, and refuses requests sent by any other web page. Add `--host` only when the Studio must be reached from outside the machine, as in a container or a browser IDE:

```bash
frameseq studio talk.slides.ts --host
```

Anyone who can reach that address can then edit the slides, though the terminal still opens only on the computer running the Studio. Use `--no-open` to start the server without opening a window, and `--tab` to open a browser tab instead of an app window.
