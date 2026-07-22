# Changelog

All notable changes to FrameSeq are recorded here. The project follows [Semantic Versioning](https://semver.org/).

## Unreleased

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
