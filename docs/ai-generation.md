# Generate presentations with AI

FrameSeq is designed to be a practical target language for coding agents. Its source has explicit slide boundaries, a small semantic API, and objects whose properties stay beside their content. The result is straightforward for an AI to generate and straightforward for a person to revise.

## Give the agent the FrameSeq contract

Ask the agent to read [`llms.txt`](../llms.txt) before it writes any source. The file is intentionally compact enough to use as model context and ships in the npm package.

For an agent that can read URLs, start with:

```text
Read https://raw.githubusercontent.com/pride7/frameseq/main/llms.txt.
Then create a FrameSeq presentation from the brief below.
Write the result to slides.ts, run npm run check, and fix every reported error.

Brief:
[paste the audience, purpose, source material, constraints, and desired length]
```

For an installed package, the same reference is available at:

```text
node_modules/@pride7/frameseq/llms.txt
```

## A useful brief

AI produces stronger slides when the prompt describes the communication problem rather than only the topic. Include:

- audience and their current level of knowledge;
- the decision, lesson, or action the presentation should enable;
- source material and facts that must remain accurate;
- target slide count and speaking time;
- required sections, formulas, diagrams, or citations;
- preferred theme, tone, and output format;
- any assets the agent is allowed to use.

Example:

```text
Create a six-slide research presentation for an ML systems seminar.
The audience knows transformer inference but not adaptive routing.
Explain the latency problem, show a two-stage method, include the training
objective as LaTeX, summarize three illustrative results, and end with two
limitations. Use minimal-academic, add concise speaker notes, and label all
synthetic measurements as illustrative. Prefer split and grid layouts; use a
canvas only for the method diagram.
```

## Recommended generation loop

### 1. Outline before styling

Give each slide one primary message. A useful six-slide research sequence is:

1. claim and context;
2. problem and evidence;
3. method diagram;
4. objective or mechanism;
5. results and comparison;
6. conclusion and limitations.

The outline should decide what the audience needs to understand before choosing coordinates, colors, or decorative elements.

### 2. Use semantic FrameSeq source

Start with the linear API and built-in roles:

```ts
presentation({
  title: "Adaptive Inference at the Edge",
  author: "Research Systems Group",
  theme: "minimal-academic",
});

slide().cover();

slide("Why cloud-only inference stalls").split("40:60");
metric("118 ms", "Illustrative round-trip latency");

right();
text("The network dominates short model calls.").lead();
bullets(
  "Latency varies with congestion",
  "Private inputs leave the device",
  "A fixed route wastes easy examples",
);
```

This keeps the content and its intent visible. Add exact positions only for a diagram that genuinely needs them.

When a grid occupies only one part of a page, generate its items directly instead of switching regions manually:

```ts
slide("Operating profile");
text("Three measurements summarize the run.");
gridSection(
  3,
  metric("118 ms", "Latency"),
  metric("72%", "Inputs kept local"),
  metric("−0.6 pt", "Accuracy change"),
);
text("Values are illustrative.").caption();
```

Each argument is one cell. Use `card()` for a title-and-copy item and `group()` only when a cell needs multiple independently styled objects.

### 3. Put delivery detail in speaker notes

Visible text should help the audience scan the slide. Explanations, transitions, caveats, and reminders belong in notes:

```ts
slide("Results")
  .grid(3)
  .notes("State that all values are illustrative, then compare the trend rather than claiming a benchmark.");
```

### 4. Validate rendered geometry

Run both the TypeScript and browser-layout checks:

```bash
npm run check
```

An agent can request structured diagnostics directly:

```bash
npx frameseq check slides.ts --json
```

The JSON report identifies empty pages and gives each geometry issue a slide, object type, object path, measurements, and suggested corrections. Add real visible content when `empty-slide` appears; use `.allowEmpty()` only when a blank page is intentional. Prefer shortening copy or changing the layout before making text smaller.

### 5. Export from the validated source

```bash
npm run build   # deployable interactive HTML
npm run pdf     # portable PDF
npm run pptx    # editable PowerPoint
```

One source remains responsible for all three outputs.

## Correction prompt

When the first pass does not validate, give the report back to the agent with a narrow instruction:

```text
Read the FrameSeq layout report below and edit slides.ts.
Fix every error without changing factual meaning. Prefer shorter copy,
semantic layout changes, or wider regions. Keep body text at least 18px and
do not remove citations. Run npm run check again after editing.

[paste frameseq check --json output]
```

## Generation checklist

Before accepting AI-generated slides, verify that:

- every claim is grounded in the supplied sources;
- illustrative data is labeled and fabricated citations are absent;
- every slide has one clear message and a visible reading order;
- structured layouts are used for ordinary pages;
- formulas use tagged templates so LaTeX backslashes survive;
- Typst fragments are static and used only for local complex typesetting;
- LaTeX table fragments are static, body-only, and use `latex` or `latexFile()`;
- Tailwind utility strings are complete and readable;
- speaker notes carry detail that does not need to be on screen;
- `npm run check` passes;
- the final HTML, PDF, or PPTX has been visually reviewed.

## Complete example

The Gallery includes an AI-oriented research presentation built from the brief above:

- [Open the live presentation](https://pride7.github.io/frameseq/examples/ai-research/)
- [Read its FrameSeq source](https://github.com/pride7/frameseq/blob/main/gallery/slides/ai-research.slides.ts)

The example demonstrates a cover, split layout, canvas diagram, LaTeX objective, result grid, speaker notes, and progressive disclosure in one linear file.
