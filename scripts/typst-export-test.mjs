#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import { exportTypst } from "./typst-export.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testDirectory = resolve(packageRoot, "tmp", "typst-export-test");
const entry = resolve(packageRoot, "scripts", "fixtures", "typst-export.slides.ts");
const output = resolve(testDirectory, "fixture.typ");

if (!testDirectory.startsWith(resolve(packageRoot, "tmp"))) {
  throw new Error(`Unsafe Typst export test path: ${testDirectory}`);
}

await rm(testDirectory, { recursive: true, force: true });
await mkdir(testDirectory, { recursive: true });

const result = await exportTypst({
  entry,
  requestedOutput: output,
  packageRoot,
  configFile: resolve(packageRoot, "vite.config.ts"),
});
const source = await readFile(output, "utf8");

assert.equal((source.match(/^#page\(/gm) ?? []).length, 4);
assert.match(source, /#import "@preview\/mitex:0\.2\.7": mi, mitex, mitext/);
assert.match(source, /#mi\("E = mc\^2"\)/);
assert.match(source, /#mitex\("\\\\int_0\^\\\\infty/);
assert.match(source, /#grid\(columns: \(40fr, 60fr,\)/);
assert.match(source, /#table\(columns: 2, \[A\], \[B\], \[C\], \[D\]\)/);
assert.match(source, /columns: \(auto, auto, auto,\)/);
assert.match(source, /align: \(left, right, right,\)/);
assert.match(source, /#mitext\("Model"\)/);
assert.match(source, /#mitext\("\\\\textbf\{94\.6\\\\%\}"\)/);
assert.match(source, /table\.cell\(colspan: 3\)\[#mitext\("Editable native cells"\)\]/);
assert.doesNotMatch(source, /assets\/latex-/);
assert.match(source, /#place\(top \+ left/);
assert.match(source, /#rect\(/);
assert.match(source, /#circle\(/);
assert.match(source, /#line\(start:/);
assert.match(source, /#text\("Typst export fixture"\)/);
assert.match(source, /\/\/ Speaker notes: Automatic title page and speaker note fixture\./);
assert.match(source, /#place\(bottom \+ left\)/);
// centerSelf() places the box itself, so the export centres the block rather than
// only the text inside it.
assert.match(source, /#align\(center\)\[#block\(width: 240pt\)/);
assert.ok(result.warnings.some((warning) => warning.includes("text-blue-600")));
// Arrowheads are drawn as polygons at the ends of their lines, editable like the rest.
assert.ok(!result.warnings.some((warning) => warning.includes("arrowheads")));
assert.match(source, /#line\(start: [^\n]*\]#place\(top \+ left\)\[#polygon\(fill: rgb\("#475569"\)/);
// A straight-edged shape is a polygon, a curved one a curve, each with its label in its room.
assert.match(source, /#polygon\(fill: rgb\("#[0-9a-f]{6}"\), stroke: \(paint: rgb\("#[0-9a-f]{6}"\)/);
assert.match(source, /#curve\(fill: rgb\("#[0-9a-f]{6}"\), stroke: [^\n]*curve\.cubic\(/);
assert.match(source, /curve\.close\(mode: "straight"\)/);
assert.match(source, /weight: "semibold", fill: rgb\("#[0-9a-f]{6}"\), size: [\d.]+pt\)\[#text\("Valid\?"\)\]/);
// A polygon is a polygon through its own corners, with its label over it.
const gate = source.match(/#polygon\(([^\]]*)\)\]#place\(top \+ left, dx: [^\n]*?#text\("Gate"\)/);
assert.ok(gate, "the polygon is drawn with its label");
assert.equal(gate[1].match(/\(-?[\d.]+pt, -?[\d.]+pt\)/g)?.length, 4);
// A connector through stops is a curve through its corners, ending in an arrowhead.
assert.match(source, /#curve\(stroke: \(paint: rgb\("#123456"\)[^\n]*?(?:curve\.line\([^\n]*?){3}\)\]#place\(top \+ left\)\[#polygon\(fill: rgb\("#123456"\)/);
// A panel is an outlined box with its title in the corner; what it places by coordinates moves
// back by its padding, since Typst places from inside the inset and the browser from outside it.
assert.match(source, /#text\("\(a\)"\)[^\n]*#text\("Encoder layer"\)/);
assert.match(source, /#place\(top \+ left, dx: -[\d.]+pt, dy: -[\d.]+pt\)\[#place\(top \+ left, dx: [\d.]+pt, dy: [\d.]+pt\)\[#rect\([^\n]*Inside/);
// A box's label takes its type: its weight, its colour, and its size.
assert.match(source, /#rect\([^\n]*\)\[#align\(center \+ horizon\)\[#text\(weight: "semibold", fill: rgb\("#[0-9a-f]{6}"\), size: [\d.]+pt\)\[#text\("Input"\)\]\]\]/);
// cells() is a grid of shaded boxes.
assert.match(source, /#grid\(columns: \([\d.]+pt, [\d.]+pt, [\d.]+pt,\)/);
// A dashed rect stays dashed.
assert.match(source, /#rect\([^\n]*stroke: \(paint: rgb\("#d97706"\), thickness: [\d.]+pt, dash: "dashed"\)/);
// A named elbow connector is resolved before export, with its label on the background.
assert.match(source, /#curve\(stroke: \(paint: [^\n]*curve\.move\([^\n]*curve\.line\(/);
assert.match(source, /\[#text\("yes"\)\]/);
// Words marked bold, in italics, or in a colour keep their marks.
assert.match(source, /#text\("Revenue "\)#text\(weight: "bold"\)\[#text\("grew"\)\]#text\(" "\)#text\(fill: rgb\("#dc2626"\)\)\[#text\("42%"\)\]#text\(" "\)#text\(style: "italic"\)\[#text\("since"\)\]#text\(" May"\)/);

const compileSource = source.replace(
  '#import "@preview/mitex:0.2.7": mi, mitex, mitext',
  '#let mi(source) = text(source)\n#let mitex(source) = text(source)\n#let mitext(source) = text(source)',
);
const compilePath = resolve(testDirectory, "compile.typ");
await writeFile(compilePath, compileSource, "utf8");
const compiler = NodeCompiler.create({ workspace: testDirectory });
const svg = compiler.plainSvg({ mainFileContent: compileSource });
assert.match(svg, /<svg/);

// Typst falls back per character too, so the CJK families must reach the export.
assert.match(
  source,
  /"Noto Sans CJK SC"|"Microsoft YaHei"|"PingFang SC"/,
  "The exported font tuple should carry the theme's CJK fallbacks",
);

console.log("Typst export test passed: pages, layouts, MiTeX mapping, native LaTeX tables, Typst fragments, shapes, notes, and syntax are valid.");
