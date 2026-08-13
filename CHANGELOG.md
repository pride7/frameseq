# Changelog

All notable changes to FrameSeq are recorded here. The project follows [Semantic Versioning](https://semver.org/).

## Unreleased

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
