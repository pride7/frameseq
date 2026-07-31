# Recipes

Each recipe below is a complete slide, not a fragment: copy it, replace the words, and it renders. Every one of them is taken from a deck that ships with the Gallery, so what you see here is what the layout checker accepts.

[Open the recipes deck](https://pride7.github.io/frameseq/examples/recipes/) to see the rendered result, and [read its source](https://github.com/pride7/frameseq/blob/main/gallery/slides/recipes.slides.ts) to see the recipes in order.

- [Cover](#cover)
- [One idea and its evidence](#one-idea-and-its-evidence)
- [Comparison](#comparison)
- [A row of measurements](#a-row-of-measurements)
- [Code beside its explanation](#code-beside-its-explanation)
- [A formula with its reading](#a-formula-with-its-reading)
- [A flow diagram](#a-flow-diagram)
- [A two-dimensional architecture](#a-two-dimensional-architecture)
- [Progressive reveal](#progressive-reveal)
- [Closing statement](#closing-statement)

## Cover

```ts
slide({ name: "Cover" }).cover();
text("Section 01").eyebrow();
text("Adaptive Inference at the Edge").hero();
text("Routing easy inputs away from the network").subtitle();
text("Research Systems Group").author();
```

`cover()` changes the layout; the four text roles carry the meaning. Nothing here sets a font size, so a change of theme restyles the page without touching it.

## One idea and its evidence

```ts
slide("Cloud-only inference stalls on the network");
text("The round trip costs more than the model call it protects.").lead();
bullets(
  "Latency varies with congestion, not with model size",
  "Every input leaves the device, including private ones",
  "A fixed route spends the same budget on easy and hard inputs",
);
note("Give the audience the problem before the method.");
text("Measurements in this deck are illustrative.").caption();
```

The most common slide in a talk. The title states the claim, `lead()` states it once more in a sentence, and the bullets are the evidence. `note()` keeps the delivery detail off the screen, and `caption()` is where a disclaimer belongs.

## Comparison

```ts
slide("Two routes, one budget").split("45:55");
text("Cloud only").lead();
bullets("118 ms round trip", "Every input uploaded", "One accuracy operating point");

right();
text("Adaptive").lead();
bullets("41 ms for routed inputs", "72% stay on the device", "Accuracy traded per input");
```

`split()` names two regions and `right()` moves to the second, so the two sides stay side by side in the source as well as on the page. Keep the two lists the same length; the shape of the slide is the argument.

## A row of measurements

```ts
slide("Operating profile");
text("Three numbers summarise the run.");
gridSection(
  3,
  metric("41 ms", "Median latency"),
  metric("72%", "Inputs kept local"),
  metric("−0.6 pt", "Accuracy change"),
).gap(20);
text("Values are illustrative and not a benchmark.").caption();
```

`gridSection()` arranges only its own items, so the sentence above and the caption below stay in the ordinary flow. Use `slide().grid(3)` instead when the whole page is the grid.

## Code beside its explanation

```ts
slide("The routing rule").split("52:48");
code(`if (confidence(small) >= threshold) {
  return small;
}
return large;`, "ts");

right();
text("One comparison decides the route.").lead();
bullets(
  "The small model always runs first",
  "Only its confidence crosses the network",
  "The threshold is the single tuning knob",
);
```

Give the code slightly more than half the width and cut it down to the lines that carry the idea. The bullets say what the reader should notice, which is not the same as narrating the code.

## A formula with its reading

```ts
slide("Objective").center();
text`The router minimises latency subject to an accuracy floor.`.lead();
math`\min_{\theta}\; \mathbb{E}\big[\ell(f_\theta(x), y)\big] + \lambda\,\mathbb{E}\big[c(x)\big]`;
text("λ prices a millisecond against a point of accuracy.").caption();
```

Use the tagged-template form for anything with backslashes. Sentence, formula, reading: the audience needs to know what the symbols buy before they parse them.

## A flow diagram

```ts
slide("Request path").canvas();

at("flow").row().gap(90).anchor("center");
rect("Device").as("device").width(200).height(110);
rect("Router").as("router").width(200).height(110);
rect("Cloud").as("cloud").width(200).height(110);

line().from("device").to("router").arrow("end");
line().from("router").to("cloud").arrow("end");
text("28% of inputs continue past the router").caption().below("router", 28);
```

No coordinates. The row lays the boxes out, `anchor("center")` places the row, and the connectors follow the boxes. Changing `gap(90)` re-spaces the whole diagram, connectors included. See [Diagrams](diagrams.md) for the full model.

## A two-dimensional architecture

```ts
slide("Where the work happens").canvas();

at("map").column().gap(36).anchor("center");
at("map/device").row().gap(28);
rect("Small model").as("small").width(230).height(96);
rect("Confidence").as("confidence").width(230).height(96);
at("map/cloud").row().gap(28);
rect("Large model").as("large").width(230).height(96);
rect("Cache").as("cache").width(230).height(96);

at("map");
line().from("confidence").to("large").arrow("end");
line().from("large").to("cache").arrow("both");
```

Rows nested in a column give the second dimension, and the path is the nesting. Return to the outer container with `at("map")` before writing the connectors, so their coordinates belong to it.

## Progressive reveal

```ts
slide("What changed").notes("Pause after each step; the third is the surprising one.");
steps(
  "Latency fell by 65% for routed inputs",
  "Accuracy moved by less than one point",
  "The threshold, not the model, carries the trade-off",
);
```

`steps()` reveals one item per keypress in the browser and shows everything in PDF and PPTX. Use `showAt(n)` when an individual object, rather than a list item, belongs to a step.

## Closing statement

```ts
slide({ name: "Close" }).center();
text("Route the easy inputs. Keep the budget for the hard ones.").quote();
text("Research Systems Group · 2026").caption();
```

A closing slide with one sentence gives the room something to hold on to. `center()` and `quote()` do the rest; the object form of `slide()` leaves the page without a heading.

## Checking your own deck

The deck these recipes come from passes the layout checker, and yours can be held to the same standard:

```bash
npx frameseq check my-talk.slides.ts
```

It renders every slide at its real size and reports text that overflows or is clipped, type below a readable size, empty slides, and mistyped region paths. See [Layout checks](layout-checks.md).
