#!/usr/bin/env node

import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(packageRoot, "dist");
const galleryOutput = resolve(distRoot, "gallery");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const examples = [
  { slug: "midnight", entry: resolve(packageRoot, "slides.ts") },
  { slug: "language", entry: resolve(packageRoot, "gallery", "slides", "language.slides.ts") },
  { slug: "minimal-academic", entry: resolve(packageRoot, "tests", "minimal-academic.slides.ts") },
  { slug: "beamer-madrid", entry: resolve(packageRoot, "tests", "beamer.slides.ts") },
  { slug: "blank", entry: resolve(packageRoot, "gallery", "slides", "blank.slides.ts") },
  { slug: "paper", entry: resolve(packageRoot, "gallery", "slides", "paper.slides.ts") },
  { slug: "beamer-default", entry: resolve(packageRoot, "gallery", "slides", "beamer-default.slides.ts") },
  {
    slug: "beamer-cambridge-us",
    entry: resolve(packageRoot, "gallery", "slides", "beamer-cambridge-us.slides.ts"),
  },
];

const relativeOutput = relative(distRoot, galleryOutput);
if (!relativeOutput || relativeOutput === ".." || relativeOutput.startsWith("../") || relativeOutput.startsWith("..\\")) {
  throw new Error(`Unsafe gallery output path: ${galleryOutput}`);
}

await rm(galleryOutput, { recursive: true, force: true });
await mkdir(resolve(galleryOutput, "examples"), { recursive: true });

for (const example of examples) {
  const output = resolve(galleryOutput, "examples", example.slug);
  const result = spawnSync(
    process.execPath,
    [cli, "build", example.entry, "--output", output],
    { cwd: packageRoot, encoding: "utf8", stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Could not build gallery example ${example.slug}`);
  }
}

await Promise.all([
  copyFile(resolve(packageRoot, "gallery", "index.html"), resolve(galleryOutput, "index.html")),
  copyFile(resolve(packageRoot, "gallery", "styles.css"), resolve(galleryOutput, "styles.css")),
  copyFile(resolve(packageRoot, "public", "favicon.svg"), resolve(galleryOutput, "favicon.svg")),
  writeFile(resolve(galleryOutput, ".nojekyll"), "", "utf8"),
]);

console.log(`FrameSeq Gallery built at ${galleryOutput}`);
