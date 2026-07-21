#!/usr/bin/env node

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import process from "node:process";

const FRAMESEQ_VERSION = "^0.2.0";

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
      build: "frameseq build slides.ts",
      pdf: "frameseq pdf slides.ts",
      check: "tsc --noEmit",
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

slide({ name: "Cover" }).cover();
text("Build presentations like interfaces").hero();
text("TypeScript → HTML → PDF").subtitle();
text("Made with FrameSeq").author();

slide("First idea");
text("Explain the idea in one clear sentence.");
bullets(
  "No layout boilerplate",
  "LaTeX-compatible math",
  "Browser preview and PDF export",
);

slide("Equation");
text\`Inline math works: $E = mc^2$\`;
math\`\\int_0^\\infty e^{-x}\\,dx = 1\`;
`;

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
