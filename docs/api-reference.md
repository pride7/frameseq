# API reference

This page lists the complete types and the lower-level object API. For Typst-style entries that combine a definition, minimal example, signature, parameters, and return value, start with the [Function reference](function-guide.md). Lowercase functions belong to the linear document API. Uppercase functions belong to the explicit object API.

## Document

### `presentation(titleOrOptions?)`

```ts
presentation(title?: string): SlidesDefinition
presentation(options?: SlidesOptions): SlidesDefinition
```

Starts a new active presentation. It must be called before `slide()`.

```ts
interface SlidesOptions {
  title?: string;
  subtitle?: string;
  author?: string;
  institute?: string;
  date?: string;
  ratio?: "16:9" | "4:3";
  size?: PaperSize;
  orientation?: "portrait" | "landscape";
  width?: number;
  height?: number;
  background?: string;
  theme?: BuiltInThemeName | ThemeDefinition;
  font?: PresentationFontOptions;
  bibliography?: Bibliography;
  citations?: CitationOptions;
}

type PaperSize =
  | "A0" | "A1" | "A2" | "A3" | "A4" | "A5" | "letter" | "legal" | "tabloid"
  | `${number}x${number}${"mm" | "cm" | "in"}`;

type Bibliography = Record<string, BibliographyEntry | string>;

interface BibliographyEntry {
  type?: string;
  author?: string;
  editor?: string;
  title?: string;
  year?: string;
  journal?: string;
  booktitle?: string;
  publisher?: string;
  url?: string;
  doi?: string;
  [field: string]: string | undefined;
}

interface CitationOptions {
  style?: "numeric" | "author-year";
  footnotes?: boolean;
}

interface FontStyleOptions {
  family?: string;
  size?: Length;
  weight?: number | string;
  lineHeight?: number | string;
}

interface PresentationFontOptions extends FontStyleOptions {
  heading?: FontStyleOptions;
  code?: FontStyleOptions;
}
```

`size` makes the presentation for paper. The canvas then has 1600 units across the paper's short side, unless `width` or `height` sets another number, and the other side follows the paper; exports print at the paper's size, and `pt()` and `mm()` become printed measurements. `orientation` turns a named size; a written size stands as written.

`bibliography` holds the works `cite()` can cite: a `.bib` import, whose entries arrive as `BibliographyEntry` objects, or reference texts by key.

The default theme is `blank`. `background` is a compatibility shortcut that overrides the selected theme's normal and cover backgrounds.

`font` changes presentation-wide typography without defining a complete theme. Its top-level values apply to body text, `heading` applies to cover and slide headings, and `code` applies to code blocks. A local builder modifier such as `.size(30)` takes precedence over these defaults.

### `poster(titleOrOptions?)`

```ts
poster(title?: string): ContentSlideBuilder
poster(options?: SlidesOptions): ContentSlideBuilder
```

Calls `presentation({ size: "A0", theme: "poster", ...options })` and `slide()`, and returns the poster's page.

## Themes

### `defineTheme(options)`

Creates a complete reusable theme from partial tokens:

```ts
const ocean = defineTheme({
  name: "ocean",
  extends: "blank",
  colors: { accent: "#007c91" },
});

presentation({ title: "Ocean", theme: ocean });
```

```ts
interface ThemeOptions {
  name: string;
  extends?: BuiltInThemeName | ThemeDefinition;
  family?: "frameseq" | "beamer";
  coverLayout?: "default" | "center" | "academic-left";
  colors?: Partial<ThemeColors>;
  fonts?: Partial<ThemeFonts>;
  spacing?: Partial<ThemeSpacing>;
  radii?: Partial<ThemeRadii>;
  chrome?: Partial<ThemeChrome>;
  coverBackground?: string;
}

type BuiltInThemeName =
  | "blank"
  | "midnight"
  | "paper"
  | "beamer-default"
  | "beamer-madrid"
  | "beamer-cambridge-us"
  | "minimal-academic";
```

Color tokens:

