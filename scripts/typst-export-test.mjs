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
assert.ok(result.warnings.some((warning) => warning.includes("text-blue-600")));
assert.ok(result.warnings.some((warning) => warning.includes("arrowheads")));

const compileSource = source.replace(
  '#import "@preview/mitex:0.2.7": mi, mitex, mitext',
  '#let mi(source) = text(source)\n#let mitex(source) = text(source)\n#let mitext(source) = text(source)',
);
const compilePath = resolve(testDirectory, "compile.typ");
await writeFile(compilePath, compileSource, "utf8");
const compiler = NodeCompiler.create({ workspace: testDirectory });
const svg = compiler.plainSvg({ mainFileContent: compileSource });
assert.match(svg, /<svg/);

console.log("Typst export test passed: pages, layouts, MiTeX mapping, native LaTeX tables, Typst fragments, shapes, notes, and syntax are valid.");
