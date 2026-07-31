# Diagrams

A diagram is four decisions, and FrameSeq keeps each one in a separate command:

| Decision | Command |
| --- | --- |
| Which container an object belongs to | `at(path)` |
| How that container arranges its contents | `row()`, `column()`, `gap()` |
| Where the container itself sits | `anchor()` or `position()` |
| How objects relate to one another | `as()`, `from()`, `to()`, `rightOf()` and friends |

Nothing in that list is nested source, and none of it needs a coordinate unless you want one.

## Start with a canvas

```ts
slide({ name: "Pipeline" }).canvas();
```

`canvas()` switches the slide body out of ordinary top-to-bottom flow, so objects are placed rather than stacked. See [Shapes and connectors](shapes.md) for the `rect()`, `circle()`, and `line()` primitives themselves.

## `at()` moves the cursor

`at(path)` is a cursor, not a constructor. Every object written after it belongs to that region until the next `at()`:

```ts
at("notes");
text("First line");    // in notes
text("Second line");   // in notes
at("");                // back to the slide's default region
```

Paths are separated by `/`, and there are only three rules:

- The **first segment** may name a region the layout already owns — `main`, `left`, `right`, `cell0`, `cell1`, and so on. `at("cell1")` and `cell(1)` are the same region.
- **Every other segment** is created the first time it is used, at any depth.
- **Revisiting a path** returns the same region and appends to it, so a page can be written in whatever order reads best.

Paths belong to the current slide and reset with the next `slide()`.

## `row()` and `column()` arrange the contents

A region created by `at()` is already a vertical flex container, so `column()` is usually unnecessary and `row()` is the one you reach for:

```ts
at("stages").row().gap(80);
rect("Parse").as("parse");     // no coordinates
rect("Build").as("build");
rect("Render").as("render");
```

`gap()` must be explicit whenever the objects inside will be connected. A region inherits a gap from the theme otherwise, and a theme can change it, so FrameSeq refuses to guess it.

### A grid, when the arrangement is a matrix

Nested rows build a matrix, and so does `grid()`, with one container instead of three:

```ts
at("cells").grid(3).gap(20).width(800).anchor("center");
rect("Parse").as("parse").height(120);
rect("Build").as("build").height(120);
rect("Render").as("render").height(120);
rect("Cache").as("cache").height(120);
```

Items fill each row before starting the next, so the fourth lands under the first. Equal columns divide the container's width, so a grid written as a column count needs `width()`; give the tracks in pixels instead — `grid("200px 300px")` — and it needs none.

## `anchor()` places the container

```ts
at("stages").row().gap(80).anchor("center");
at("legend").column().gap(8).anchor("bottom-right", 40);
```

`anchor()` takes the same nine positions as connector anchors, plus an optional margin. With it, the diagram above has no coordinates anywhere. Use `position({ x, y })` instead when a diagram needs exact placement.

An object placed with `anchor()` becomes its own coordinate space, so write its connectors inside it:

```ts
at("stages").row().gap(80).anchor("center");
rect("Parse").as("parse");
rect("Build").as("build");
line().from("parse").to("build").arrow("end");   // inside "stages"
```

A connector obeys the cursor exactly like any other object, and its coordinates belong to the container it lands in. This is the one rule worth remembering.

## Nesting builds two dimensions

Rows and columns nest, and the path is the nesting:

```ts
slide({ name: "Matrix" }).canvas();

at("matrix").column().gap(30).anchor("center");
at("matrix/top").row().gap(24);
rect("Encoder").as("encoder");
rect("Decoder").as("decoder");
at("matrix/bottom").row().gap(24);
rect("Cache").as("cache");
rect("Router").as("router");

at("matrix");
line().from("encoder").to("cache").arrow("end");
line().from("decoder").to("router").arrow("end");
```

A nested row or column is as large as the layout it produces, and the container around it decides its size on the other axis, exactly as flexbox does.

## Names and connectors

Hand-computed coordinates break as soon as a diagram changes. Give an object a name with `as()`, then let other objects refer to it instead of to numbers:

```ts
slide({ name: "Training loop" }).canvas();

rect("Encoder").as("enc").position({ x: 80, y: 140 }).width(200).height(100);
rect("Decoder").as("dec").rightOf("enc", 140);
circle("Loss").as("loss").rightOf("dec", 140);

line().from("enc").to("dec").arrow("end");
line().from("dec").to("loss").arrow("end");
line().from("loss.bottom").to("enc.bottom").arrow("end");

text("shared vocabulary").caption().below("enc", 16);
```

Names are unique within a slide and may be referenced before the object they name, so connectors can still be written first for layering. Only `position()` and the placement modifiers are affected; nothing else about the object changes.

### Placement modifiers