```ts
interface ThemeColors {
  background: string;
  foreground: string;
  muted: string;
  subtle: string;
  accent: string;
  accentForeground: string;
  surface: string;
  surfaceStrong: string;
  border: string;
  codeBackground: string;
  codeForeground: string;
  error: string;
  stage: string;
  shadow: string;
}
```

Other tokens:

```ts
interface ThemeFonts {
  body: string;
  heading: string;
  mono: string;
}

interface ThemeSpacing {
  slideX: string;
  slideY: string;
  coverX: string;
  coverY: string;
  contentGap: string;
  regionGap: string;
  splitGap: string;
  gridGap: string;
  cardPadding: string;
}

interface ThemeRadii {
  small: string;
  medium: string;
  large: string;
  pill: string;
}

interface ThemeChrome {
  titleBar: boolean;
  titleBarStyle: "solid" | "underline";
  footer: boolean;
  footerLayout: "metadata" | "title";
  slideNumber: boolean;
  showOnCover: boolean;
  autoTitlePage: boolean;
  titleBarHeight: string;
  footerHeight: string;
  titleBarBackground: string;
  titleBarForeground: string;
  footerBackground: string;
  footerForeground: string;
  footerAccentBackground: string;
  footerAccentForeground: string;
  footerBorderColor: string;
}
```

### `themes`

An object containing all seven complete built-in theme definitions. Theme names are usually more concise when selecting or extending a built-in theme; this export is useful when a complete theme object is needed.

### `slide(nameOrOptions?)`

```ts
slide(name?: string): ContentSlideBuilder
slide(options?: SlideOptions): ContentSlideBuilder
```

Starts the next slide and resets the active region.

```ts
interface SlideOptions {
  name?: string;
  title?: string;
  notes?: string;
  allowEmpty?: boolean;
}
```

The string form sets both `name` and `title`. `name` is metadata; `title` is rendered.

### `notes(content)`

```ts
notes(content: string): ContentSlideBuilder
```

Stores private speaker notes on the current slide. Notes are displayed in presenter view, omitted from the audience page and PDF, and preserved as PowerPoint speaker notes in PPTX export.

### `note(content)`

```ts
note(content: string): ContentSlideBuilder
```

Adds speaker notes to the current slide, the linear form of `slide().notes(content)`. It returns the slide, so slide methods still chain. Repeated calls append a line to the existing notes rather than replacing them.

### `allowEmpty(enabled?)`

```ts
allowEmpty(enabled?: boolean): ContentSlideBuilder
```

Marks the current slide as intentionally blank so `frameseq check` does not report `empty-slide`. Prefer adding visible content unless the blank page is part of the presentation's pacing.

### `master(name)`

```ts
master(name: string): MasterBuilder
```

Starts a master page. The content commands after it, until the next `slide()` or `master()`, add objects to the master, which is drawn behind every slide that uses it: `"cover"` behind covers, `"content"` behind every other slide, and any other name behind the slides that choose it with `.master(name)`. `MasterBuilder` is a container builder; `.background()` paints the page of every slide drawn on it. A name may be used once per presentation. Text on a master may hold the fields `{title}`, `{subtitle}`, `{author}`, `{institute}`, `{date}`, `{page}`, `{total}`, and `{slide}`. Masters are kept on the presentation as `SlidesRootDefinition.masters`, never among `slides`. See [Masters and templates](masters.md).

### `placeholder(role?)`

```ts
type PlaceholderRole = "body" | "title" | "subtitle" | "author";
placeholder(role?: PlaceholderRole): ElementBuilder
```

On a master page, marks the box a slide's own content goes into: everything it holds for `"body"`, the default; its title, or a cover's hero text, for `"title"`; a cover's subtitle or author for the others. Its position and size give the box; its text settings style that text where the slide sets none; `justify()` places the text in the box. A master has at most one placeholder of each role.

### `master(name)` on a slide

```ts
master(name: string | false): ContentSlideBuilder
```

Draws the slide on the master of that name, or on none with `false`. A name the presentation does not define is reported once the document has run, with the slide that asked for it.

## Content

### `text(content)`

