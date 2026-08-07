# Revising a talk

A deck is rarely expensive to start. It becomes expensive on the twentieth revision, the evening before the talk, when a reviewer wants one more measurement on the results page and the section order changed.

Every edit below is a real change to the [recipes deck](recipes.md), shown as a diff and measured in lines. The whole set was applied at once and the result passes `frameseq check` with no layout issues, so none of them needs a repair pass afterwards.

## Change the entire visual system

```diff
   date: "2026",
-  theme: "minimal-academic",
+  theme: "paper",
 });
```

**One line.** No slide sets a font, colour, or spacing, so every page follows. This is the reason to reach for text roles such as `lead()` and `caption()` instead of `.size(28).color("#666")`: a role survives a change of theme, a literal does not.

## Split one page into two

```diff
 note("Give the audience the problem before the method.");
+
+slide("What a fixed route costs");
 text("Measurements in this deck are illustrative.").caption();
+bullets("Easy inputs pay the full round trip", "Hard inputs get no extra budget");
```

**One line to split, two to fill the new page.** A slide owns everything written after it, so a new `slide()` call moves the rest of the page without touching it. Nothing is nested, so nothing has to be re-indented or unwrapped.

Moving a page is the same property in reverse: cut the block from its `slide()` to the next one and paste it elsewhere. There is no wrapper to keep balanced.

## Turn one column into a comparison

```diff
-slide("What changed").notes("Pause after each step; …");
+slide("What changed").split("50:50").notes("Pause after each step; …");
 steps(
   "Latency fell by 65% for routed inputs",
   "Accuracy moved by less than one point",
   "The threshold, not the model, carries the trade-off",
 );
+
+right();
+text("Still open").lead();
+bullets("Thresholds drift across datasets", "Cold caches lose the latency win");
```

**One word and a new region.** The existing content stays where it is and becomes the left column; `right()` starts the second one. Changing the ratio later is one number.

## Add a measurement to a row

```diff
 gridSection(
-  3,
+  4,
   metric("41 ms", "Median latency"),
   metric("72%", "Inputs kept local"),
   metric("−0.6 pt", "Accuracy change"),
+  metric("1.8×", "Battery life"),
 ).gap(20);
```

**Two lines.** The column count and the item; the grid re-spaces itself. Nothing carries a width, so nothing has to be recomputed.

## Move a whole diagram

```diff
-at("flow").row().gap(90).anchor("center");
+at("flow").row().gap(90).anchor("left", 90);
```

**One word.** The boxes have no coordinates, so the diagram moves as a unit and the connectors follow. Changing `gap(90)` re-spaces the boxes and their connectors in the same way.

## Add a node to a diagram

```diff
 rect("Cloud").as("cloud").width(200).height(110);
+rect("Cache").as("cache").width(200).height(110);
 line().from("device").to("router").arrow("end");
 line().from("router").to("cloud").arrow("end");
+line().from("cloud").to("cache").arrow("end");
```

**Two lines.** The row makes room for the new box and shifts the others, and because the connectors name their endpoints rather than coordinates, the existing arrows stay attached. This is the edit that is genuinely unpleasant in a drawing tool: everything downstream of the insertion has to be dragged.

## Move a point into the speaker notes

```diff
-bullets("41 ms for routed inputs", "72% stay on the device", "Accuracy traded per input");
+bullets("41 ms for routed inputs", "72% stay on the device");
+note("Accuracy is traded per input, not per model.");
```

**One line moved.** A detail that was crowding the slide becomes something you say. `note()` appends, so it can sit beside the content it belongs to rather than at the top of the page.

## Drag it instead of typing it

```diff
-rect("Cache").as("cache").position({ x: 320, y: 90 });
+rect("Cache").as("cache").position({ x: 404, y: 132 });
```

**Two numbers.** The `E` control in the live preview turns on layout editing, and an object placed by coordinates can then be dragged into place; releasing it writes the numbers back. An object in the flow has none to write, so dragging it changes its place among its neighbours and carries its lines there instead.

The point is what the edit looks like afterwards. Dragging produces the revision you would have typed, in the same place, at the same size, so it still reviews and diffs as source. Where no single number or line stands for what was dragged — a computed coordinate, or a command that runs in a loop — there is no handle to grab, because there would be nothing honest to write. See [Visual Studio Code extension](vscode.md) for the whole gesture set.

## Check the result

```bash
npx frameseq check my-talk.slides.ts
```

The checker renders every slide at its real size and reports text that overflows or is clipped, type below a readable size, empty slides, and mistyped region paths. Run it after a revision pass; it is faster than clicking through the deck, and it is the same check that keeps the recipes honest.

## Why the edits stay small

Three properties do most of the work, and they are worth keeping in your own source:

- **Ownership is source order.** A slide owns what follows it, and a region owns what follows `at()`. Moving content is moving lines, never rebalancing a tree.
- **Objects relate by name, not by number.** `line().from("cloud")` survives every layout change that a coordinate would not.
- **Roles carry the styling.** `lead()`, `caption()`, and `metric()` describe intent, so a theme change is one line instead of a search and replace.
