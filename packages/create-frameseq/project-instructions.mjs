export const agentsMarkdown = `# FrameSeq project instructions

This repository is a FrameSeq presentation project. Treat the presentation as source code: preserve factual meaning, keep the document editable, and validate the rendered result after every material change.

## Project structure

- \`slides.ts\` owns slide order and page-specific content.
- \`components/content.ts\` contains reusable content factories.
- \`components/theme.ts\` contains shared visual settings.
- FrameSeq authoring functions are global in \`slides.ts\`; do not import FrameSeq there, wrap the deck in a callback, or add an export statement.
- Ordinary \`.ts\` component modules must explicitly import the FrameSeq functions they use from \`@pride7/frameseq\`.
- Read \`node_modules/@pride7/frameseq/llms.txt\` when you need the complete API contract.

## Authoring model

- Call \`presentation()\` once before the first slide.
- Each \`slide()\` begins a new slide. Following commands belong to it until the next \`slide()\`.
- Keep one primary message per slide and short visible copy. Put delivery detail in \`.notes()\` or \`note()\`.
- Prefer semantic layouts such as \`.cover()\`, \`.split()\`, \`.grid()\`, \`.center()\`, and \`gridSection()\` before styling or coordinates.
- Use \`.canvas()\` and \`.position({ x, y })\` only for diagrams or deliberate freeform composition. The default fixed canvas is 1280 by 720.
- Prefer text roles such as \`.hero()\`, \`.subtitle()\`, \`.lead()\`, and \`.caption()\` before custom sizes and utility classes.
- Do not invent facts, citations, image paths, or measurements. Clearly label illustrative data.

## Syntax quick reference

\`\`\`ts
presentation({ title: "My talk", theme: "minimal-academic" });

slide().cover();
text("A clear title").hero();
text("A useful subtitle").subtitle();

slide("One idea").split("40:60");
text("The claim").lead();
bullets("Evidence one", "Evidence two");

right();
metric("42%", "Illustrative improvement");
text("Explain the comparison in speaker notes.").caption();
note("State that the value is illustrative.");
\`\`\`

- Slide layouts: \`.cover()\`, \`.split(ratio)\`, \`.grid(columns)\`, \`.center()\`, \`.canvas()\`.
- Content: \`text()\`, \`bullets()\`, \`steps()\`, \`metric()\`, \`card()\`, \`image()\`, \`code()\`, \`math\`.
- Regions: \`main()\`, \`left()\`, \`right()\`, \`cell(index)\`, \`at(path)\`.
- Grouping: \`group(...items)\`, \`gridSection(columns, ...items)\`, \`.as(name)\`, \`ref(name)\`.
- Common modifiers: \`.width()\`, \`.height()\`, \`.padding()\`, \`.gap()\`, \`.position()\`, \`.color()\`, \`.background()\`, \`.style()\`, \`.showAt()\`.
- Chain a modifier on the object or layout it changes. Do not call imagined APIs; consult \`llms.txt\` or TypeScript diagnostics for exact signatures.

## Regions and \`at()\`

\`at(path)\` moves the authoring cursor; it is not a one-object wrapper. Every following object belongs to that region until another region command or the next slide.

\`\`\`ts
slide("Roadmap").grid(2);

at("cell0/now").card();
text("Q3").eyebrow();
bullets("Shipped", "Measured");

at("cell1/next").card();
text("Q4").eyebrow();
bullets("Pilot", "Launch");
\`\`\`

- The first path segment may select an existing layout region: \`main\`, \`left\`, \`right\`, \`cell0\`, \`cell1\`, and so on.
- Deeper segments create named containers on demand. Revisiting a path appends to the same container.
- Use \`at("")\` or \`main()\` to return to the slide's default region.
- Paths reset at the next \`slide()\`.
- A named region can be styled as a unit: \`at("panel").row().gap(24).padding(20)\`.
- Treat \`empty-region\` and \`similar-name\` warnings as likely spelling mistakes. Correct the path instead of filling an accidental region.

## Formulas and complex typesetting

Use tagged templates so LaTeX backslashes survive TypeScript parsing.

Inline math belongs inside a tagged \`text\` template:

\`\`\`ts
text\`Euler's identity is $e^{i\\pi} + 1 = 0$.\`;
\`\`\`

Use the \`math\` tag for a standalone equation:

\`\`\`ts
math\`\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}\`;
\`\`\`

- Prefer KaTeX-backed \`text\` and \`math\` for ordinary formulas.
- Do not replace the tagged-template form with a normal quoted string unless escaping every backslash deliberately.
- Use a static \`latex\` template or \`latexFile()\` for an existing LaTeX \`tabular\` fragment. It must be body-only and requires the optional \`node-tectonic\` package.
- Use a static \`typst\` template or \`typstFile()\` only for complex local typesetting. Do not interpolate JavaScript into \`typst\`; it requires the optional Typst compiler package.

## Diagrams and grouping

- Prefer a named row, column, or grid region over positioning every object separately.
- Name diagram objects with \`.as(name)\`; place them with \`.rightOf()\`, \`.below()\`, and related constraints; connect them with \`line().from(name).to(name)\`.
- Use \`group()\` when several objects must behave as one item. Use a named \`at()\` region when later content should continue flowing into the same container.
- Keep connectors in the same canvas or named container as their referenced objects.

## Editing discipline

- Preserve the linear source order and existing region boundaries unless the requested layout change requires moving them.
- Prefer changing literal builder properties over injecting custom HTML or DOM code.
- Shorten copy or restructure a layout before reducing body text below 18 px.
- Keep Tailwind utilities in \`.style()\` as complete static strings.
- Do not edit generated \`dist/\` or \`output/\` artifacts as source.

## Required validation

Run this after changing slide source or shared components:

\`\`\`bash
npm run check
\`\`\`

This performs TypeScript validation and rendered geometry checks. Fix every error and review every warning. In particular, fix \`canvas-overflow\`, \`text-clipped\`, and accidental empty slides or regions.

For structured diagnostics or a fast outline:

\`\`\`bash
npx frameseq check slides.ts --json
npx frameseq inspect slides.ts --json
\`\`\`

Build or export only after the check passes:

\`\`\`bash
npm run build
npm run pdf
npm run pptx
npm run typst
\`\`\`
`;

// Claude Code supports @path imports in CLAUDE.md, so AGENTS.md remains the
// single source of project guidance instead of maintaining two copies.
export const claudeMarkdown = `@AGENTS.md
`;