```ts
text(content: string): TextBoxBuilder
text(strings: TemplateStringsArray, ...values: unknown[]): TextBoxBuilder
```

Adds text to the current region. `$...$` inside the content renders inline math. The tagged-template form preserves backslashes.

Text roles:

```ts
text("...").body()
text("...").title()
text("...").hero()
text("...").subtitle()
text("...").author()
text("...").eyebrow()
text("...").lead()
text("...").caption()
text("...").quote()
```

### `spacer(size?)`

```ts
spacer(size?: number): ElementBuilder
```

Adds empty space that takes the room left over in the current region, pushing what follows it to the far end. `size` is the share relative to other spacers in the same region and defaults to `1`. It only has an effect inside a `row()`, `column()`, or grid.

### `image(src, alt?)`

```ts
image(src: string, alt?: string): ElementBuilder
```

Adds an image to the current region.

### `code(content, language?)`

```ts
code(content: string, language?: string): ElementBuilder
```

Adds preformatted code. The default language is `"ts"`.

### `math(content)`

```ts
math(content: string): ElementBuilder
math(strings: TemplateStringsArray, ...values: unknown[]): ElementBuilder
```

Adds a display equation. Prefer the tagged-template form for LaTeX-style input.

### `typst(content)`

```ts
typst(content: string): ElementBuilder
typst(strings: TemplateStringsArray): ElementBuilder
```

Adds a static Typst fragment to the current region. The Vite build compiles the fragment to inline SVG. JavaScript interpolation inside the tagged template is not currently supported. Install the optional `@myriaddreamin/typst-ts-node-compiler` package before using this command.

### `typstFile(path)`

```ts
typstFile(path: string): ElementBuilder
```

Adds a Typst fragment from a static path relative to the slide document. The file must stay inside the slide document directory. Vite watches it for changes during development.

### `latex(content)`

```ts
latex(content: string): ElementBuilder
latex(strings: TemplateStringsArray): ElementBuilder
```

Adds a static LaTeX body fragment to the current region. The Vite build uses the optional `node-tectonic` compiler and embeds the typeset result and its fonts. JavaScript interpolation is not supported. Complete documents with `\documentclass` or `\begin{document}` are rejected.

### `latexFile(path)`

```ts
latexFile(path: string): ElementBuilder
```

Adds a LaTeX body fragment from a static path relative to the slide document. The file must stay inside that directory and is watched by Vite. Install `node-tectonic` before using either LaTeX command.

### `rect(label?)`

```ts
rect(label?: string): ShapeBuilder
```

Adds a rectangular diagram node. The optional label supports inline math and is centered by default.

### `circle(label?)`

```ts
circle(label?: string): ShapeBuilder
```

Adds a circular diagram node. Set its width to change the diameter while preserving the default square aspect ratio.

### `shape(kind, label?)`

```ts
type ShapeKind =
  | "rect" | "rounded" | "pill" | "ellipse" | "circle"
  | "diamond" | "triangle" | "pentagon" | "hexagon" | "octagon"
  | "parallelogram" | "trapezoid" | "star" | "plus"
  | "cylinder" | "document" | "note" | "cube" | "cloud" | "callout"
  | "chevron" | "step"
  | "arrow-right" | "arrow-left" | "arrow-up" | "arrow-down" | "arrow-both";

shape(kind: ShapeKind, label?: string): ShapeBuilder
```

Adds a diagram shape drawn as a vector outline, with the label set in the outline's own room: the middle of a diamond, below a cylinder's top. Each kind has a usual size, from 120 x 120 for `plus` to 240 x 120 for `callout`, which `width()` and `height()` replace. A `circle` given only a width keeps its height equal to it. Each kind exports to PowerPoint as its native preset shape and to Typst as an editable polygon or curve. Without `tone()` a shape is a soft tint of the theme's accent.

### `polygon(points, label?)`

```ts
type PolygonPoints = Array<[number, number]>;

polygon(points: PolygonPoints, label?: string): ShapeBuilder
```

