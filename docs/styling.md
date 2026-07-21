# Styling

For presentation-wide colors, fonts, spacing, and corner radii, start with [Themes](themes.md). The modifiers below override the theme for an individual element.

Content and low-level components return builders. Every modifier returns the same builder, so calls can be chained.

```ts
text("Important")
  .size(pt(30))
  .bold()
  .color("#38bdf8")
  .margin(12, 0);
```

## Presentation-wide typography

Use the `font` option in `presentation()` when a deck should keep a theme's colors and layout but use different font defaults:

```ts
presentation({
  title: "My Slides",
  theme: "minimal-academic",
  font: {
    family: '"Noto Sans SC", sans-serif',
    size: 24,
    weight: 400,
    lineHeight: 1.5,
    heading: {
      family: '"Noto Serif SC", serif',
      size: 40,
      weight: 700,
    },
    code: {
      family: '"JetBrains Mono", monospace',
      size: 18,
    },
  },
});
```

Numbers used as `size` values are pixels. Length helpers and CSS strings are also accepted, such as `pt(20)`, `"1.5rem"`, or `"24px"`. `lineHeight` can be a unitless number or a CSS string.

The precedence is: an individual object's modifier or `.style()` value, then `presentation.font`, then the selected theme. A top-level `family` applies to both body text and headings; code keeps the theme's monospace family unless `code.family` is set.

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

## Tailwind CSS

Tailwind utilities are built in and require no configuration. Pass a utility string to `style()`:

```ts
text("A strong statement")
  .style("text-4xl font-bold tracking-tight text-blue-600");

text("Precisely placed")
  .style("absolute left-[80px] top-[120px] w-[640px]");
```

Arbitrary values such as `text-[30px]`, `bg-[#0f172a]`, and `grid-cols-[2fr_3fr]` are supported. Keep dynamically selected utilities as complete strings so Tailwind can detect them:

```ts
const emphasis = important ? "text-red-600" : "text-slate-500";
text("Status").style(emphasis);
```

Avoid constructing fragments such as `` `text-${color}-600` `` because those complete class names do not appear in the source file.

## Inline CSS and class names

The object overload remains available for inline CSS:

```ts
text("Custom")
  .className("my-callout")
  .style({
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  });
```

Properties passed to `style()` use JavaScript-style CSS names such as `letterSpacing`.

Inline properties take precedence over Tailwind utilities regardless of call order. `className()` remains available when a class name should be attached without using the `style()` shorthand.
