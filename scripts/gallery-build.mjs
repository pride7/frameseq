#!/usr/bin/env node

import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { marked } from "marked";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(packageRoot, "dist");
const galleryOutput = resolve(distRoot, "gallery");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const documentationGroups = [
  {
    label: "Start",
    pages: [
      { slug: "index", source: "docs/README.md", label: "Documentation home" },
      { slug: "getting-started", source: "docs/getting-started.md", label: "Getting started" },
      { slug: "function-guide", source: "docs/function-guide.md", label: "Function reference" },
    ],
  },
  {
    label: "Write and design",
    pages: [
      { slug: "document-model", source: "docs/document-model.md", label: "Document model" },
      { slug: "content", source: "docs/content.md", label: "Content" },
      { slug: "layout", source: "docs/layout.md", label: "Layout" },
      { slug: "styling", source: "docs/styling.md", label: "Styling" },
      { slug: "themes", source: "docs/themes.md", label: "Themes" },
      { slug: "shapes", source: "docs/shapes.md", label: "Shapes and connectors" },
    ],
  },
  {
    label: "Present and export",
    pages: [
      { slug: "presenter", source: "docs/presenter.md", label: "Presenter and remote" },
      { slug: "deployment", source: "docs/deployment.md", label: "Deploy HTML" },
      { slug: "pptx", source: "docs/pptx.md", label: "Export PowerPoint" },
    ],
  },
  {
    label: "AI and typesetting",
    pages: [
      { slug: "ai-generation", source: "docs/ai-generation.md", label: "Generate with AI" },
      { slug: "layout-checks", source: "docs/layout-checks.md", label: "Layout checks" },
      { slug: "typst", source: "docs/typst.md", label: "Typst integration" },
      { slug: "latex", source: "docs/latex.md", label: "LaTeX integration" },
    ],
  },
  {
    label: "Editor and tools",
    pages: [
      { slug: "vscode", source: "docs/vscode.md", label: "VS Code extension" },
      { slug: "cli", source: "docs/cli.md", label: "CLI reference" },
    ],
  },
  {
    label: "Advanced",
    pages: [
      { slug: "api-reference", source: "docs/api-reference.md", label: "API reference" },
      { slug: "advanced", source: "docs/advanced.md", label: "Advanced composition" },
      { slug: "changelog", source: "CHANGELOG.md", label: "Changelog" },
      { slug: "releasing", source: "docs/releasing.md", label: "Release automation" },
    ],
  },
];
const examples = [
  { slug: "midnight", entry: resolve(packageRoot, "slides.ts") },
  { slug: "language", entry: resolve(packageRoot, "gallery", "slides", "language.slides.ts") },
  { slug: "ai-research", entry: resolve(packageRoot, "gallery", "slides", "ai-research.slides.ts") },
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

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function rewriteMarkdownLinks(source) {
  return source.replace(/\]\(([^)]+)\)/g, (match, rawTarget) => {
    if (/^(?:https?:|mailto:|#)/.test(rawTarget)) return match;
    const [path, fragment] = rawTarget.split("#", 2);
    if (!path.toLowerCase().endsWith(".md")) return match;
    const name = basename(path, ".md").toLowerCase();
    const slug = name === "readme"
      ? "index"
      : name === "changelog"
        ? "changelog"
        : name;
    return `](${slug}.html${fragment ? `#${fragment}` : ""})`;
  });
}

function headingSlug(value) {
  return value
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "and")
    .replaceAll("&quot;", "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function addHeadingIds(html) {
  const used = new Map();
  return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_match, level, content) => {
    const base = headingSlug(content) || "section";
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    return `<h${level} id="${id}">${content}<a class="heading-anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`;
  });
}

function documentationNavigation(activeSlug) {
  return documentationGroups.map((group) => `
    <section class="docs-nav-group">
      <h2>${escapeHtml(group.label)}</h2>
      ${group.pages.map((page) => `
        <a${page.slug === activeSlug ? ' class="is-active" aria-current="page"' : ""} href="${page.slug}.html">${escapeHtml(page.label)}</a>
      `).join("")}
    </section>
  `).join("");
}

function documentationPage({ slug, label, source }, content) {
  const rendered = addHeadingIds(marked.parse(rewriteMarkdownLinks(content), { gfm: true }));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f5f2ea" />
    <meta name="description" content="${escapeHtml(label)} — FrameSeq documentation." />
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="./styles.css" />
    <title>${escapeHtml(label)} — FrameSeq docs</title>
  </head>
  <body>
    <header class="docs-header">
      <a class="docs-brand" href="../" aria-label="FrameSeq Gallery home">
        <span class="docs-brand-mark" aria-hidden="true"></span>
        <span>FrameSeq</span>
      </a>
      <nav aria-label="Documentation navigation">
        <a href="index.html">Docs</a>
        <a href="../">Gallery</a>
        <a href="https://github.com/pride7/frameseq">GitHub <span aria-hidden="true">↗</span></a>
      </nav>
    </header>
    <div class="docs-shell">
      <aside class="docs-sidebar" aria-label="Documentation sections">
        ${documentationNavigation(slug)}
      </aside>
      <main class="docs-main">
        <article class="docs-article">${rendered}</article>
        <footer class="docs-footer">
          <span>FrameSeq documentation</span>
          <a href="https://github.com/pride7/frameseq/blob/main/${source}">Edit this page on GitHub ↗</a>
        </footer>
      </main>
    </div>
  </body>
</html>`;
}

const relativeOutput = relative(distRoot, galleryOutput);
if (!relativeOutput || relativeOutput === ".." || relativeOutput.startsWith("../") || relativeOutput.startsWith("..\\")) {
  throw new Error(`Unsafe gallery output path: ${galleryOutput}`);
}

await rm(galleryOutput, { recursive: true, force: true });
await mkdir(resolve(galleryOutput, "examples"), { recursive: true });
await mkdir(resolve(galleryOutput, "docs"), { recursive: true });

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

for (const page of documentationGroups.flatMap((group) => group.pages)) {
  const markdown = await readFile(resolve(packageRoot, page.source), "utf8");
  await writeFile(
    resolve(galleryOutput, "docs", `${page.slug}.html`),
    documentationPage(page, markdown),
    "utf8",
  );
}

await Promise.all([
  copyFile(resolve(packageRoot, "gallery", "index.html"), resolve(galleryOutput, "index.html")),
  copyFile(resolve(packageRoot, "gallery", "styles.css"), resolve(galleryOutput, "styles.css")),
  copyFile(resolve(packageRoot, "gallery", "docs.css"), resolve(galleryOutput, "docs", "styles.css")),
  copyFile(resolve(packageRoot, "public", "favicon.svg"), resolve(galleryOutput, "favicon.svg")),
  copyFile(resolve(packageRoot, "llms.txt"), resolve(galleryOutput, "llms.txt")),
  writeFile(resolve(galleryOutput, ".nojekyll"), "", "utf8"),
]);

console.log(`FrameSeq Gallery built at ${galleryOutput}`);