Adds a diagram shape drawn through its own corners, given as `[x, y]` pixels from any origin in order around the outline. Its size is the box the corners span, which `width()` and `height()` stretch; it needs at least three corners that span some width and some height. Its label is centred in that box and supports inline math. It takes every `ShapeBuilder` modifier, exports to PowerPoint as an editable freeform through the same corners, and to Typst as a `polygon`.

### `junction(sign?)`

```ts
junction(sign?: string): ShapeBuilder
```

Adds the point where connectors meet or split: a 10-pixel dot in `var(--frameseq-muted)`, the colour connectors are drawn in by the style the guide recommends. With a sign, such as `"+"` or `"×"`, it is the small round operator where streams are added or multiplied instead: a 32-pixel circle in the background colour, outlined in the same colour, with the sign in its middle. It is a `circle()` underneath, so `fill()`, `stroke()`, `width()`, and placement by name work on it.

### `line(points)`

```ts
interface LinePoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

line(points?: Partial<LinePoints>): LineBuilder
```

Adds an SVG line whose coordinates are numeric pixels relative to the current canvas region. Lines are intended for slides using `canvas()`. Omit the points when both ends are attached with `from()` and `to()`.

### `bullets(...items)`

```ts
bullets(...items: string[]): ElementBuilder
```

Adds a static unordered list.

### `steps(...items)`

```ts
steps(...items: string[]): ElementBuilder
```

Adds a numbered list revealed one item at a time.

### `metric(value, label)`

```ts
metric(value: string, label: string): GroupBuilder
```

Adds a large value and smaller label to the current region and returns the metric object. The returned object can be styled or passed directly to `gridSection()`.

### `table(rows)`

```ts
table(rows: Array<Array<string | number>>): TableBuilder

class TableBuilder extends ElementBuilder {
  header(rows?: number): this                       // 1 by default; 0 for no heading
  columnAlign(...alignments: Array<"left" | "center" | "right">): this
  striped(enabled?: boolean): this
}
```

Adds a table whose first row is the heading. A column whose body cells are all quantities aligns right unless `columnAlign()` says otherwise.

### `chart(kind, data)`

```ts
chart(kind: "bar" | "hbar" | "line" | "pie" | "donut", data: ChartData): ChartBuilder

type ChartData =
  | Record<string, number>
  | { labels: string[]; series: Record<string, number[]> };

class ChartBuilder extends ElementBuilder {
  colors(...colors: string[]): this
  unit(suffix: string): this
  values(show?: boolean): this
  legend(show?: boolean): this
  max(value: number): this
}
```

Adds a chart. Data is checked where it is written: every series needs one finite number per label, and a pie or donut takes a single series without negative values. `chartSvg(spec, frame)` draws the same chart as SVG for tools that consume the node tree.

### `qr(text)`

```ts
qr(text: string): ElementBuilder
```

Adds a QR code for the text, 200 pixels square by default.

### `icon(name)`

```ts
icon(name: IconName): ElementBuilder
```

Adds an icon from the Lucide set. `IconName` is the union of every icon name, exported for helper functions that take one.

### `cite(...keys)`, `footnote(content)`, and `references(options?)`

```ts
cite(...keys: string[]): string
footnote(content: string): string
references(options?: { all?: boolean }): GroupBuilder
```

`cite()` returns the citation marker and lists the cited works at the foot of the current slide; `footnote()` returns a superscript marker and adds the note there; `references()` adds the full list once the document has run. `formatReference(entry)` writes an entry as these lists do.

### `card(title, content?)`

```ts
card(title: string, content?: string): GroupBuilder
```

Adds a semantic title-and-copy card to the current flow.

### `group(...items)`

```ts
group(...items: Array<ElementBuilder | string>): GroupBuilder
```

Combines adjacent content objects into one vertical object. Chain `.card()` when the group should receive the standard card surface.

### `gridSection(columns, ...items)`

```ts
type GridColumns = number | string;
gridSection(columns: GridColumns, ...items: Array<ElementBuilder | string>): GridSectionBuilder
```

