# Export PowerPoint

FrameSeq can export slides as a `.pptx` file without requiring Microsoft PowerPoint. The exporter asks the browser to complete the normal FrameSeq layout, then maps the measured slide objects into PowerPoint coordinates.

## Editable export

Run:

```bash
npm run pptx
```

Or use the CLI directly:

```bash
npx frameseq pptx slides.ts
npx frameseq pptx slides.ts --output output/my-talk.pptx
```

The default output is `output/pptx/<entry-name>.pptx`.

Editable export uses a hybrid mapping:

| FrameSeq content | PowerPoint result |
| --- | --- |
| Plain text, lists, and code | Editable text boxes |
| Rectangles and circles | Editable PowerPoint shapes |
| Lines and arrows | Editable PowerPoint lines |
| Images | PowerPoint image objects |
| LaTeX math, inline math, and Typst | High-resolution image objects |
| Speaker notes | PowerPoint speaker notes |

Structured layouts and `position()` use the final browser geometry, so the PowerPoint coordinates follow the same `split()`, `grid()`, `canvas()`, and theme layout used by HTML and PDF.

## Flattened export

Use flattened mode when exact visual fidelity matters more than object-level editing:

```bash
npx frameseq pptx slides.ts --flatten
```

Each slide becomes one high-resolution image filling the PowerPoint page. Speaker notes are still preserved, but the visible slide content is not editable as separate objects.

Flattened mode is recommended for slides that rely heavily on gradients, shadows, filters, complex arbitrary HTML, or CSS effects that PowerPoint cannot represent directly.

## Fonts and visual differences

Editable PowerPoint text uses the font family reported by the browser. Install the same fonts on the computer opening the `.pptx`; otherwise PowerPoint may substitute another font and change line wrapping. Use `--flatten` when the recipient cannot install the presentation fonts.

CSS layout and coordinates are preserved, but not every browser visual effect has a native PowerPoint equivalent. Solid fills, borders, typography, basic shapes, and connectors map directly. Formula and Typst fragments remain visually stable as high-resolution images.

## Reveal steps

PPTX export creates one PowerPoint slide for each FrameSeq slide. All `steps()` and `showAt()` content is visible, matching PDF and print behavior. Interactive reveal state remains an HTML presentation feature.
