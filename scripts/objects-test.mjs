#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import JSZip from "jszip";
import puppeteer from "puppeteer";
import { parseBibtex } from "./bibtex.mjs";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const fixture = resolve(packageRoot, "scripts", "fixtures", "objects.slides.ts");
const output = resolve(packageRoot, "tmp", "objects-test");
const { Chart, Table, chartSvg, formatReference } = await import(pathToFileURL(resolve(packageRoot, "lib", "index.js")).href);

// Tables: the first row is the heading, and columns of quantities align right.
const table = Table([["Model", "Accuracy", "Latency"], ["Baseline", "91.2%", "18 ms"], ["Ours", "94.6%", "12 ms"]]);
assert.deepEqual(table.node.props.align, ["left", "right", "right"]);
assert.equal(table.node.props.header, 1);
assert.deepEqual(table.columnAlign("center").node.props.align, ["center", "right", "right"]);
assert.deepEqual(Table([["a", "1"], ["b", "2"]]).header(0).node.props.align, ["left", "right"]);
assert.throws(() => Table([]), /table\(\) expects rows/);

// Charts check their data where it is written.
assert.throws(() => Chart("radar", { a: 1 }), /does not know "radar"/);
assert.throws(() => Chart("bar", { labels: ["a", "b"], series: { s: [1] } }), /has 1 values for 2 labels/);
assert.throws(() => Chart("pie", { labels: ["a"], series: { s: [1], t: [2] } }), /one series/);
assert.throws(() => Chart("bar", { a: Number.NaN }), /values must be numbers/);
const frame = { width: 640, height: 360, fontSize: 18, foreground: "#111", muted: "#555", grid: "#ddd", palette: ["#2563eb", "#f59e0b"] };
const bars = chartSvg(Chart("bar", { a: 1, b: 2, c: 3 }).node.props, frame);
assert.equal((bars.match(/<rect /g) ?? []).length, 3, "one bar per value");
assert.match(bars, /viewBox="0 0 640 360"/);
assert.equal((chartSvg(Chart("pie", { a: 1, b: 1 }).node.props, frame).match(/<path /g) ?? []).length, 2);

// References read like a bibliography, from a .bib entry or from the text given.
const bibliography = parseBibtex(await readFile(resolve(packageRoot, "scripts", "fixtures", "references.bib"), "utf8"));
assert.equal(bibliography.goedel1931.title, "Über formal unentscheidbare Sätze");
assert.equal(bibliography.vaswani2017.booktitle, "Advances in Neural Information Processing Systems");
assert.equal(
  formatReference(bibliography.vaswani2017),
  "Vaswani, A., Shazeer, N., Parmar, N., & Uszkoreit, J. (2017). Attention Is All You Need. In Advances in Neural Information Processing Systems.",
);
assert.equal(formatReference(bibliography.knuth1984), "Knuth, D. E. (1992). Literate Programming. CSLI.");
assert.equal(formatReference("Written out."), "Written out.");

const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: packageRoot, encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
};
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// The deck checks clean: tables, charts, icons, and codes all measure inside their slides.
const checked = JSON.parse(run("check", fixture, "--json", "--strict").stdout);
assert.deepEqual(checked.summary, { slides: 5, errors: 0, warnings: 0 }, JSON.stringify(checked.issues, null, 2));

