# Themes

FrameSeq starts with a neutral white theme. A presentation does not inherit a product identity or a fixed dark palette unless you choose one.

## Default: `blank`

```ts
presentation("My Talk");
```

This is equivalent to:

```ts
presentation({
  title: "My Talk",
  theme: "blank",
});
```

`blank` provides a white canvas, neutral typography, and minimal component styling. It is intended as a clean starting point rather than a finished visual identity.

## Built-in themes

FrameSeq includes six themes:

- `blank` — neutral white and the default.
- `midnight` — the original dark FrameSeq appearance with cyan accents.
- `paper` — a warm, editorial theme with serif typography.
- `beamer-default` — a clean blue academic style without presentation chrome.
- `beamer-madrid` — a blue title bar and metadata footer inspired by Beamer Madrid.
- `beamer-cambridge-us` — a burgundy and cream academic style inspired by Beamer CambridgeUS.

Choose one on the presentation:

```ts
presentation({
  title: "Compiler Architecture",
  theme: "midnight",
});
```

The theme applies to every slide in the presentation.

## Beamer-inspired themes

The Madrid and CambridgeUS themes can render a frame title, author and institute footer, date, and automatic slide number. Supply the metadata once on the presentation:

```ts
presentation({
  title: "Compiler Architecture",
  author: "Ada Lovelace",
  institute: "Analytical Engine Institute",
  date: "2026",
  theme: "beamer-madrid",
});

slide().cover();
text("Compiler Architecture").hero();
text("Ada Lovelace").author();

slide("Overview");
bullets("Parser", "Renderer", "Exporter");
```

The title bar uses the visible `title` from `slide("Overview")`. A slide created with only `name` metadata does not gain a visible title. Chrome is hidden on cover slides by default.

These themes reproduce the visual language and common frame structure of the Beamer themes in FrameSeq's HTML renderer; they do not execute Beamer or LaTeX theme files.

## Create a theme

Use `defineTheme()` and override only the tokens you need. Unspecified values come from `blank` by default.

```ts
const ocean = defineTheme({
  name: "ocean",
  colors: {
    background: "#effcff",
    foreground: "#073b4c",
    accent: "#007c91",
  },
  fonts: {
    heading: 'Avenir, "Segoe UI", sans-serif',
  },
  radii: {
    medium: "8px",
  },
  chrome: {
    slideNumber: true,
  },
});

presentation({
  title: "Ocean Research",
  theme: ocean,
});
```

The slide compiler provides `defineTheme` automatically, just like `presentation` and `slide`, so the example needs no import in a `.slides.ts` entry file.

## Extend another theme

Set `extends` to a built-in name or another theme object:

```ts
const companyTheme = defineTheme({
  name: "company",
  extends: "midnight",
  colors: {
    accent: "#a3ff12",
  },
});
```

Themes can be composed:

```ts
const conferenceTheme = defineTheme({
  name: "conference",
  extends: companyTheme,
  spacing: {
    slideX: "100px",
    slideY: "72px",
  },
});
```

## Theme tokens

`defineTheme()` accepts partial values in these groups:

- `colors`: canvas, text, accent, surfaces, borders, code, errors, preview stage, and shadow.
- `fonts`: `body`, `heading`, and `mono` CSS font stacks.
- `spacing`: slide padding, layout gaps, and card padding.
- `radii`: `small`, `medium`, `large`, and `pill` CSS radii.
- `chrome`: optional title bar, footer, slide numbering, their dimensions, and colors.
- `family`: `"frameseq"` or `"beamer"`; extending a theme preserves its family automatically.
- `coverBackground`: a CSS color, gradient, or image used by `.cover()` slides.

See [API reference](api-reference.md#themes) for all token names.

## Local overrides

Element modifiers still have the final say:

```ts
text("This one line is red").color("#dc2626");
```

Use a theme for presentation-wide decisions and chainable modifiers for intentional exceptions.

The legacy `background` presentation option remains available. It overrides both the normal slide background and cover background, but a theme is the better choice when more than one visual token needs to change.
