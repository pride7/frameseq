import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { documentationGroups, documentationPages } from "./docs-structure.mjs";
import { renderDocumentationIndex } from "./docs-index.mjs";
import { translationStatus } from "./docs-translation.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const guidePath = resolve(packageRoot, "docs", "function-guide.md");
const docsIndexPath = resolve(packageRoot, "docs", "README.md");
const readmePath = resolve(packageRoot, "README.md");
const guide = await readFile(guidePath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");
const readme = await readFile(readmePath, "utf8");

const documentedFunctions = [
  "presentation",
  "slide",
  "note",
  "text",
  "bullets",
  "steps",
  "metric",
  "card",
  "group",
  "ref",
  "gridSection",
  "image",
  "code",
  "math",
  "typst",
  "typstFile",
  "latex",
  "latexFile",
  "cell",
  "at",
  "main",
  "gap",
  "rect",
  "circle",
  "line",
  "defineTheme",
];

for (const name of documentedFunctions) {
  assert.ok(guide.includes(`### \`${name}()\``), `${name}() is missing`);
}

assert.ok(guide.includes("### `left()` and `right()`"), "left() and right() are missing");
assert.ok(guide.includes("### `.as()`"), ".as() is missing");
assert.ok(guide.includes("### `.from()` and `.to()`"), ".from() and .to() are missing");
assert.ok(
  guide.includes("### `.rightOf()`, `.leftOf()`, `.above()`, and `.below()`"),
  "Relative placement modifiers are missing",
);
assert.ok(
  guide.includes("### `.centerOn()`, `.alignTop()`, and `.alignLeft()`"),
  "Alignment modifiers are missing",
);

for (const method of [
  "notes",
  "allowEmpty",
  "showAt",
  "cover",
  "split",
  "grid",
  "center",
  "fullBleed",
  "canvas",
]) {
  assert.ok(guide.includes(`### \`.${method}()\``), `.${method}() is missing`);
}

for (const role of [
  "body",
  "title",
  "hero",
  "subtitle",
  "author",
  "eyebrow",
  "lead",
  "caption",
  "quote",
]) {
  assert.ok(guide.includes(`\`.${role}()\``), `Text role .${role}() is missing`);
}

assert.match(guide, /does not calculate data/i);
assert.match(guide, /every following object becomes one cell/i);
assert.equal(guide.split("**Signature**").length - 1 >= 25, true, "Function entries need readable signatures");
assert.ok(guide.includes("**Parameters**"), "Function entries need parameter documentation");
assert.ok(guide.includes("**Returns**"), "Function entries need return-value documentation");
assert.ok(docsIndex.includes("[Function reference](function-guide.md)"));
assert.ok(readme.includes("https://pride7.github.io/frameseq/docs/function-guide.html"));

// A release replaces the Unreleased heading, and a replacement that only matched the
// first one left an orphan section whose entries belonged to no release at all.
const changelog = await readFile(resolve(packageRoot, "CHANGELOG.md"), "utf8");
const unreleased = changelog.match(/^## \[Unreleased\]/gm) ?? [];
assert.ok(unreleased.length <= 1, "The changelog has more than one Unreleased section");
const firstSection = changelog.match(/^## \[[^\]]+\]/m)?.[0];
if (unreleased.length === 1) {
  assert.equal(firstSection, "## [Unreleased]", "Unreleased should be the first section");
}

// One structure describes the navigation; the home page is rendered from it and the
// Gallery sidebar is built from it, so neither can drift from the other.
assert.equal(
  docsIndex,
  renderDocumentationIndex(),
  "docs/README.md is out of date; run npm run docs:index",
);

for (const group of documentationGroups) {
  assert.ok(group.label && group.summary, "Every documentation group needs a label and a summary");
  assert.ok(group.pages.length > 0, `Documentation group ${group.label} is empty`);
  for (const page of group.pages) {
    assert.ok(page.blurb, `${page.slug} needs a one-line description in the navigation`);
    assert.ok(existsSync(resolve(packageRoot, page.source)), `Missing page source: ${page.source}`);
  }
}

// The reading path comes first, and reference material comes last.
assert.equal(documentationGroups[0].label, "Start");
assert.equal(documentationGroups.at(-1).label, "Reference");
assert.deepEqual(
  documentationGroups[0].pages.map((page) => page.slug),
  ["index", "getting-started", "recipes", "revising"],
  "The reading path should be install, write, revise",
);

// The Chinese reading path must still say what the English pages say. Each translation
// records the hash of the source it was written from; a changed source fails here.
assert.equal(
  await readFile(resolve(packageRoot, "docs", "zh", "README.md"), "utf8"),
  renderDocumentationIndex("zh"),
  "docs/zh/README.md is out of date; run npm run docs:index",
);

const translations = await translationStatus("zh");
assert.ok(translations.length >= 3, "The reading path should be translated");
for (const page of translations) {
  assert.equal(
    page.declaredSource,
    page.english,
    `${page.translated} should declare which page it translates`,
  );
  if (page.admittedStale) continue;
  assert.equal(
    page.recorded,
    page.expected,
    `${page.english} changed after ${page.translated} was written. `
    + "Update the translation, then run npm run docs:stamp. To ship without translating "
    + "it yet, record sha256:stale and the page will tell readers it may be behind",
  );
}

// A page that exists but is not in the navigation cannot be found by a reader.
const navigated = new Set(documentationPages
  .filter((page) => page.source.startsWith("docs/"))
  .map((page) => basename(page.source)));
const present = (await readdir(resolve(packageRoot, "docs")))
  .filter((file) => file.endsWith(".md"));
for (const file of present) {
  assert.ok(navigated.has(file), `docs/${file} is missing from scripts/docs-structure.mjs`);
}
assert.equal(navigated.size, present.length);

for (const file of [guidePath, docsIndexPath]) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(?:https?:|#)/.test(target)) continue;
    const path = target.split("#", 1)[0];
    assert.ok(existsSync(resolve(dirname(file), path)), `Broken link in ${file}: ${target}`);
  }
}

// The recipes page claims every snippet comes from a deck that the layout checker
// accepts, so each one must actually appear in that deck.
const recipes = await readFile(resolve(packageRoot, "docs", "recipes.md"), "utf8");
const deck = await readFile(
  resolve(packageRoot, "gallery", "slides", "recipes.slides.ts"),
  "utf8",
);
const normalise = (source) => source
  .split("\n")
  .map((line) => line.trimEnd())
  .filter((line) => line.trim().length > 0)
  .join("\n");
const deckSource = normalise(deck);
const recipeBlocks = [...recipes.matchAll(/```ts\n([\s\S]*?)```/g)].map((match) => match[1]);

assert.ok(recipeBlocks.length >= 10, "The recipes page should carry a recipe for each slide");
assert.equal(
  (deck.match(/^slide\(/gm) ?? []).length,
  recipeBlocks.length,
  "Every slide in the recipes deck should appear on the recipes page, and the other way round",
);
for (const block of recipeBlocks) {
  const snippet = normalise(block);
  assert.ok(
    deckSource.includes(snippet),
    `A recipe is missing from gallery/slides/recipes.slides.ts: ${snippet.split("\n")[0]}`,
  );
}

// Code is not translated, so the Chinese recipes must quote the same deck.
const chineseRecipes = await readFile(resolve(packageRoot, "docs", "zh", "recipes.md"), "utf8");
const chineseBlocks = [...chineseRecipes.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]);
assert.equal(chineseBlocks.length, recipeBlocks.length);
for (const block of chineseBlocks) {
  assert.ok(
    deckSource.includes(normalise(block)),
    "A Chinese recipe is missing from gallery/slides/recipes.slides.ts",
  );
}


console.log("Documentation test passed: navigation structure, common functions, signatures, parameters, returns, roles, recipes, and links.");
