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
  "text",
  "bullets",
  "steps",
  "metric",
  "card",
  "group",
  "gridSection",
  "image",
  "code",
  "math",
  "typst",
  "typstFile",
  "latex",
  "latexFile",
  "cell",
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

console.log("Documentation test passed: common functions, signatures, parameters, returns, roles, entry links, and local links are present.");