Places a local grid in the current document flow. Every supplied object becomes one grid cell. Numeric columns accept integers from 1 through 12; a CSS grid-template string such as `"1fr 2fr"` creates unequal columns. Use `.gap(value)` to change spacing or `.columns(value)` to replace the template.

### `ref(name)`

```ts
ref(name: string): ElementBuilder
```

Selects an object or region on the current slide by the name given to it with `.as()` or `at()`. The returned builder matches the object: `ShapeBuilder` for `rect()` and `circle()`, `LineBuilder` for `line()`, `RegionBuilder` for containers, and `ElementBuilder` for everything else. `group()` and `gridSection()` accept the same names directly, so regrouping needs no local variables.

## Region selection

### `main()`

Selects the slide's primary region.

### `left()` / `right()`

Selects a split region. The slide must already use `split()`.

### `cell(index)`

```ts
cell(index: number): RegionBuilder
```

Selects a zero-based grid cell. The slide must already use `grid()`.

### `at(path)`

```ts
at(path: string): RegionBuilder
```

Selects the region addressed by a `/` separated path and creates the containers it names. The first segment may be `main`, `left`, `right`, or `cell<n>`; every other segment is created on first use. An empty path is the same as `main()`. Revisiting a path selects the same region, paths are scoped to the current slide, and each path is registered as an anchor name.

### `gap(rows, columns?)`

```ts
gap(rows: Length, columns?: Length): RegionBuilder
```

Sets the child gap on the active region. One value covers both axes; a second value spaces the columns separately from the rows.

## Slide layouts

These methods are chained from the object returned by `slide()`.

```ts
slide("Title").split("40:60")
slide("Title").grid(3, 20)
slide({ name: "Quote" }).center()
slide({ name: "Photo" }).fullBleed(src, alt)
slide({ name: "Canvas" }).canvas()
```

### `cover()`

Applies the cover layout to the current slide.

### `split(ratio?)`

```ts
type SplitRatio = `${number}:${number}` | number | [number, number];
```

Creates left and right regions. The default is `"1:1"`.

### `grid(columns, gap?)`

Creates 1–12 equal-width regions.

This method controls the whole slide body. Use `gridSection()` when only one portion of the slide should form a grid.

### `center()`

Centers the normal content region.

### `fullBleed(src, alt?)`

Adds an image and applies the full-bleed image layout.

### `canvas()`

Switches the slide body to freeform placement, so objects position themselves with `.position({ x, y })`. Detached objects created with the [explicit object API](advanced.md) reach the slide through `custom(...elements)`.

## Element modifiers

All content builders inherit these methods:

```ts
style(classes: string): this
style(properties: Record<string, string | number>): this
width(value: Length): this
height(value: Length): this
minWidth(value: Length): this
minHeight(value: Length): this
maxWidth(value: Length): this
maxHeight(value: Length): this
padding(value: Length, horizontal?: Length): this
padding(sides: { top?: Length; right?: Length; bottom?: Length; left?: Length }): this
margin(value: Length, horizontal?: Length): this
margin(sides: { top?: Length; right?: Length; bottom?: Length; left?: Length }): this
gap(rows: Length, columns?: Length): this
background(value: string): this
color(value: string): this
border(value: string): this
radius(value: Length): this
fontSize(value: Length): this
size(value: Length): this
fontWeight(value: number | string): this
weight(value: number | string): this
bold(): this
lineHeight(value: number | string): this
textAlign(value: "left" | "center" | "right"): this
selfAlign(value: "start" | "center" | "end" | "stretch"): this
centerSelf(): this
align(value: "start" | "center" | "end" | "stretch"): this
justify(value: "start" | "center" | "end" | "space-between" | "space-around" | "space-evenly"): this
alignContent(value: "start" | "center" | "end" | "stretch" | "space-between" | "space-around" | "space-evenly"): this
grow(value?: number): this
wrap(enabled?: boolean): this
opacity(value: number): this
clip(enabled?: boolean): this
position(position: { x?: Length; y?: Length }): this
as(name: string): this
rightOf(target: string, gap?: number): this
leftOf(target: string, gap?: number): this
above(target: string, gap?: number): this
below(target: string, gap?: number): this
centerOn(target: string): this
alignTop(target: string): this
alignLeft(target: string): this
anchor(position: AnchorSide, margin?: number): this
fit(minimum?: number): this
rotate(degrees: number): this
showAt(step: number): this
className(value: string): this
```

