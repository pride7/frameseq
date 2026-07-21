# API reference

This page describes the supported FrameSeq authoring API. Lowercase functions belong to the linear document API. Uppercase functions belong to the explicit object API.

## Document

### `presentation(titleOrOptions?)`

```ts
presentation(title?: string): SlidesDefinition
presentation(options?: DeckOptions): SlidesDefinition
```

Starts a new active presentation. It must be called before `slide()`.

```ts
interface DeckOptions {
  title?: string;
  subtitle?: string;
  author?: string;
  institute?: string;
  date?: string;
  ratio?: "16:9" | "4:3";
  width?: number;
  height?: number;
  background?: string;
  theme?: BuiltInThemeName | ThemeDefinition;
  font?: PresentationFontOptions;
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

The default theme is `blank`. `background` is a compatibility shortcut that overrides the selected theme's normal and cover backgrounds.

`font` changes presentation-wide typography without defining a complete theme. Its top-level values apply to body text, `heading` applies to cover and slide headings, and `code` applies to code blocks. A local builder modifier such as `.size(30)` takes precedence over these defaults.

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
}
```

The string form sets both `name` and `title`. `name` is metadata; `title` is rendered.

### `notes(content)`

```ts
notes(content: string): ContentSlideBuilder
```

Stores private speaker notes on the current slide. Notes are displayed only in presenter view and are omitted from the audience page and PDF output.

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

### `line(points)`

```ts
interface LinePoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

line(points: LinePoints): LineBuilder
```

Adds an SVG line whose coordinates are numeric pixels relative to the current canvas region. Lines are intended for slides using `canvas()`.

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
metric(value: string, label: string): RegionBuilder
```

Adds a large value and smaller label to the current region.

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

### `gap(value)`

```ts
gap(value: Length): RegionBuilder
```

Sets the child gap on the active region.

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

### `center()`

Centers the normal content region.

### `fullBleed(src, alt?)`

Adds an image and applies the full-bleed image layout.

### `canvas()` / `place(element, bounds)`

Enables freeform placement. `place()` accepts:

```ts
interface PlaceBounds {
  x: Length;
  y: Length;
  width?: Length;
  height?: Length;
}
```

Creating unattached elements requires the [explicit object API](advanced.md).

## Element modifiers

All content builders inherit these methods:

```ts
style(classes: string): this
style(properties: Record<string, string | number>): this
width(value: Length): this
height(value: Length): this
minWidth(value: Length): this
minHeight(value: Length): this
padding(value: Length, horizontal?: Length): this
margin(value: Length, horizontal?: Length): this
gap(value: Length): this
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
align(value: "start" | "center" | "end" | "stretch"): this
justify(value: "start" | "center" | "end" | "space-between" | "space-around"): this
grow(value?: number): this
wrap(enabled?: boolean): this
opacity(value: number): this
position(position: { x?: Length; y?: Length }): this
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
center(): this
```

Rectangle and circle builders additionally provide:

```ts
fill(value: string): this
stroke(value: string): this
strokeWidth(value: Length): this
```

Line builders provide:

```ts
stroke(value: string): this
strokeWidth(value: Length): this
arrow(value?: "none" | "start" | "end" | "both"): this
```

Calling `arrow()` without an argument adds an end arrow. A line has no arrow by default.

## Unit helpers

```ts
px(value: number): string
pt(value: number): string
rem(value: number): string
percent(value: number): string
vw(value: number): string
vh(value: number): string
```

Plain numeric lengths are interpreted as pixels.

## Internal interfaces

`getActivePresentation()` and `FrameSeqNode` are exported for the compiler and renderer. They are not part of the recommended authoring surface and may change as the compiler evolves.
