#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import puppeteer from "puppeteer";
import { createServer } from "vite";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";
import { applySourceEdits, markEdits, sourceMarks } from "./source-marks.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function marked(source) {
  const marks = sourceMarks(source);
  return applySourceEdits(source, marks.flatMap(markEdits));
}

function commands(source) {
  return sourceMarks(source).map((mark) => source.slice(mark.start, mark.end));
}

// A chain is marked once, as a whole, and the mark reports where the chain begins.
{
  const source = 'slide("Why").split("40:60");\ntext("Lead copy").lead().size(32);\n';
  const marks = sourceMarks(source);
  assert.deepEqual(marks.map((mark) => mark.line), [1, 2]);
  assert.deepEqual(marks.map((mark) => mark.column), [1, 1]);
  assert.deepEqual(commands(source), ['slide("Why").split("40:60")', 'text("Lead copy").lead().size(32)']);
  assert.match(marked(source), /^__frameSeqMark\(slide\("Why"\)\.split\("40:60"\), \{"line":1,/);
}

// Nested commands each get their own mark, and cursor moves get none.
{
  const source = 'at("cell0/now");\ncell(1);\ngroup(rect("A"), circle("B")).gap(12);\n';
  assert.deepEqual(commands(source), ['group(rect("A"), circle("B")).gap(12)', 'rect("A")', 'circle("B")']);
}

// Tagged templates are commands too.
{
  const source = "text`Every $x$ counts`.caption();\nmath`e^{i\\pi}`;\n";
  assert.deepEqual(commands(source), ["text`Every $x$ counts`.caption()", "math`e^{i\\pi}`"]);
}

// Marks nest without partially overlapping, so the wrapped file still parses.
{
  const source = [
    'presentation({ title: "Marks" });',
    'slide("Diagram").canvas();',
    'rect("Encoder").as("encoder").position({ x: 80, y: 90 }).width(240);',
    'gridSection(2, group(text("A")), card("B", "Body"));',
    'for (const label of ["one", "two"]) bullets(label);',
    "",
  ].join("\n");
  const output = marked(source);
  const parsed = ts.createSourceFile("marked.ts", output, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.deepEqual(parsed.parseDiagnostics ?? [], [], "Wrapping a slide file must keep it parseable");
  // Wrappers are inline, so every command still reports the line it was written on.
  assert.equal(output.split("\n").length, source.split("\n").length);
  assert.equal(sourceMarks(source).find((mark) => mark.line === 5)?.column, 37);
}

// A compiled fragment and the wrapper around it survive being applied together.
{
  const source = "typst`#circle()`;\n";
  const [mark] = sourceMarks(source);
  const output = applySourceEdits(source, [
    { start: mark.start, end: mark.end, rank: 0, text: '__frameSeqTypstSvg("<svg/>", "#circle()")' },
    ...markEdits(mark),
  ]);
  assert.match(output, /^__frameSeqMark\(__frameSeqTypstSvg\("<svg\/>", "#circle\(\)"\), \{"line":1,/);
}

// End to end: the development server hands the browser a span that points back at real source.
const entry = resolve(packageRoot, "slides.ts");
process.env.FRAMESEQ_ENTRY = entry;
const entrySource = await readFile(entry, "utf8");

const server = await createServer({
  configFile: resolve(packageRoot, "vite.config.ts"),
  root: packageRoot,
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 4174, strictPort: false, open: false },
});
await server.listen();

const address = server.httpServer?.address();
if (!address || typeof address === "string") {
  await server.close();
  throw new Error("Could not determine source-map test server address");
}

const browser = await puppeteer.launch(puppeteerLaunchOptions());
const errors = [];

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(20_000);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const origin = `http://127.0.0.1:${address.port}`;
  await page.goto(origin, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");

  const info = await page.evaluate(async () => {
    const response = await fetch("/__frameseq/source-info", { cache: "no-store" });
    return response.json();
  });
  assert.equal(typeof info.entry, "string");
  assert.match(info.entry, /slides\.ts$/);

  const spans = await page.$$eval("[data-frameseq-source]", (elements) => elements.map((element) => ({
    type: element.dataset.frameseqNode,
    source: element.dataset.frameseqSource,
  })));
  assert.ok(spans.length > 20, `Expected many marked objects, found ${spans.length}`);
  assert.ok(spans.some((span) => span.type === "slide"), "Slides should be marked");

  const lines = entrySource.split(/\r?\n/);
  for (const { source } of spans) {
    const [line, column, start, end] = source.split(":").map(Number);
    const text = entrySource.slice(start, end);
    assert.match(text, /^[A-Za-z]+[({`]/, `A span should start at a command: ${text.slice(0, 40)}`);
    // The offsets and the line and column must describe the same place in the file.
    assert.equal(lines[line - 1].slice(column - 1, column - 1 + 6), text.slice(0, 6));
  }

  // Alt-clicking an object asks the editor for its line; a plain click leaves the deck alone.
  const opened = await page.evaluate(async () => {
    const requests = [];
    const original = window.fetch;
    window.fetch = (input, init) => {
      requests.push(String(input));
      // Stop here rather than launching a real editor on the machine running the test.
      if (String(input).includes("__open-in-editor")) return Promise.resolve(new Response(""));
      return original(input, init);
    };
    const target = document.querySelector(".frameseq-slide-frame.is-active [data-frameseq-source]");
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, altKey: false }));
    const before = requests.length;
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, altKey: true }));
    await new Promise((done) => setTimeout(done, 500));
    return { before, requests };
  });
  assert.equal(opened.before, 0, "A plain click should not reach the editor");
  assert.ok(
    opened.requests.some((request) => request.includes("__open-in-editor")),
    `Alt-click should ask the editor to open the line: ${JSON.stringify(opened.requests)}`,
  );

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}

console.log("Source map test passed: preview objects carry the source range that wrote them.");
