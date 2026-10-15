#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import JSZip from "jszip";
import puppeteer from "puppeteer";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const fixture = resolve(packageRoot, "scripts", "fixtures", "poster.slides.ts");
const output = resolve(packageRoot, "tmp", "poster-test");
const { Slides, canvasLength, paperDimensions } = await import(pathToFileURL(resolve(packageRoot, "lib", "index.js")).href);

// Paper sizes: named sheets stand upright, written sizes stand as written, and both turn on request.
assert.deepEqual(paperDimensions("A0"), { name: "A0", width: 841, height: 1189 });
assert.deepEqual(paperDimensions("A3", "landscape"), { name: "A3", width: 420, height: 297 });
assert.deepEqual(paperDimensions("36x48in"), { name: "36x48in", width: 914.4, height: 1219.2 });
assert.throws(() => paperDimensions("B7"), /does not know the paper size "B7"\. Use one of A0, A1/);
// Printed measurements become canvas pixels at the sheet's scale, wherever they appear in a value.
assert.equal(canvasLength("12mm", 2), "24px");
assert.equal(canvasLength("calc(100% - 1in)", 1), "calc(100% - 25.4px)");
assert.equal(canvasLength("72pt", 1), "25.4px");

// The canvas has 1600 units across the short side, and the long side follows the paper.
const portrait = Slides({ size: "A0" });
assert.equal(portrait.canvasWidth, 1600);
assert.equal(portrait.canvasHeight, 2262);
const landscape = Slides({ size: "A0", orientation: "landscape" });
assert.equal(landscape.canvasWidth, 2262);
assert.equal(landscape.canvasHeight, 1600);
assert.equal(Slides({ size: "A1", width: 2000 }).canvasHeight, 2832);
assert.equal(Slides("Screen").paper, undefined);

const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: packageRoot, encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
};

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// The check knows the paper and judges type by its printed size.
const checked = run("check", fixture, "--json");
const report = JSON.parse(checked.stdout);
assert.deepEqual(report.canvas, { width: 1600, height: 2262, paper: "A0" });
const small = report.issues.find((issue) => issue.rule === "font-too-small");
assert.ok(small, "printed 12 pt type on an A0 sheet must be reported");
assert.equal(small.details.printedPoints, 12);
assert.match(small.message, /\(12pt printed\) is below the recommended 14px \(21pt printed\) minimum/);
assert.equal(small.element.source.line, 15);

// PDF, PowerPoint, and Typst all print one page at the paper's size.
const pdfPath = resolve(output, "poster.pdf");
assert.equal(run("pdf", fixture, "--output", pdfPath).status, 0);
const pdf = (await readFile(pdfPath)).toString("latin1");
const boxes = [...pdf.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)];
assert.equal(boxes.length, 1, "a poster is one page");
const millimetres = (points) => Math.round(Number(points) / 72 * 25.4);
assert.deepEqual([millimetres(boxes[0][1]), millimetres(boxes[0][2])], [841, 1189]);

const pptxPath = resolve(output, "poster.pptx");
assert.equal(run("pptx", fixture, "--output", pptxPath).status, 0);
const presentationXml = await (await JSZip.loadAsync(await readFile(pptxPath))).file("ppt/presentation.xml").async("string");
const size = presentationXml.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/);
assert.deepEqual([Math.round(Number(size[1]) / 36000), Math.round(Number(size[2]) / 36000)], [841, 1189]);

const typstPath = resolve(output, "poster.typ");
assert.equal(run("typst", fixture, "--output", typstPath).status, 0);
const typst = await readFile(typstPath, "utf8");
assert.match(typst, /width: 2383\.9\d*pt/);
assert.match(typst, /Poster fixture/, "the poster's title band must reach the Typst page");
// The generated source compiles, with MiTeX stood in for so no package has to be downloaded.
const compiled = NodeCompiler.create({ workspace: output }).plainSvg({
  mainFileContent: typst.replace(
    '#import "@preview/mitex:0.2.7": mi, mitex, mitext',
    "#let mi(source) = text(source)\n#let mitex(source) = text(source)\n#let mitext(source) = text(source)",
  ),
});
assert.match(compiled, /<svg/);

// In the browser the band opens the page, and mm() measures printed millimetres.
const buildDirectory = resolve(output, "dist");
assert.equal(run("build", fixture, "--single-file", "--output", buildDirectory).status, 0);
const browser = await puppeteer.launch(puppeteerLaunchOptions());
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  await page.goto(`${pathToFileURL(resolve(buildDirectory, "index.html")).href}?print=1`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  const measured = await page.evaluate(() => {
    const header = document.querySelector(".frameseq-theme-header");
    const ruler = document.querySelector("[data-frameseq-name='ruler']");
    const body = document.querySelector(".frameseq-slide-body");
    return {
      header: header?.textContent,
      headerFirst: header === header?.parentElement?.firstElementChild,
      bodyBelowHeader: body.getBoundingClientRect().top >= header.getBoundingClientRect().bottom,
      rulerWidth: ruler.getBoundingClientRect().width,
      printWidth: getComputedStyle(document.documentElement).getPropertyValue("--slide-print-width"),
    };
  });
  assert.match(measured.header, /Poster fixture.*Printed at the paper's size.*Ada Lovelace.*Analytical Engines/);
  assert.ok(measured.headerFirst && measured.bodyBelowHeader, "the band takes its room above the content");
  assert.ok(Math.abs(measured.rulerWidth - 100 * 1600 / 841) < 0.5, `mm(100) must be 100 printed millimetres, not ${measured.rulerWidth}px`);
  assert.ok(Math.abs(Number.parseFloat(measured.printWidth) - 841 * 96 / 25.4) < 0.5);
} finally {
  await browser.close();
}

console.log("Poster test passed: paper sizes, canvas units, mm() and pt(), the title band, printed-size checks, and A0 PDF, PPTX, and Typst pages.");
