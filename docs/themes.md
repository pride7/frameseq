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

FrameSeq includes eight themes:

- `blank` — neutral white and the default.
- `midnight` — the original dark FrameSeq appearance with cyan accents.
- `paper` — a warm, editorial theme with serif typography.
- `beamer-default` — a clean blue academic style without presentation chrome.
- `beamer-madrid` — a blue title bar and metadata footer inspired by Beamer Madrid.
- `beamer-cambridge-us` — a burgundy and cream academic style inspired by Beamer CambridgeUS.
- `minimal-academic` — a restrained academic theme with a left-aligned title page, underlined frame titles, and a compact footer.
- `poster` — a conference poster: a title band built from the presentation's metadata, columns of titled blocks, and type sized for a sheet of paper. `poster()` starts with it; see [Posters and print](posters.md).

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

As in a Beamer frame, a slide's content sits in the middle of the room below its title rather than at its top, and Madrid and CambridgeUS set the title of the title page in a rounded box of their colour. `contentAlign: "top"` and `chrome: { coverTitleBox: false }` in a theme of your own turn either off.

These themes reproduce the visual language and common frame structure of the Beamer themes in FrameSeq's HTML renderer; they do not execute Beamer or LaTeX theme files.

### Minimal Academic

`minimal-academic` uses a deep-blue palette, a 72%-width title rule, underlined frame titles, and a 78/22 title-and-page-number footer.

An empty cover slide is filled automatically from presentation metadata:

```ts
presentation({
  title: "Minimal Academic Theme",
  subtitle: "A restrained presentation style",
  author: "Your Name",
  institute: "FrameSeq Research",
  date: "2026",
  theme: "minimal-academic",
});

slide().cover();

slide("Motivation");
text("Content starts here.");
```

Automatic title-page content is only added when the cover is empty. Add your own `text()`, image, or layout objects after `slide().cover()` to keep full manual control.

## Poster

`poster` opens every page that is not a cover with a band holding the title, subtitle, author, institute, and date. Under the band, grid cells are plain columns, `card()` regions are blocks with an accent rule across the top, and `.title()` text heads a block.

```ts
poster({
  title: "Diffusion Language Models",
  author: "Ada Lovelace",
  institute: "University of Cambridge",
}).grid(3);

at("cell0/introduction").card();
text("Introduction").title();
text("Autoregressive models write one token at a time.");
```

The band is the theme option `chrome.header`, with `chrome.headerBackground` and `chrome.headerForeground` for its colours, so any theme can have one.

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
- `chrome`: optional title bar, footer, slide numbering, a poster's title band (`header`), a box around the cover's title (`coverTitleBox`), their dimensions, and colors.
- `family`: `"frameseq"` or `"beamer"`; extending a theme preserves its family automatically.
- `coverLayout`: `"default"`, `"center"`, or `"academic-left"`. Each sets the cover's words in the middle of the page; with `"default"`, an author stays at its foot.
- `contentAlign`: `"top"`, or `"center"` to set a slide's content in the middle of the room below its title, as the Beamer themes do.
- `coverBackground`: a CSS color, gradient, or image used by `.cover()` slides.

See [API reference](api-reference.md#themes) for all token names.

## Chinese, Japanese, and Korean text

Every built-in theme ends its font stacks with CJK families, so Chinese, Japanese, and Korean text renders with a real face instead of empty boxes:

```ts
presentation({ title: "中文排版", theme: "minimal-academic" });

slide("正文与列表");
text("中文与 English 混排时，拉丁字母仍使用主题字体。");
```

Browsers, and the Typst exporter, resolve font families per character. The Latin family stays first in every stack, so Latin text is unchanged and only the characters it cannot draw fall through to `PingFang SC`, `Hiragino Sans GB`, `Microsoft YaHei`, `Noto Sans CJK SC`, `Noto Sans SC`, or `Source Han Sans SC`. The `paper` theme uses the serif equivalents, and code blocks fall back to `Noto Sans Mono CJK SC`.

To choose the face yourself, put it first in the presentation font option:

```ts
presentation({
  title: "中文排版",
  font: { family: '"Source Han Sans SC", Inter, sans-serif' },
});
```

The machine that renders the slides must have the font installed. Browsers substitute a system font when a family is missing, but PDF, PPTX, and Typst export from a machine with no CJK font produces empty boxes. On a Linux server or CI runner, install one:

```bash
sudo apt-get install -y fonts-noto-cjk
```

FrameSeq's own CI installs that package and `npm test` fails if Chinese glyphs render as boxes.

## Local overrides

Element modifiers still have the final say:

```ts
text("This one line is red").color("#dc2626");
```

Use a theme for presentation-wide decisions and chainable modifiers for intentional exceptions.

The legacy `background` presentation option remains available. It overrides both the normal slide background and cover background, but a theme is the better choice when more than one visual token needs to change.
