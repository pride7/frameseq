# Styling

Content and low-level components return builders. Every modifier returns the same builder, so calls can be chained.

```ts
text("Important")
  .size(pt(30))
  .bold()
  .color("#38bdf8")
  .margin(12, 0);
```

## Lengths and units

A number is interpreted as pixels:

```ts
text("Pixels").size(24);
```

Use helpers when the unit should be explicit:

```ts
px(20)
pt(20)
rem(2)
percent(50)
vw(40)
vh(30)
```

These helpers return CSS length strings and can be used anywhere a `Length` is accepted.

## Size and spacing

```ts
.width(640)
.height(percent(100))
.minWidth(200)
.minHeight(120)
.padding(24)
.padding(16, 24)   // vertical, horizontal
.margin(12)
.margin(8, 16)     // vertical, horizontal
.gap(20)
```

## Appearance

```ts
.background("#0f172a")
.color("#f8fafc")
.border("1px solid #334155")
.radius(16)
.opacity(0.8)
```

## Typography

```ts
.size(pt(28))
.fontSize(pt(28))
.weight(600)
.fontWeight(600)
.bold()
.lineHeight(1.4)
.textAlign("center")
```

`size()` aliases `fontSize()`, and `weight()` aliases `fontWeight()`.

Text role modifiers provide semantic defaults:

```ts
.body()
.title()
.hero()
.subtitle()
.author()
.eyebrow()
.lead()
.caption()
.quote()
```

Text roles are available on objects returned by the lowercase `text()` authoring command.

## Flex layout

Container components support:

```ts
.row()
.column()
.stack()
.center()
.align("center")
.justify("space-between")
.grow()
.wrap()
```

`align()` accepts `"start"`, `"center"`, `"end"`, or `"stretch"`. `justify()` also accepts `"space-between"` and `"space-around"`.

## Position and transform

```ts
.position({ x: 80, y: 120 })
.rotate(-4)
```

`position()` uses absolute positioning and is intended for a canvas or another deliberately positioned parent.

## Reveals

```ts
text("Appears first").showAt(1);
text("Appears second").showAt(2);
```

Reveal indices start at `1`. In PDF and print mode, all reveal steps are visible.

## Raw CSS and class names

Use these as escape hatches:

```ts
text("Custom")
  .className("my-callout")
  .style({
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  });
```

Properties passed to `style()` use JavaScript-style CSS names such as `letterSpacing`.
