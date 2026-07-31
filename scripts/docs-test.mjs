import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

for (const category of [
  "## Start here",
  "## Write and design slides",
  "## Present and export",
  "## AI and advanced typesetting",
  "## Editor and tooling",
  "## Advanced and maintainer reference",
]) {
  assert.ok(docsIndex.includes(category), `Documentation category is missing: ${category}`);
}

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

console.log("Documentation test passed: common functions, signatures, parameters, returns, roles, recipes, entry links, and local links are present.");
