# AI-friendly layout checks

FrameSeq can inspect the final browser layout and return concrete diagnostics that a person or coding agent can act on.

```bash
frameseq check slides.ts
```

The checker builds the slides, opens them in a headless browser at their native canvas size, waits for fonts, and inspects every slide. It currently detects:

- `empty-slide` — a slide has no visible content and was not explicitly marked as intentionally blank.
- `canvas-overflow` — a rendered object extends beyond the slide canvas.
- `text-clipped` — text is hidden by a clipped text box or ancestor.
- `font-too-small` — body or code text is below 14px, or a slide heading is below 24px.

Canvas overflow and clipped text are errors. Empty slides and small text are warnings. Strict mode fails for either warning.

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
        "text": "FrameSeq owns presentation structure..."
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
