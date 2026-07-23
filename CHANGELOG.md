# Changelog

All notable changes to FrameSeq are recorded here. The project follows [Semantic Versioning](https://semver.org/).

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