The string overload appends zero-configuration Tailwind CSS utility classes. The object overload applies inline CSS properties and therefore takes precedence over utility classes.

Container builders also provide:

```ts
add(...children: ElementBuilder[]): this
row(): this
column(): this
stack(): this
grid(columns: GridColumns, gap?: Length): this
canvas(): this
center(): this
```

Rectangle, circle, and shape builders additionally provide:

```ts
type ToneName =
  | "accent" | "blue" | "sky" | "teal" | "green" | "lime" | "amber"
  | "orange" | "red" | "pink" | "purple" | "indigo" | "gray";

fill(value: string): this
stroke(value: string): this
strokeWidth(value: Length): this
tone(color: ToneName | string, style?: "soft" | "solid" | "outline"): this
shadow(enabled?: boolean): this
dashed(enabled?: boolean): this
```

`tone()` paints the fill, the outline, and the label from one colour, worked out against the theme so that a dark theme gets darker tints and lighter labels: `"soft"` (the default) is a tint with a darker label, `"solid"` fills with the colour itself, and `"outline"` draws the colour around the slide's background. `fill()`, `stroke()`, and `color()` still decide the parts they name. A shape's `radius()` rounds a `rect` or `rounded` outline.

Line builders provide:

```ts
type AnchorSide =
  | "center" | "top" | "bottom" | "left" | "right"
  | "top-left" | "top-right" | "bottom-left" | "bottom-right";

stroke(value: string): this
strokeWidth(value: Length): this
arrow(value?: "none" | "start" | "end" | "both"): this
from(reference: string, offset?: { dx?: number; dy?: number }): this
to(reference: string, offset?: { dx?: number; dy?: number }): this
via(...points: Array<string | [number, number]>): this
route(value: "straight" | "elbow" | "curve"): this
label(text: string): this
dashed(enabled?: boolean): this
```

Calling `arrow()` without an argument adds an end arrow. A line has no arrow by default.

`route("elbow")` draws the connector at right angles, leaving and entering its objects square to their sides and keeping clear of the other objects on its canvas; `route("curve")` draws a smooth curve that leaves and enters square. `label()` writes a short text halfway along the connector, on the slide's background so the line stops behind it.

`from()` and `to()` take the name given to an object by `as()`, optionally followed by an anchor: `"encoder"` or `"encoder.top-right"`. Without an anchor FrameSeq uses the edges that face the other end of the connector.

`via()` runs the connector through stops on its way, in order: names, passed at the object's centre or at the anchor given, such as `"split"` or `"block.right"`, or `[x, y]` coordinates in the connector's canvas. A straight connector then runs from each stop to the next, and an elbow turns at right angles between them; each end faces its nearest stop. A curve with stops is reported as an error.

`as()`, the placement modifiers, and connector anchors are resolved by `resolveAnchors(root)` before rendering. `mountSlides()` calls it, so linear documents need nothing further; the function is exported for tools that consume the node tree directly. Names are scoped to a slide, may be referenced before they are defined, and require both objects to share a coordinate system — the same `canvas()`, or a container positioned with `position()`.

## Unit helpers

```ts
px(value: number): string
pt(value: number): string
mm(value: number): string
rem(value: number): string
percent(value: number): string
vw(value: number): string
vh(value: number): string
```

Plain numeric lengths are interpreted as pixels. On a presentation made for paper, `pt`, `mm`, `cm`, and `in` lengths are printed sizes, converted to canvas pixels by `resolvePrintUnits(root)`, which the runtime calls once the document has run.

## Internal interfaces

`getActivePresentation()` and `FrameSeqNode` are exported for the compiler and renderer. They are not part of the recommended authoring surface and may change as the compiler evolves.
