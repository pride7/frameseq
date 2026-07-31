#!/usr/bin/env node

/**
 * Render docs/README.md from the shared navigation structure, so the documentation
 * home page and the Gallery sidebar cannot describe different documentation.
 * Run it with `npm run docs:index`; the documentation test fails when the committed
 * page and this renderer disagree.
 */
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { documentationGroups } from "./docs-structure.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function renderDocumentationIndex() {
  const intro = `# FrameSeq documentation

Three pages get a talk written: install FrameSeq, copy the page you need, then revise it. Everything else is here for the moment a slide asks for it.

1. [Getting started](getting-started.md) — a project, the first slides, a preview, an export.
2. [Recipes](recipes.md) — a complete slide for each page a talk needs, with the result beside it.
3. [Revising a talk](revising.md) — what a second draft costs, edit by edit.

You can also explore the [Live Gallery](https://pride7.github.io/frameseq/) or edit the [Online Playground](https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground) before installing anything.
`;

  // The first group is the reading path above; repeating it here would only add noise.
  const sections = documentationGroups.slice(1).map((group) => {
    const pages = group.pages.map((page) => {
      const target = page.source.startsWith("docs/")
        ? page.source.slice("docs/".length)
        : `../${page.source}`;
      return `- [${page.label}](${target}) — ${page.blurb}`;
    });
    return `## ${group.label}\n\n${group.summary}\n\n${pages.join("\n")}\n`;
  });

  return `${intro}\n${sections.join("\n")}\nThe documentation tracks the latest published FrameSeq release.\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeFile(resolve(packageRoot, "docs", "README.md"), renderDocumentationIndex(), "utf8");
  console.log(`Documentation index written: ${documentationGroups.length} groups.`);
}