// A built presentation carries only the icons its source names.
const buildDirectory = resolve(output, "dist");
assert.equal(run("build", fixture, "--single-file", "--output", buildDirectory).status, 0);
const html = await readFile(resolve(buildDirectory, "index.html"), "utf8");
assert.match(html, /rocket:'<svg/, "the named icon must be in the build");
assert.ok(!html.includes("accessibility:'<svg"), "icons the source never names must stay out of the build");

const browser = await puppeteer.launch(puppeteerLaunchOptions());
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${pathToFileURL(resolve(buildDirectory, "index.html")).href}?print=1`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  await page.evaluate(() => document.fonts.ready);
  const found = await page.evaluate(() => {
    const slides = [...document.querySelectorAll(".frameseq-slide")];
    const named = (name) => document.querySelector(`[data-frameseq-name='${name}']`);
    const long = named("long");
    return {
      heading: [...named("results").querySelectorAll("th")].map((cell) => cell.textContent),
      alignment: [...named("results").querySelectorAll("tbody tr:first-child td")].map((cell) => cell.style.textAlign),
      bars: named("growth").querySelectorAll("svg rect").length,
      barLabels: [...named("growth").querySelectorAll("svg text")].map((label) => label.textContent).filter((label) => label.endsWith("%")),
      donutSlices: slides[1].querySelectorAll(".frameseq-chart")[1].querySelectorAll("svg path").length,
      icon: Boolean(named("rocket").querySelector("svg path, svg circle")),
      qr: named("code").querySelector("svg path")?.getAttribute("d")?.length ?? 0,
      text: slides[2].querySelector(".frameseq-body-copy").textContent,
      footnotes: [...slides[2].querySelectorAll(".frameseq-footnote")].map((note) => note.textContent),
      references: [...slides[4].querySelectorAll(".frameseq-reference")].map((item) => item.textContent),
      fitted: {
        size: Number.parseFloat(getComputedStyle(long).fontSize),
        fits: long.scrollHeight <= long.clientHeight + 1,
      },
    };
  });
  assert.deepEqual(found.heading, ["Model", "Accuracy", "Latency"]);
  assert.deepEqual(found.alignment, ["left", "right", "right"]);
  assert.equal(found.bars, 3);
  assert.deepEqual(found.barLabels.slice(-3), ["12%", "18%", "25%"]);
  assert.equal(found.donutSlices, 3);
  assert.ok(found.icon, "the icon must be drawn");
  assert.ok(found.qr > 200, "the QR code must be drawn");
  assert.equal(found.text, "Attention replaced recurrence [1], and proofs met their limits [2, 1]¹.");
  assert.deepEqual(found.footnotes, [
    "[1] Vaswani, A., Shazeer, N., Parmar, N., & Uszkoreit, J. (2017). Attention Is All You Need. In Advances in Neural Information Processing Systems.",
    "[2] Gödel, K. (1931). Über formal unentscheidbare Sätze. Monatshefte für Mathematik.",
    "¹ Two works, one footnote.",
  ]);
  assert.equal(found.references.length, 2, "references() lists the cited works, in citation order");
  assert.match(found.references[0], /^\[1\] Vaswani/);
  assert.match(found.references[1], /^\[2\] Gödel/);
  assert.ok(found.fitted.size < 21 && found.fitted.size >= 10.5, `fit() must shrink the paragraph, not ${found.fitted.size}px`);
  assert.ok(found.fitted.fits, "the fitted paragraph must fit its room");
} finally {
  await browser.close();
}

// PowerPoint gets an editable table and editable charts.
const pptxPath = resolve(output, "objects.pptx");
assert.equal(run("pptx", fixture, "--output", pptxPath).status, 0);
const pptx = await JSZip.loadAsync(await readFile(pptxPath));
const firstSlide = await pptx.file("ppt/slides/slide1.xml").async("string");
assert.ok(firstSlide.includes("<a:tbl>"), "the table must be a PowerPoint table");
assert.ok(firstSlide.includes("<a:t>94.6%</a:t>"), "the table's cells must be editable text");
assert.equal(Object.keys(pptx.files).filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name)).length, 3, "every chart must be a PowerPoint chart");

// Typst gets a native table and pictures of the drawings.
const typstPath = resolve(output, "objects.typ");
assert.equal(run("typst", fixture, "--output", typstPath).status, 0);
const typst = await readFile(typstPath, "utf8");
assert.match(typst, /#table\(\s*columns: 3,\s*align: \(left, right, right,\)/);
assert.match(typst, /table\.header\(\[#strong\[#text\("Model"\)\]\]/);
assert.equal((typst.match(/#image\("assets\/chart-/g) ?? []).length, 3);
assert.match(typst, /#image\("assets\/qr-[0-9a-f]+\.svg"/);
assert.match(typst, /#image\("assets\/icon-[0-9a-f]+\.svg", width: 48pt\)/);
assert.match(typst, /fit\(\) shrinks text to its room/);
// The generated source compiles, with MiTeX stood in for so no package has to be downloaded.
const compiled = NodeCompiler.create({ workspace: output }).plainSvg({
  mainFileContent: typst.replace(
    '#import "@preview/mitex:0.2.7": mi, mitex, mitext',
    "#let mi(source) = text(source)\n#let mitex(source) = text(source)\n#let mitext(source) = text(source)",
  ),
});
assert.match(compiled, /<svg/);

console.log("Objects test passed: tables, charts, QR codes, icons, fit(), citations, footnotes, references, .bib imports, and their HTML, PPTX, and Typst output.");
