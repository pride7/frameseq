# Language tour

FrameSeq is a small language for laying out slides and posters, written in TypeScript. Six ideas cover it; everything else in this documentation is detail on one of them.

## 1. A document runs from top to bottom

```ts
presentation({ title: "Quarterly review", theme: "paper" });

slide("Revenue");
text("Up 42% on last year.").lead();
```

A slide document is a sequence of statements, run in order. `presentation()` comes first and says what the whole thing is: its title, its theme, and its size, a screen by default or a sheet of paper with `size: "A0"`. Nothing needs importing or exporting; the commands are there, and the presentation is what the document builds by its last line.

Because the document is TypeScript, variables, loops, functions, and imports work as they always do:

```ts
for (const quarter of ["Q1", "Q2", "Q3"]) {
  slide(quarter);
  text(`Results for ${quarter}`);
}
```

## 2. A slide owns what follows it

```ts
slide("Architecture");
text("Three stages");      // on Architecture
bullets("Parse", "Build"); // on Architecture

slide("Results");          // a new slide begins
```

Everything after `slide()` belongs to that slide, until the next `slide()`. There is no closing call and no nesting to keep track of: the boundaries are the `slide()` lines themselves. A poster is a presentation with one page, which `poster()` begins by itself.

## 3. Commands make objects, and modifiers shape them

```ts
text("Important").size(36).bold().color("#2563eb");
table(rows).striped();
chart("bar", { Q1: 12, Q2: 18 }).unit("%");
```

Each command adds one object, a paragraph, list, image, table, chart, equation, shape, icon, or QR code, and returns it, so modifiers chain on to say how it looks and where it goes. A modifier changes only the object it is called on. Text roles such as `.lead()` and `.caption()` choose typography from the theme; `.style()` takes Tailwind classes when nothing else says it. `.fit()` asks an object to shrink its text until it fits.

## 4. A cursor decides where objects go

```ts
slide("Comparison").split("40:60");
text("Before");            // left region
right();
text("After");             // right region

slide("Results").grid(3);
cell(0); metric("42%", "Growth");
cell(1); metric("18K", "Users");
```

The slide's layout makes regions, and the cursor says which one the next objects go into: `split()` makes `left` and `right`, `grid(n)` makes cells, and `right()`, `cell(i)`, and `main()` move the cursor. `at("cell0/notes")` moves it to a named region, making the containers on the way, so even a deep composition stays one statement per object:

```ts
at("cell0/now").card();
text("Shipped").eyebrow();
at("cell1/next").card();
text("Planned").eyebrow();
```

## 5. Names connect objects

```ts
rect("Encoder").as("encoder");
rect("Decoder").as("decoder").rightOf("encoder", 120);
line().from("encoder").to("decoder.left").arrow("end");
ref("decoder").fill("#dbeafe");
```

`.as()` names an object, and every `at()` path names a region. Connectors, relative placement, `ref()`, and `group()` refer to those names, so a diagram says what connects to what instead of where each end sits. Names belong to their slide.

The names are strings to TypeScript, but not to FrameSeq's editors: FrameSeq Studio and the VS Code extension complete them, jump from a use to where the name was given, rename a name with every use on its slide, and underline one that refers to nothing.

## 6. Mistakes are reported against the line that made them

FrameSeq checks a document at three moments:

- **While you type**, TypeScript underlines a misspelled command or a wrong argument, such as an icon name that does not exist, and the editor underlines a name that refers to nothing.
- **When it runs**, an error such as citing a work missing from the bibliography stops the document, and the Studio, the VS Code extension, and the CLI all point to the statement that caused it:

  ```text
  talk.slides.ts:24:1  error  ref() cannot find an object named "decodr"; named objects on this slide: encoder, decoder
    23 | rect("Decoder").as("decoder");
  > 24 | ref("decodr").fill("#dbeafe");
  ```

- **When it is drawn**, `frameseq check` measures the result: text that overflows or is clipped, type too small to read at its size, empty slides, and modifiers that have no effect, each with the line of the object it concerns.

## Where to go next

- [Getting started](getting-started.md) makes a project and a first talk.
- [Recipes](recipes.md) has a complete slide for each kind of page.
- [Content](content.md), [Layout](layout.md), and [Diagrams](diagrams.md) take ideas 3 to 5 in depth.
- [Posters and print](posters.md) makes pages for paper.
