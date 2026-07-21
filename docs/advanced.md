# Advanced composition

The linear API is optimized for ordinary presentation authoring. The explicit object API is available when a page needs nested components, reusable factories, or freeform placement.

## Explicit deck

```ts
import {
  Column,
  Image,
  Row,
  Slides,
  Text,
} from "@pride7/frameseq";

const deck = Slides("Custom layouts");

deck.slide("Architecture").custom(
  Row(
    Image("https://example.com/diagram.png", "Architecture diagram"),
    Column(
      Text("Compiler").size(32).bold(),
      Text("DSL → HTML → PDF").size(20),
    ).gap(16),
  ).gap(40),
);

export default deck;
```

An explicitly imported entry must export its deck. It does not use the zero-boilerplate global command injection.

## Component constructors

```ts
Deck(options?)
Slides(options?)
Slide(options?)
Row(...children)
Column(...children)
Stack(...children)
Text(content)
Image(src, alt?)
Code(content, language?)
Equation(content, displayMode?)
Spacer(size?)
```

- `Deck` and `Slide` provide the minimal structural layer.
- `Slides` adds presentation-aware slide layouts and defaults.
- `Row`, `Column`, and `Stack` create containers.
- `Text`, `Image`, `Code`, and `Equation` create unattached elements.
- `Spacer` consumes available flex space.

Uppercase constructors do not automatically attach themselves to the current linear slide.

## Reusable component factories

```ts
import { Column, Text } from "@pride7/frameseq";

function Stat(value: string, label: string) {
  return Column(
    Text(value).size(44).bold(),
    Text(label).size(16).color("#94a3b8"),
  ).gap(6);
}
```

Factories return ordinary builders and can be composed into rows, columns, cards, or canvas pages.

## Region builder

`ContentSlideBuilder`, returned by `Slides().slide()`, offers convenience methods:

```ts
page.lead("...")
page.text("...")
page.bullets("...", "...")
page.steps("...", "...")
page.code("...", "ts")
page.math("...")
page.image(src, alt)
page.caption("...")
page.quote("...")
page.metric("42%", "Growth")
page.custom(element)
```

Split and grid regions expose the same content helpers.

## Freeform placement

```ts
import { Slides, Text } from "@pride7/frameseq";

const deck = Slides("Canvas");
const page = deck.slide({ name: "Diagram" }).canvas();

page.place(Text("Input").size(24), {
  x: 80,
  y: 120,
  width: 240,
});

page.place(Text("Output").size(24), {
  x: 900,
  y: 120,
  width: 240,
});

export default deck;
```

## Raw styles

Every builder supports `style()` and `className()`:

```ts
Text("Custom")
  .className("custom-label")
  .style({
    fontVariantNumeric: "tabular-nums",
    filter: "drop-shadow(0 8px 24px rgb(0 0 0 / 0.3))",
  });
```

Prefer the named modifiers when one exists; raw styles are useful for properties that FrameSeq does not yet expose.
