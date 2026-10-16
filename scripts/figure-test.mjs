#!/usr/bin/env node

// A figure for a paper: one canvas with no margins, printed at the width it has on the page, its
// type judged in printed points, and exported as a PDF of exactly that size or as a PNG picture.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const fixture = resolve(packageRoot, "scripts", "fixtures", "figure.slides.ts");
const output = resolve(packageRoot, "tmp", "figure-test");
const { figure, getActivePresentation } = await import(pathToFileURL(resolve(packageRoot, "lib", "index.js")).href);

// 1600 canvas units printed 170 mm wide: the paper follows the canvas, and nothing frames it.
const page = figure({ title: "Method", width: 1600, height: 800 });
const document = getActivePresentation();
assert.equal(document.node.props.figure, true);
assert.deepEqual(document.paper, { name: "170x85mm", width: 170, height: 85 });
assert.equal(document.canvasWidth, 1600);
assert.equal(document.canvasHeight, 800);
assert.equal(document.theme.spacing.slideX, "0px");
assert.equal(document.theme.spacing.slideY, "0px");
assert.equal(document.theme.chrome.titleBar, false);
assert.equal(document.theme.chrome.footer, false);
assert.equal(document.theme.chrome.slideNumber, false);
assert.equal(document.node.children.length, 1);
const classesUnder = (node) => [String(node.props.className ?? ""), ...node.children.flatMap(classesUnder)];
assert.ok(classesUnder(page.node).some((names) => /frameseq-layout-canvas/.test(names)), "the page is a canvas");
// One column of a two-column paper, in inches as well as millimetres.
figure({ width: 1200, height: 900, printWidth: "85mm" });
assert.deepEqual(getActivePresentation().paper, { name: "85x63.75mm", width: 85, height: 63.75 });
figure({ printWidth: "6.5in" });
assert.equal(getActivePresentation().paper.width, 165.1);
assert.throws(() => figure({ printWidth: "wide" }), /figure\(\) expects printWidth as a length such as "170mm"/);
assert.throws(() => figure({ width: 0 }), /figure\(\) needs a positive width and height/);

const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: packageRoot, encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
};

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Type is judged by the points it prints at in the paper: 6 pt is the smallest that reads.
const report = JSON.parse(run("check", fixture, "--json").stdout);
assert.deepEqual(report.canvas, { width: 1600, height: 800, paper: "170x85mm" });
const small = report.issues.filter((issue) => issue.rule === "font-too-small");
assert.equal(small.length, 1, `only the small label is reported: ${JSON.stringify(small.map((issue) => issue.element.text))}`);
assert.equal(small[0].element.source.line, 5);
assert.equal(small[0].details.printedPoints, 4.2);
assert.match(small[0].message, /Font size 14px \(4pt printed\) is below the recommended 19\.9px \(6pt printed\) minimum/);

// The PDF is one page of exactly the size the figure prints at.
const pdfPath = resolve(output, "figure.pdf");
assert.equal(run("pdf", fixture, "--output", pdfPath).status, 0);
const pdf = (await readFile(pdfPath)).toString("latin1");
const boxes = [...pdf.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)];
assert.equal(boxes.length, 1);
assert.ok(Math.abs(Number(boxes[0][1]) - (170 * 72) / 25.4) < 0.5, `the page is 170 mm wide, not ${boxes[0][1]} pt`);
assert.ok(Math.abs(Number(boxes[0][2]) - (85 * 72) / 25.4) < 0.5, `the page is 85 mm high, not ${boxes[0][2]} pt`);

// The PNG is the canvas at the scale asked for: twice its size unless --scale says otherwise.
const pngSize = async (path) => {
  const header = await readFile(path);
  assert.equal(header.toString("latin1", 1, 4), "PNG");
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
};
const pngPath = resolve(output, "figure.png");
assert.equal(run("png", fixture, "--output", pngPath).status, 0);
assert.deepEqual(await pngSize(pngPath), { width: 3200, height: 1600 });
const largePath = resolve(output, "figure-3x.png");
assert.equal(run("png", fixture, "--output", largePath, "--scale", "3").status, 0);
assert.deepEqual(await pngSize(largePath), { width: 4800, height: 2400 });
const refused = run("png", fixture, "--scale", "0");
assert.notEqual(refused.status, 0);
assert.match(refused.stderr, /--scale takes a number above 0 and at most 8/);

console.log("Figure test passed: paper from the print width, no margins, printed-point type checks, and PDF and PNG at size.");
