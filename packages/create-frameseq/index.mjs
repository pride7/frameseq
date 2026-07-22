#!/usr/bin/env node

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import process from "node:process";

const FRAMESEQ_VERSION = "^0.13.1";

function projectName(directory) {
  const name = basename(directory)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name || "frameseq-talk";
}

function presentationTitle(directory) {
  return basename(directory)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function ensureEmpty(directory) {
  await mkdir(directory, { recursive: true });
  const entries = await readdir(directory);
  if (entries.length > 0) {
    throw new Error(`Target directory is not empty: ${directory}`);
  }
}

const targetArgument = process.argv.slice(2).find((argument) => !argument.startsWith("-"));
const targetDirectory = resolve(process.cwd(), targetArgument ?? "frameseq-talk");

try {
  await ensureEmpty(targetDirectory);

  const packageJson = {
    name: projectName(targetDirectory),
    version: "0.0.0",
    private: true,
    type: "module",
    scripts: {
      dev: "frameseq dev slides.ts",
      present: "frameseq dev slides.ts --remote",
      build: "frameseq build slides.ts",
      "build:single": "frameseq build slides.ts --single-file",
      pdf: "frameseq pdf slides.ts",
      pptx: "frameseq pptx slides.ts",
      check: "tsc --noEmit && frameseq check slides.ts",
    },
    devDependencies: {
      "@pride7/frameseq": FRAMESEQ_VERSION,
      typescript: "^5.8.3",
    },
  };

  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      strict: true,
      noEmit: true,
      types: ["@pride7/frameseq/globals"],
    },
    include: ["*.slides.ts", "slides.ts"],
  };

  const slides = `presentation(${JSON.stringify(presentationTitle(targetDirectory))});

slide().cover();
text("Build presentations like interfaces").hero();
text("TypeScript → HTML → PDF → PPTX").subtitle();
text("Made with FrameSeq").author();

slide("First idea")
  .notes("Introduce the main idea and pause before the supporting points.");
text("Explain the idea in one clear sentence.")
  .style("text-[30px] font-semibold tracking-tight text-[#0ea5e9]");
bullets(
  "No layout boilerplate",
  "LaTeX-compatible math",
  "Browser preview, PDF, and PowerPoint export",
);

slide("Equation");
text\`Inline math works: $E = mc^2$\`;
math\`\\int_0^\\infty e^{-x}\\,dx = 1\`;
`;

  const pagesWorkflow = `name: Deploy FrameSeq presentation

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run build
      - uses: actions/configure-pages@v6
      - uses: actions/upload-pages-artifact@v5
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v5
`;

  await mkdir(resolve(targetDirectory, ".github", "workflows"), { recursive: true });

  await Promise.all([
    writeFile(
      resolve(targetDirectory, "package.json"),
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(targetDirectory, "tsconfig.json"),
      `${JSON.stringify(tsconfig, null, 2)}\n`,
      "utf8",
    ),
    writeFile(resolve(targetDirectory, "slides.ts"), slides, "utf8"),
    writeFile(
      resolve(targetDirectory, ".github", "workflows", "pages.yml"),
      pagesWorkflow,
      "utf8",
    ),
    writeFile(
      resolve(targetDirectory, ".gitignore"),
      "node_modules/\ndist/\noutput/\n*.log\n",
      "utf8",
    ),
  ]);

  const relativeTarget = targetArgument ?? "frameseq-talk";
  console.log(`Created FrameSeq project in ${targetDirectory}\n
Next steps:
  cd ${relativeTarget}
  npm install
  npm run dev`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
