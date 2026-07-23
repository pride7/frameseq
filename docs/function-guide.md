# Function reference

This page explains the common FrameSeq authoring functions. Each entry follows the same order: what the function creates, a minimal example, a readable signature, its parameters, and its return value.

Generated `slides.ts` files expose these lowercase functions globally, so imports are not required. Signatures here emphasize how a function is used; for exact TypeScript overloads, complete option interfaces, and the uppercase object API, see the [API reference](api-reference.md).

## On this page

- [Document](#document)
- [Text](#text)
- [Lists and reveals](#lists-and-reveals)
- [Semantic objects](#semantic-objects)
- [Media and typesetting](#media-and-typesetting)
- [Slide layouts](#slide-layouts)
- [Regions](#regions)
- [Shapes and connectors](#shapes-and-connectors)
- [Themes](#themes)
- [Common object methods](#common-object-methods)
- [Length helpers](#length-helpers)

## Document

### `presentation()`

Starts a new presentation and sets document-wide metadata, canvas size, theme, and typography.

```ts
presentation({
  title: "Quarterly Review",
  author: "Ada Lovelace",
  theme: "minimal-academic",
});
```

**Signature**

```text
presentation(title) → SlidesDefinition
presentation(options) → SlidesDefinition
```

**Parameters**

- `title` — `string`, optional. A short form for setting only the presentation title.
- `options` — `SlidesOptions`, optional. Sets metadata, `theme`, `ratio`, custom `width` and `height`, `background`, and presentation-wide `font` defaults.

**Returns** `SlidesDefinition`, the presentation root. Most linear documents do not need to store it.

Call `presentation()` once, before the first `slide()`. Calling it again starts a new authoring context.

### `slide()`

Starts a slide. Every content command after it belongs to that slide until the next `slide()` call.

```ts
slide("Results");
text("Revenue increased by 42%.");
```

**Signature**

```text
slide(name) → ContentSlideBuilder
slide(options) → ContentSlideBuilder
```

**Parameters**

- `name` — `string`, optional. Sets both the internal name and the visible slide title.
- `options` — `SlideOptions`, optional. Separates `name`, visible `title`, speaker `notes`, and `allowEmpty` metadata.

```ts
slide({ name: "result-details", title: "Detailed results" });
slide({ name: "photo" }); // no automatic visible title
```

**Returns** `ContentSlideBuilder`, which provides slide layout methods such as `.split()` and `.canvas()`.

### `.notes()`

Adds private speaker notes to a slide.

```ts
slide("Results").notes("Pause here and explain the comparison.");
```

**Signature** `notes(content) → slide`

**Parameters**

- `content` — `string`, required. Text shown in presenter view and exported to PowerPoint speaker notes.

Notes are not shown on the audience page or in PDF output.

### `.allowEmpty()`

Marks a slide as intentionally empty for the layout checker.

```ts
slide({ name: "Pause" }).allowEmpty();
```

**Signature** `allowEmpty(enabled) → slide`

**Parameters**

- `enabled` — `boolean`, optional. Defaults to `true`.

## Text

### `text()`

Creates a text object in the current slide region.

```ts
text("A normal paragraph");
text("An emphasized sentence").size(30).bold().color("#2563eb");
```

**Signature**

```text
text(content) → TextBoxBuilder
text`...` → TextBoxBuilder
```

**Parameters**

- `content` — `string`, required. The text to display.
- `strings` and `values` — tagged-template input. Use this form when the text contains inline LaTeX so backslashes remain intact.

```ts
text`Energy and mass satisfy $E = mc^2$.`;
```

**Returns** `TextBoxBuilder`. It supports normal object modifiers and the text roles below.

#### Text roles

A role supplies presentation-aware typography. The most recently called role replaces any earlier role on the same text object.

| Method | Meaning | Example |
| --- | --- | --- |
| `.body()` | Normal paragraph text; the default role | `text("Explanation").body()` |
| `.title()` | A manually placed slide heading | `text("Architecture").title()` |
| `.hero()` | The primary title on a cover or section slide | `text("FrameSeq").hero()` |
| `.subtitle()` | Supporting text below a hero title | `text("Slides as code").subtitle()` |
| `.author()` | Author or presenter name | `text("Ada Lovelace").author()` |
| `.eyebrow()` | A small uppercase section label | `text("Section 01").eyebrow()` |
| `.lead()` | The leading statement on a content slide | `text("Latency fell by 42%.").lead()` |
| `.caption()` | A source, footnote, or image caption | `text("Source: Example data").caption()` |
| `.quote()` | A short quotation | `text("Simplicity is a feature.").quote()` |

Every role returns the same `TextBoxBuilder`, so further modifiers can be chained.

## Lists and reveals

### `bullets()`

Creates an unordered list whose items are all visible immediately.

```ts
bullets("Readable source", "Useful defaults", "Portable output");
```

**Signature** `bullets(...items) → ElementBuilder`

**Parameters**

- `items` — `string[]`, required. One or more strings, in display order.

**Returns** `ElementBuilder`, representing the complete list rather than an individual item.

### `steps()`

Creates a numbered list whose items are revealed one at a time.

```ts
steps("Parse the source", "Build the slide tree", "Render the result");
```

**Signature** `steps(...items) → ElementBuilder`

**Parameters**

- `items` — `string[]`, required. Item one appears at step `1`, item two at step `2`, and so on.

**Returns** `ElementBuilder`. PDF and PPTX output include every item.

### `.showAt()`

Assigns an individual object to a reveal step.

```ts
text("First result").showAt(1);
image(chart, "Result chart").showAt(2);
```

**Signature** `showAt(step) → same object`

**Parameters**

- `step` — `number`, required. A positive reveal step; steps begin at `1`.

Print, PDF, and PPTX output show all steps.

## Semantic objects

### `metric()`

Displays a prominent value with a smaller label that explains it.

```ts
metric("42%", "Revenue growth");
```

**Signature** `metric(value, label) → GroupBuilder`

**Parameters**

- `value` — `string`, required. The emphasized value, such as `"42%"` or `"18K"`.
- `label` — `string`, required. A short description of what the value means.

**Returns** `GroupBuilder`, so the metric can be styled, placed in a grid, or converted to a card.

```ts
metric("42%", "Revenue growth").card().background("#eff6ff");
```

`metric()` only displays the supplied strings; it does not calculate data or format values. Use `text()` when the content is a sentence rather than a value-label pair.

### `card()`

Creates a bordered surface containing a title and optional supporting text.

```ts
card("Portable", "Export HTML, PDF, and editable PPTX.");
```

**Signature** `card(title, content) → GroupBuilder`

**Parameters**

- `title` — `string`, required. The card heading.
- `content` — `string`, optional. Short supporting copy below the heading.

**Returns** `GroupBuilder`, representing the whole card as one styleable object.

### `group()`

Combines existing objects into one vertical, independently styleable object.

```ts
group(
  text("Revenue").bold(),
  text("$1.2M").size(42),
).card();
```

**Signature** `group(...items?) → GroupBuilder`

**Parameters**

- `items` — `ElementBuilder[]`, optional. Existing FrameSeq objects, in vertical order.

**Returns** `GroupBuilder`.

The child objects are removed from the current region and inserted once inside the group. This keeps the linear syntax: create the children first, then define their parent.

With no items, `group()` creates an empty container in the current flow. Subsequent objects can select it explicitly:

```ts
const panel = group().card().padding(24);
text("Revenue").bold().parent(panel);
text("$1.2M").size(42).parent(panel);
```

### `gridSection()`

Arranges supplied objects in a local grid inside the normal top-to-bottom slide flow.

```ts
gridSection(
  3,
  metric("42%", "Growth").card(),
  metric("18K", "Users").card(),
  metric("99.9%", "Uptime").card(),
).gap(20);
```

**Signature**

```text
gridSection(columns, ...items) → GridSectionBuilder
```

**Parameters**

- `columns` — `number | string`, required. An integer from `1` to `12` creates equal columns. A CSS grid-template string creates custom tracks, for example `"1fr 2fr"`.
- `items` — `ElementBuilder[]`, optional. Every supplied object becomes one cell, in source order.

In the direct form, every following object becomes one cell. Omitting all objects creates the incremental form described below.

**Returns** `GridSectionBuilder`, with `.columns()` and container modifiers such as `.gap()`, `.align()`, and `.padding()`.

Content written before and after `gridSection()` stays in the ordinary slide flow. Use `slide().grid()` when the entire slide body should be divided into regions.

Calling `gridSection(columns)` without items creates an empty grid. Add later objects with `.parent(section)` when naming the parent makes the source easier to follow.

## Media and typesetting

### `image()`

Creates an image object in the current region.

```ts
const diagram = new URL("./assets/diagram.png", import.meta.url).href;
image(diagram, "Compiler pipeline").width(percent(100)).radius(18);
```

**Signature** `image(src, alt) → ElementBuilder`

**Parameters**

- `src` — `string`, required. An imported asset URL, data URL, or public URL.
- `alt` — `string`, optional. Accessible alternative text. Defaults to an empty string.

**Returns** `ElementBuilder`.

### `code()`

Creates a preformatted code block.

```ts
code(`const answer = 42;`, "ts");
```

**Signature** `code(content, language) → ElementBuilder`

**Parameters**

- `content` — `string`, required. Literal code to display.
- `language` — `string`, optional. Language metadata; defaults to `"ts"`. FrameSeq does not currently apply syntax highlighting from this value.

**Returns** `ElementBuilder`.

### `math()`

Renders one standalone LaTeX-compatible equation with KaTeX.

```ts
math`\int_0^1 x^2\,dx = \frac{1}{3}`;
```

**Signature**

```text
math(content) → ElementBuilder
math`...` → ElementBuilder
```

**Parameters**

- `content` — `string`, required. Equation source without `$$` delimiters. The tagged-template form preserves LaTeX backslashes.

**Returns** `ElementBuilder`.

Use inline `$...$` inside `text` when a formula belongs in a sentence.

### `typst()`

Compiles a static Typst fragment to SVG during development and export.

```ts
typst`
  #table(columns: 2, [Model], [Accuracy], [A], [94.6%])
`.width(720);
```

**Signature**

```text
typst(content) → ElementBuilder
typst`...` → ElementBuilder
```

**Parameters**

- `content` — `string`, required. A Typst fragment, not a complete project. Tagged fragments are static and do not accept JavaScript interpolation.

**Returns** `ElementBuilder` containing the compiled graphic.

Requires the optional `@myriaddreamin/typst-ts-node-compiler` package.

### `typstFile()`

Loads and compiles a Typst fragment from a separate file.

```ts
typstFile("./figures/results.typ").width(720);
```

**Signature** `typstFile(path) → ElementBuilder`

**Parameters**

- `path` — `string`, required. A path relative to `slides.ts`. The file is watched during development.

**Returns** `ElementBuilder` containing the compiled graphic.

### `latex()`

Compiles a static LaTeX body fragment to an embedded graphic.

```ts
latex`
  \begin{tabular}{lr}
    Model & Accuracy \\
    FrameSeq & 94.6\% \\
  \end{tabular}
`.width(720);
```

**Signature**

```text
latex(content) → ElementBuilder
latex`...` → ElementBuilder
```

**Parameters**

- `content` — `string`, required. A LaTeX body fragment. Do not include `\documentclass` or a complete document.

**Returns** `ElementBuilder` containing the compiled graphic.

Requires the optional `node-tectonic` package. Use `math()` for ordinary equations; `latex()` is most useful for existing `tabular` content or package-based typesetting.

### `latexFile()`

Loads and compiles a LaTeX body fragment from a separate file.

```ts
latexFile("./tables/results.tex").width(720);
```

**Signature** `latexFile(path) → ElementBuilder`

**Parameters**

- `path` — `string`, required. A path relative to `slides.ts`.

**Returns** `ElementBuilder` containing the compiled graphic.

## Slide layouts

Without a layout method, content is placed in one vertical column in source order.

### `.cover()`

Applies the cover-slide layout and cover text styles.

```ts
slide({ name: "Cover" }).cover();
text("FrameSeq").hero();
text("Write slides as TypeScript").subtitle();
text("Ada Lovelace").author();
```

**Signature** `cover() → slide`

Use text roles to create the visible cover content; `.cover()` does not generate a title by itself.

### `.split()`

Divides the whole slide body into left and right regions.

```ts
slide("Architecture").split("40:60");
image(diagram, "Pipeline");

right();
bullets("Parse", "Render", "Export");
```

**Signature** `split(ratio) → slide`

**Parameters**

- `ratio` — `"left:right" | number | [number, number]`, optional. Defaults to `"1:1"`. Examples: `"40:60"`, `0.4`, `40`, and `[2, 3]`.

Existing content moves to the left region. Subsequent content also starts on the left; call `right()` to switch regions.

### `.grid()`

Divides the whole slide body into equal-width regions.

```ts
slide("Results").grid(3);
cell(0); metric("42%", "Growth");
cell(1); metric("18K", "Users");
cell(2); metric("99.9%", "Uptime");
```

**Signature** `grid(columns, gap) → slide`

**Parameters**

- `columns` — `number`, required. An integer from `1` to `12`.
- `gap` — `number | string`, optional. Space between the regions; the active theme supplies the default.

Use `cell(index)` to select a zero-based region. Use `gridSection()` for a grid between ordinary content above and below it.

### `.center()`

Centers the normal slide body horizontally and vertically.

```ts
slide({ name: "Conclusion" }).center();
text("Make the structure visible.").quote();
```

**Signature** `center() → slide`

This is intended for a single quotation, conclusion, or key message.

### `.fullBleed()`

Fills the slide body with one image.

```ts
slide({ name: "Landscape" }).fullBleed(photo, "Mountain landscape");
```

**Signature** `fullBleed(src, alt) → slide`

**Parameters**

- `src` — `string`, required. The image URL.
- `alt` — `string`, optional. Accessible alternative text; defaults to an empty string.

Use a slide without a visible `title` when the image should occupy all available space.

### `.canvas()`

Changes the slide body into a freeform coordinate system.

```ts
slide({ name: "System map" }).canvas();
text("Compiler").position({ x: 80, y: 90 }).width(300).size(32).bold();
```

**Signature** `canvas() → slide`

Canvas coordinates use the presentation canvas, which defaults to `1600 × 900`. Prefer normal flow, `.split()`, `.grid()`, or `gridSection()` for ordinary content slides.

## Regions

### `left()` and `right()`

Select the destination for subsequent content on a slide using `.split()`.

```ts
left();
text("Before");
right();
text("After");
```

**Signature**

```text
left() → RegionBuilder
right() → RegionBuilder
```

**Returns** the selected `RegionBuilder`. Calling either function changes the active authoring region.

### `cell()`

Selects a region on a slide using `.grid()`.

```ts
cell(1);
text("This goes in the second cell.");
```

**Signature** `cell(index) → RegionBuilder`

**Parameters**

- `index` — `number`, required. A zero-based cell number; `0` is the first cell.

**Returns** the selected `RegionBuilder` and makes it active.

### `main()`

Returns content placement to the slide's primary region.

```ts
right();
text("Right side");
main();
text("Back to the primary region");
```

**Signature** `main() → RegionBuilder`

**Returns** the normal body, left split region, or first whole-slide grid cell, depending on the current layout.

### `gap()`

Changes the spacing between children in the active region.

```ts
gap(32);
bullets("More", "Space", "Between objects");
```

**Signature** `gap(value) → RegionBuilder`

**Parameters**

- `value` — `number | string`, required. Numbers mean pixels; strings may use CSS units.

**Returns** the active `RegionBuilder`. To change a local grid, chain the method instead: `gridSection(...items).gap(20)`.

## Shapes and connectors

Shapes are normal FrameSeq objects. Exact placement is intended for a slide using `.canvas()`.

### `rect()`

Creates a rectangular diagram node with an optional centered label.

```ts
rect("Input")
  .position({ x: 80, y: 140 })
  .width(240)
  .height(100)
  .fill("#dbeafe")
  .stroke("#2563eb");
```

**Signature** `rect(label) → ShapeBuilder`

**Parameters**

- `label` — `string`, optional. Defaults to an empty string.

**Returns** `ShapeBuilder`, which adds `.fill()`, `.stroke()`, and `.strokeWidth()` to the common modifiers.

### `circle()`

Creates a circular diagram node with an optional centered label.

```ts
circle("Model").position({ x: 520, y: 110 }).width(160);
```

**Signature** `circle(label) → ShapeBuilder`

**Parameters**

- `label` — `string`, optional. Defaults to an empty string.

**Returns** `ShapeBuilder`. Its width controls the diameter unless a height is set explicitly.

### `line()`

Creates a vector connector between two canvas coordinates.

```ts
line({ x1: 320, y1: 190, x2: 520, y2: 190 })
  .stroke("#2563eb")
  .strokeWidth(4)
  .arrow("end");
```

**Signature** `line(points) → LineBuilder`

**Parameters**

- `points` — `{ x1: number; y1: number; x2: number; y2: number }`, required.

**Returns** `LineBuilder`, which provides `.stroke()`, `.strokeWidth()`, and `.arrow("none" | "start" | "end" | "both")`.

## Themes

### `themes`

Contains the complete definitions of all built-in themes.

```ts
presentation({ title: "My Talk", theme: themes.paper });
```

Most documents can use the shorter theme name, such as `theme: "paper"`. The `themes` object is useful when code needs a complete theme definition.

### `defineTheme()`

Creates a reusable theme by overriding selected design tokens.

```ts
const ocean = defineTheme({
  name: "ocean",
  extends: "blank",
  colors: { accent: "#007c91" },
});

presentation({ title: "Ocean", theme: ocean });
```

**Signature** `defineTheme(options) → ThemeDefinition`

**Parameters**

- `options.name` — unique theme name, required.
- `options.extends` — built-in theme name or theme definition, optional. Defaults to `"blank"`.
- `options.colors`, `fonts`, `spacing`, `radii`, `chrome` — partial token groups.
- `options.family`, `coverLayout`, `coverBackground` — optional theme-level behavior.

**Returns** a complete `ThemeDefinition` that can be passed to `presentation()` or extended by another theme.

See [Themes](themes.md) for all token names and built-in previews.

## Common object methods

Content functions return the object they create. These methods change that object and return the same builder, so calls can be chained.

| Method | Parameters | Meaning |
| --- | --- | --- |
| `.size(value)` / `.fontSize(value)` | `value: Length` | Set font size. |
| `.weight(value)` / `.fontWeight(value)` | `value: number \| string` | Set font weight. |
| `.bold()` | None | Set font weight to `700`. |
| `.color(value)` | `value: string` | Set text or foreground color. |
| `.background(value)` | `value: string` | Set the background. |
| `.width(value)` / `.height(value)` | `value: Length` | Set object dimensions. |
| `.minWidth(value)` / `.minHeight(value)` | `value: Length` | Set minimum dimensions. |
| `.padding(vertical, horizontal)` | `vertical: Length`; `horizontal: Length`, optional | Set inner spacing. |
| `.margin(vertical, horizontal)` | `vertical: Length`; `horizontal: Length`, optional | Set outer spacing. |
| `.gap(value)` | `value: Length` | Set spacing between container children. |
| `.border(value)` | `value: string` | Set a complete CSS border. |
| `.radius(value)` | `value: Length` | Set corner radius. |
| `.lineHeight(value)` | `value: number \| string` | Set text line height. |
| `.textAlign(value)` | `value: left \| center \| right` | Set text alignment. |
| `.opacity(value)` | `value: number` | Set opacity, normally from `0` to `1`. |
| `.clip(enabled)` | `enabled: boolean`, optional | Clip children to this object's bounds; defaults to `true`. |
| `.parent(container)` | `container: ElementBuilder` | Move the object below another object in the rendered hierarchy. |
| `.position(bounds)` | `bounds: { x?: Length; y?: Length }` | Use absolute canvas coordinates. |
| `.rotate(degrees)` | `degrees: number` | Rotate the object. |
| `.style(classes)` | `classes: string` | Add Tailwind utility classes. |
| `.style(properties)` | `properties: CSS values` | Add inline CSS properties. |
| `.className(value)` | `value: string` | Add one or more CSS classes. |

All methods in this table return the same object. Container builders also provide `.align()`, `.justify()`, `.grow()`, `.wrap()`, and `.canvas()`. See [Styling](styling.md) for accepted values and precedence rules.

## Length helpers

Length helpers make a CSS unit explicit. They return strings and can be used anywhere FrameSeq accepts `Length`.

```ts
px(20)       // "20px"
pt(20)       // "20pt"
rem(2)       // "2rem"
percent(50)  // "50%"
vw(40)       // "40vw"
vh(30)       // "30vh"

text("Label").size(pt(24)).width(percent(50));
```

Plain numeric lengths are interpreted as pixels.
