#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const {
  cursorRegionAt,
  formatPropertyValue,
  frameSeqCursorCalls,
  regionsForOffset,
  selectionHasStructureBoundary,
} = require(resolve(packageRoot, "packages", "vscode-frameseq", "out", "regions.js"));

const source = `presentation("Regions");

slide("First").canvas();
text("at(\\\"ignored\\\")");
// at("comment")
at("diagram").row();
rect("A");
at("diagram/detail");
text("Detail");
at("diagram");
rect("B");
main();
text("Caption");

slide("Second").grid(2);
cell(1);
text("Result");
`;

const offset = (needle) => {
  const found = source.indexOf(needle);
  assert.notEqual(found, -1, `Missing fixture text: ${needle}`);
  return found;
};

assert.deepEqual(
  frameSeqCursorCalls(source).map(({ kind, value }) => ({ kind, value })),
  [
    { kind: "slide", value: "First" },
    { kind: "at", value: "diagram" },
    { kind: "at", value: "diagram/detail" },
    { kind: "at", value: "diagram" },
    { kind: "main", value: undefined },
    { kind: "slide", value: "Second" },
    { kind: "cell", value: "cell1" },
  ],
);
assert.equal(cursorRegionAt(source, offset('rect("A")')), "diagram");
assert.equal(cursorRegionAt(source, offset('text("Detail")')), "diagram/detail");
assert.equal(cursorRegionAt(source, offset('text("Caption")')), "main");
assert.equal(cursorRegionAt(source, offset('text("Result")')), "cell1");
assert.deepEqual(
  regionsForOffset(source, offset('text("Caption")')).map(({ path, visits }) => ({ path, visits })),
  [
    { path: "diagram", visits: 2 },
    { path: "diagram/detail", visits: 1 },
  ],
);
assert.equal(selectionHasStructureBoundary('text("A");\nrect("B");\n'), false);
assert.equal(selectionHasStructureBoundary('text("A");\nat("other");\n'), true);
assert.equal(formatPropertyValue("number", "12", "18.5"), "18.5");
assert.equal(formatPropertyValue("number", "12", "nope"), undefined);
assert.equal(formatPropertyValue("boolean", "true", "false"), "false");
assert.equal(formatPropertyValue("boolean", "true", "yes"), undefined);
assert.equal(formatPropertyValue("string", "'navy'", "it's blue"), "'it\\'s blue'");
assert.equal(formatPropertyValue("string", '"navy"', "blue"), '"blue"');

console.log("VS Code region test passed: at() context, region visits, selections, and property literals are safe.");
