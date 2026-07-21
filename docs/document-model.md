# Document model

FrameSeq slide files are evaluated from top to bottom. Authoring commands operate on a small amount of document context: the current presentation, current slide, and current layout region.

## Start the presentation

```ts
presentation("My Talk");
```

This creates a presentation titled `My Talk` and makes it the active document. The title is document metadata and becomes the browser page title. It does not create a visible cover or add text to a slide.

The object form configures the canvas:

```ts
presentation({
  title: "My Talk",
  author: "Your Name",
  institute: "Your Institute",
  date: "2026",
  ratio: "16:9",
  width: 1280,
  theme: "midnight",
});
```

Without `theme`, FrameSeq uses the neutral white `blank` theme. See [Themes](themes.md) to select a built-in theme or define your own. The older `background` option remains available as a shortcut for changing only the slide canvas color.

`author`, `institute`, and `date` are optional document metadata. Themes with presentation chrome, such as `beamer-madrid`, use them in the generated footer.

`ratio` accepts `"16:9"` or `"4:3"`. The default width is `1280`; FrameSeq derives the height from the ratio unless `height` is provided.

A slide file should call `presentation()` once, before the first slide. Calling it again starts a new document context and abandons the previously active one.

## Start a slide

```ts
slide("Architecture");
```

This ends the previous slide, starts a new one, and adds a visible `Architecture` heading. All following content commands belong to this slide until another `slide()` call.

```ts
slide("Architecture");
text("Compiler");
bullets("Parser", "Renderer", "Exporter");

slide("Result");
metric("42%", "Growth");
```

No indentation or callback establishes ownership. Source order does.

## Slide name and visible title

The string form sets both the internal page name and visible title:

```ts
slide("Architecture");
```

Use the object form when those values should differ, or when a page should have no automatic heading:

```ts
slide({ name: "architecture", title: "System architecture" });

slide({ name: "cover" }).cover();
text("My Talk").hero();
```

- `name` identifies the page but is not rendered.
- `title` creates the standard visible page heading.

## Create a cover

`cover()` changes the current slide to the cover layout. It does not invent cover content.

```ts
slide({ name: "Cover" }).cover();
text("FrameSeq").hero();
text("Build presentations like interfaces").subtitle();
text("Your name").author();
```

## Content returns objects

Content commands attach an object to the current region and return that same object. Modifiers can therefore be chained immediately:

```ts
text("A strong statement")
  .size(pt(30))
  .bold()
  .color("#38bdf8");
```

## Region context

Structured layouts introduce regions. `right()` and `cell()` change the destination for subsequent content; they do not create content themselves.

```ts
slide("Comparison").split("40:60");

text("Left side");

right();
text("Right side");
```

A new `slide()` resets the destination. `main()` returns to the current slide's primary region: the left region of a split, the first cell of a grid, or the normal body.

## Zero-boilerplate compilation

For the entry passed to `frameseq dev`, `frameseq build`, or `frameseq pdf`, FrameSeq automatically:

1. imports the document commands;
2. evaluates the file from top to bottom;
3. retrieves the presentation created by `presentation()`;
4. exports it to the renderer.

The low-level explicit object API does not use this stateful context. See [advanced composition](advanced.md).
