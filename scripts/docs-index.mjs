#!/usr/bin/env node

/**
 * Render the documentation home page in each language from the shared navigation
 * structure, so the home page and the Gallery sidebar cannot describe different
 * documentation. Run it with `npm run docs:index`; the documentation test fails when
 * a committed page and this renderer disagree.
 */
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { localisedGroups } from "./docs-structure.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const intros = {
  en: `# FrameSeq documentation

Three pages get a talk written: install FrameSeq, copy the page you need, then revise it. Everything else is here for the moment a slide asks for it.

1. [Getting started](getting-started.md) — a project, the first slides, a preview, an export.
2. [Recipes](recipes.md) — a complete slide for each page a talk needs, with the result beside it.
3. [Revising a talk](revising.md) — what a second draft costs, edit by edit.

You can also explore the [Live Gallery](https://pride7.github.io/frameseq/) or edit the [Online Playground](https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground) before installing anything.

A Chinese translation of this reading path is at [中文文档](zh/README.md).
`,
  zh: `# FrameSeq 文档

三页就能把一场讲演写出来:装上 FrameSeq、抄一页你要的、然后改。其余页面是等某一页真的需要时再看的。

1. [快速上手](getting-started.md) —— 建项目、写头几页、预览、导出。
2. [配方](recipes.md) —— 讲演需要的每一种页面,各一页完整源码,配渲染结果。
3. [修改一场讲演](revising.md) —— 第二稿的每一处改动值多少行。

也可以先看 [在线 Gallery](https://pride7.github.io/frameseq/),或者在 [在线 Playground](https://stackblitz.com/fork/github/pride7/frameseq/tree/main/examples/playground?file=slides.ts&startScript=dev&title=FrameSeq%20Playground) 里直接改,什么都不用装。

标注 (English) 的页面尚未翻译,链接指向英文原页。
`,
};

const footers = {
  en: "The documentation tracks the latest published FrameSeq release.\n",
  zh: "文档跟随最新发布的 FrameSeq 版本。\n",
};

export function renderDocumentationIndex(locale = "en") {
  // The first group is the reading path in the intro; repeating it here would add noise.
  const sections = localisedGroups(locale).slice(1).map((group) => {
    const pages = group.pages.map((page) => {
      const english = page.source.startsWith("docs/")
        ? page.source.slice("docs/".length)
        : `../${page.source}`;
      const target = locale === "en" || page.translated ? english : `../${english}`;
      const marker = locale === "en" || page.translated ? "" : " (English)";
      return `- [${page.label}${marker}](${target}) — ${page.blurb}`;
    });
    return `## ${group.label}\n\n${group.summary}\n\n${pages.join("\n")}\n`;
  });

  return `${intros[locale]}\n${sections.join("\n")}\n${footers[locale]}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeFile(resolve(packageRoot, "docs", "README.md"), renderDocumentationIndex("en"), "utf8");
  await writeFile(
    resolve(packageRoot, "docs", "zh", "README.md"),
    renderDocumentationIndex("zh"),
    "utf8",
  );
  console.log("Documentation index written in English and Chinese.");
}