| Modifier | Effect |
| --- | --- |
| `.rightOf(name, gap = 40)` | Left edge after the named object, vertically centred on it |
| `.leftOf(name, gap = 40)` | Right edge before the named object, vertically centred on it |
| `.below(name, gap = 24)` | Top edge under the named object, horizontally centred on it |
| `.above(name, gap = 24)` | Bottom edge over the named object, horizontally centred on it |
| `.centerOn(name)` | Centred on the named object |
| `.alignTop(name)` | Vertical only: matches the named object's top edge |
| `.alignLeft(name)` | Horizontal only: matches the named object's left edge |

`alignTop()` and `alignLeft()` change one axis, so they chain onto another placement:

```ts
rect("Cache").as("cache").rightOf("enc", 60).alignTop("enc");
```

The object being placed does not need a size of its own; FrameSeq centres it with CSS. The object being referenced does need one: `rect()` defaults to 240 x 96 and `circle()` to 160 x 160, and any explicit `width()` or `height()` overrides that.

### Connector anchors

`from()` and `to()` accept a name, or a name and an anchor:

```ts
line().from("enc").to("dec");                    // FrameSeq picks the facing edges
line().from("enc.right").to("dec.top-left");     // explicit anchors
line().from("enc.right", { dy: -20 }).to("dec"); // explicit anchor, shifted 20px up
```

Available anchors are `center`, `top`, `bottom`, `left`, `right`, `top-left`, `top-right`, `bottom-left`, and `bottom-right`, measured on the object's bounding box. Without an anchor FrameSeq compares the two centres and leaves from the edge that faces the other end, so connectors follow their nodes when coordinates change.

A connector may anchor one end only; the other end then keeps the coordinates passed to `line({ x1, y1, x2, y2 })`.

## What FrameSeq can resolve in a row or column

Automatic layout is resolved before rendering, from the declared source. FrameSeq computes only the part of it that is exact, and reports anything else instead of guessing a position the browser would contradict:

- `row()` and `column()`, with an explicit `gap()`. A gap inherited from the theme is refused, because its value depends on the theme.
- `grid()` with equal columns and a declared `width()`, or with tracks given in pixels. Rows are as tall as their tallest item, and an item without a width of its own fills its cell. Items that place themselves with a CSS grid line are refused.
- Children with a resolvable box: `rect()` and `circle()` have default sizes, everything else needs `width()` and `height()`.
- `align()` of `start`, `center`, or `end`, and the default stretch, which gives a child without its own cross size the size of the line.
- `justify()` of `start`, and `center`, `end`, or `space-between` when the container has an explicit size along that axis.
- `padding()` in pixels. Padding that comes from `card()` or a grid cell is refused for the same reason as the theme gap.
- Rows and columns nested inside one another. A nested container takes its size from the layout it produces, so it may only use `align()` or `justify()` when it declares its own `width()` and `height()`.

Anything else — `wrap()`, `grow()`, a child whose height depends on how its text wraps — produces an error naming the object and what to add.

## What names can reach

References are resolved before rendering, from declared geometry, so both objects must share a coordinate system:

- Put the objects on the same `canvas()`, or inside a group that is itself positioned with `position()`.
- Objects laid out by the document flow — a `text()` after `bullets()`, a card inside a grid cell — have no coordinates until the browser lays them out, so they cannot be referenced.

FrameSeq reports unresolved references as errors that name the slide, the reference, and the objects that are available, rather than drawing a connector to the wrong place.

## When FrameSeq refuses

Every position above is resolved before rendering, from the declared source, so the same geometry reaches HTML, PDF, PPTX, and Typst. FrameSeq computes only what it can compute exactly, and reports anything else instead of drawing a connector to the wrong place:

| Message | What to do |
| --- | --- |
| the gap of "x" comes from the theme | Call `.gap(n)` on that container. |
| the width of "x" is unknown | Give the object `.width()` and `.height()`; text of unwrapped height cannot be resolved. |
| "x" has no canvas coordinates | Give it `.position({ x, y })`, `.anchor(...)`, or put it in a resolved row or column. |
| "x" sits inside another row or column | A nested container needs `.width()` and `.height()` before it can use `align()` or `justify()`. |
| "x" uses grow() | Automatic sizes depend on the browser; set the size explicitly. |
| across a container without fixed coordinates | The two objects are in different coordinate spaces; write the connector inside the container that holds them. |

## A complete diagram

```ts
slide({ name: "Adaptive routing" }).canvas();

at("flow").row().gap(120).anchor("center");
rect("Router").as("router").width(200).height(120);
at("flow/models").column().gap(28);
rect("Small model").as("small").width(220).height(100);
rect("Large model").as("large").width(220).height(100);

at("flow");
line().from("router").to("small").arrow("end");
line().from("router").to("large").arrow("end");
text("72% stop here").caption().below("small", 12);
```

One slide, one canvas, and not a single coordinate.
