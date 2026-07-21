# Getting started

## Create a project

```bash
npm create frameseq@latest my-talk
cd my-talk
npm install
npm run dev
```

The generated project contains a `slides.ts` document and TypeScript configuration for FrameSeq's global authoring commands.

```text
my-talk/
├─ package.json
├─ slides.ts
└─ tsconfig.json
```

## Write the presentation

```ts
presentation("My Talk");

slide({ name: "Cover" }).cover();
text("Build presentations like interfaces").hero();
text("TypeScript → HTML → PDF").subtitle();
text("Your name").author();

slide("First idea");
text("Explain one idea per page.");
bullets(
  "Linear source code",
  "UI-style modifiers",
  "Browser preview and PDF export",
);

slide("Equation");
text`Inline math: $E = mc^2$`;
math`\int_0^\infty e^{-x}\,dx = 1`;
```

The file needs no framework import, deck variable, wrapper, or default export. FrameSeq injects the common document commands into the entry file and exports the active presentation.

## Preview

```bash
npm run dev
```

The browser opens automatically and updates when the source file changes. Use Arrow keys, Page Up, Page Down, or Space to navigate. Incremental content created with `steps()` or `showAt()` is revealed before navigation continues to the next page.

## Build static HTML

```bash
npm run build
```

The generated static presentation is written to `dist/` and can be hosted on a static web server.

## Export PDF

```bash
npm run pdf
```

The default output is `output/pdf/slides.pdf`. Choose another path with the CLI directly:

```bash
npx frameseq pdf slides.ts --output output/my-talk.pdf
```

## Add FrameSeq to an existing project

```bash
npm install --save-dev @pride7/frameseq
npx frameseq new talk.slides.ts
npx frameseq dev talk.slides.ts
```

For editor support in a zero-import slide file, add the global declarations to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@pride7/frameseq/globals"]
  },
  "include": ["*.slides.ts"]
}
```

Continue with the [document model](document-model.md).
