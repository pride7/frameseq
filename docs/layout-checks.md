# AI-friendly layout checks

FrameSeq can inspect the final browser layout and return concrete diagnostics that a person or coding agent can act on.

```bash
frameseq check slides.ts
```

The checker builds the slides, opens them in a headless browser at their native canvas size, waits for fonts, and inspects every slide. It currently detects:

- `empty-slide` — a slide has no visible content and was not explicitly marked as intentionally blank.
- `canvas-overflow` — a rendered object extends beyond the slide canvas.
- `text-clipped` — text is hidden by a clipped text box or ancestor.
- `label-overflow` — the label of a `shape()` does not fit inside its outline, which keeps its size whatever the label says.
- `font-too-small` — text is too small to read at its size: below 14px on a 1280-wide slide, or 24px for a heading. The minimum grows with the canvas; on paper it is the same share of the sheet's short side, which on an A0 poster is about 21 pt, and the finding gives both sizes.
- `empty-region` — a named region created by `at()` never received any content.
- `similar-name` — two names on the same slide are one edit apart, which usually means one of them is a mistyped `at()` path or `.as()` name.
- `inert-modifier` — a layout modifier landed somewhere it cannot mean anything, so the browser ignores it.
- `document-error` — the slide document stopped with an error before anything could be measured.

Canvas overflow, clipped text, and document errors are errors. Empty slides, overflowing shape labels, small text, empty regions, near-identical names, and inert modifiers are warnings. Strict mode fails for any warning.

A layout modifier only works in one context: `align()`, `justify()`, `gap()`, and `wrap()` need the object itself to be a `row()`, `column()`, or grid, while `selfAlign()`, `centerSelf()`, `grow()`, and `spacer()` need the container holding it to be one. Written anywhere else they are dropped in silence, which is why the checker names the modifier and the nearest one that would have worked:

```text
WARNING Slide 2 "Result" [inert-modifier]
  align() has no effect: this object is not a row(), column(), or grid().
  Suggestion: Add row(), column(), or grid() to this object so it arranges its children.
  Suggestion: To place this object inside its container, use selfAlign() or centerSelf(); to move the text inside it, use textAlign().
```

A mistyped path is invisible at runtime because `at()` creates whatever it is given, so these two rules catch the case where `at("cell0/nwo")` was meant to return to `at("cell0/now")`:

```text
WARNING Slide 1 "Roadmap" [similar-name]
  Names "cell0/now" and "cell0/nwo" are one edit apart.
  Suggestion: Rename one of them so the difference is deliberate.
```

An automatic title page generated from presentation metadata counts as visible content. If a blank page is deliberate, mark that intent in the source:

```ts
slide({ name: "Pause" }).allowEmpty();
```

Use `allowEmpty: true` in `SlideOptions` when the option-object form is more convenient. Avoid silencing an empty slide until you have confirmed that it is intentional.

## Human-readable output

```text
ERROR Slide 4 "Architecture" [text-clipped]
  Text is clipped by 38px on the bottom.
  Object: text 3.1.2 "FrameSeq owns presentation structure..."
  Suggestion: Increase the text box size, reduce the font size, or shorten the content.
```

The object path identifies the rendered FrameSeq node within the slides. It remains more useful to an automated editor than a generated CSS selector and does not depend on browser-generated class names.

## A document that does not run

When the document itself throws, such as a `ref()` to a name no object has, or a citation missing from the bibliography, nothing can be measured. The checker says so at once, against the statement the document was running, with the line that caused it:

```text
talk.slides.ts:24:1  error  ref() cannot find an object named "decodr"; named objects on this slide: encoder, decoder
  23 | rect("Decoder").as("decoder");
> 24 | ref("decodr").fill("#dbeafe");
```

`frameseq pdf`, `pptx`, and `typst` report a failed document the same way.

## JSON output for agents

Use `--json` when another program or AI agent will consume the result:

```bash
frameseq check slides.ts --json
```

```json
{
  "version": 1,
  "file": "slides.ts",
  "canvas": { "width": 1280, "height": 720 },
  "summary": { "slides": 8, "errors": 1, "warnings": 0 },
  "issues": [
    {
      "severity": "error",
      "rule": "canvas-overflow",
      "slide": { "index": 4, "label": "Architecture" },
      "element": {
        "type": "text",
        "path": "3.1.2",
        "text": "FrameSeq owns presentation structure...",
        "source": { "line": 41, "column": 1 }
      },
      "message": "Text exceeds the slide canvas by 38px on the bottom.",
      "details": { "left": 0, "right": 0, "top": 0, "bottom": 38 },
      "suggestions": [
        "Move the object inward or reduce its width, height, or font size."
      ]
    }
  ]
}
```

JSON mode writes only the report to standard output so it can be redirected or parsed directly.

`element.source` is the line and column of the command that made the object, so an agent can go straight to the code to change. A presentation made for paper adds `canvas.paper`, such as `"A0"`, and its `font-too-small` findings add `details.printedPoints`.

A document that does not run produces the same report shape with a single `document-error` issue, whose `source` is the statement that stopped:

```json
{
  "severity": "error",
  "rule": "document-error",
  "message": "ref() cannot find an object named \"decodr\"; named objects on this slide: encoder, decoder",
  "source": { "line": 24, "column": 1 }
}
```

## Exit codes and strict mode

By default, the command exits with a non-zero status when it finds an error. Warnings are reported but do not fail the command.

```bash
frameseq check slides.ts --strict
```

Strict mode also returns a non-zero status for warnings. It is useful in CI or before publishing slides.

## Generated projects

Projects created with `npm create frameseq` run both TypeScript and rendered-layout checks:

```bash
npm run check
```

The checker intentionally starts with high-confidence geometry rules. It does not currently reject intentional object overlap or attempt subjective visual scoring.
