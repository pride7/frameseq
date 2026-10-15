#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectSource } from "./frameseq-inspect.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const fixture = resolve(packageRoot, "scripts", "fixtures", "inspect.slides.ts");
const result = spawnSync(process.execPath, [cli, "inspect", fixture, "--json"], {
  cwd: packageRoot,
  encoding: "utf8",
});

if (result.error) throw result.error;
assert.equal(result.status, 0);
assert.equal(result.stderr, "");

const report = JSON.parse(result.stdout);
assert.equal(report.version, 1);
assert.equal(report.file, "scripts/fixtures/inspect.slides.ts");
assert.equal(report.presentation.title, "Inspectable talk");
assert.deepEqual(report.summary, { slides: 3, objects: 6 });
assert.deepEqual(
  report.slides.map((slide) => ({
    label: slide.label,
    layout: slide.layout,
    notes: slide.notes,
    objects: slide.objects.map((object) => object.type),
  })),
  [
    {
      label: "Cover",
      layout: "cover",
      notes: true,
      objects: ["text", "text"],
    },
    {
      label: "Precise",
      layout: "canvas",
      notes: true,
      objects: ["text", "rect"],
    },
    {
      label: "Results",
      layout: "grid",
      notes: false,
      objects: ["metric", "latexFile"],
    },
  ],
);
// Where each slide's notes are written, so the Studio can rewrite them or add .notes().
const fixtureText = readFileSync(fixture, "utf8");
assert.deepEqual(
  report.slides.map((slide) => slide.noteSources.map((source) => [source.value, fixtureText.slice(source.start, source.end)])),
  [[["Welcome.", '"Welcome."']], [["Point at the pinned object.", '"Point at the pinned object."']], []],
);
assert.ok(report.slides.every((slide) => typeof slide.notesAt === "number"));
assert.equal(fixtureText.slice(report.slides[2].notesAt - 8, report.slides[2].notesAt), ".grid(2)");
assert.equal(report.slides[1].title, "Exact placement");
assert.deepEqual(report.slides[1].objects.map((object) => object.label), ["Pinned", "Box"]);
const [diagram] = report.slides[1].regions;
assert.equal(diagram.path, "diagram");
assert.equal(diagram.id, "slide:2:region:diagram");
assert.equal(diagram.visits, 2);
assert.equal(diagram.sources.length, 2);
assert.equal(diagram.source.line, 8);
assert.ok(diagram.source.end > diagram.source.start);
assert.deepEqual(
  diagram.properties.map(({ name, kind, value }) => ({ name, kind, value })),
  [
    { name: "x", kind: "number", value: 20 },
    { name: "y", kind: "number", value: 30 },
    { name: "width", kind: "number", value: 800 },
    { name: "height", kind: "number", value: 500 },
  ],
);
assert.equal(report.slides[1].objects[0].region, "diagram");
assert.match(report.slides[1].objects[0].id, /^slide:2:object:/);
assert.deepEqual(
  report.slides[1].objects[0].properties.map(({ name, kind, value }) => ({ name, kind, value })),
  [
    { name: "x", kind: "number", value: 80 },
    { name: "y", kind: "number", value: 120 },
  ],
);
assert.ok(report.slides[1].objects[0].source.end > report.slides[1].objects[0].source.start);
assert.ok(report.slides.every((slide) => slide.source.endLine >= slide.source.line));

// What the Studio's Current slide panel needs to change an object: the strings its command was
// given, the methods called on it with the ranges that remove them, where a new call goes, and
// the statement that deletes it. A value the code computes is reported but not offered as a literal.
const panelSource = [
  'presentation("Panel");',
  'slide("One");',
  'text("Hello").lead().fontSize(size * 2);',
  "latex`",
  "  \\begin{tabular}{lr}",
  "`",
  "  .width(640);",
  'bullets("One", "Two");',
  'at("side").text("Region words").color("red");',
  'line().from("start").to("end").below("start");',
  'image(new URL("./images/cat.png", import.meta.url).href, "A cat");',
  "",
].join("\n");
const [panel] = inspectSource("panel.slides.ts", panelSource).slides;
const at = (range) => panelSource.slice(range.start, range.end);
const [hello, formula, list, region, link, picture] = panel.objects;
assert.deepEqual(hello.texts.map((text) => [text.value, text.expected, text.argument]), [["Hello", '"Hello"', 0]]);
assert.deepEqual(hello.methods.map((method) => method.name), ["lead", "fontSize"]);
assert.equal(panelSource.slice(hello.methods[0].removeFrom, hello.methods[0].end), ".lead()");
assert.equal(panelSource.slice(hello.methods[0].nameStart, hello.methods[0].nameEnd), "lead");
assert.equal(hello.append.at, hello.source.end);
assert.equal(hello.append.indent, undefined, "a chain on one line takes the next call on the same line");
assert.deepEqual(hello.properties, [], "a computed size is not offered as a literal");
assert.deepEqual(hello.computed.map((value) => [value.name, value.text]), [["fontSize", "size * 2"]]);
assert.equal(at(hello.statement), 'text("Hello").lead().fontSize(size * 2);');
// A tagged template is labelled, and edited, as the raw text the command receives.
assert.equal(formula.label, "\n  \\begin{tabular}{lr}\n");
assert.deepEqual(formula.texts.map((text) => [text.value, text.raw]), [["\n  \\begin{tabular}{lr}\n", true]]);
assert.equal(formula.append.indent, "  ", "a chain written one call to a line takes the next call on a line of its own");
assert.equal(panelSource.slice(formula.methods[0].removeFrom, formula.methods[0].end), "\n  .width(640)");
assert.deepEqual(list.texts.map((text) => [text.value, text.argument]), [["One", 0], ["Two", 1]]);
// Methods after at("side").text() style the region, so the panel is not offered them.
assert.equal(region.type, "text");
assert.equal(region.append, undefined);
assert.equal(region.statement, undefined);
// The names an object connects or is placed against, once each, so deleting one can account for it.
assert.deepEqual(link.refers, ["start", "end"]);
assert.equal(hello.refers, undefined);
// A picture beside the slides is written with new URL(); its path is the literal inside.
assert.equal(picture.label, "./images/cat.png");
assert.deepEqual(picture.texts.map((text) => [text.argument, text.value]), [[0, "./images/cat.png"], [1, "A cat"]]);

console.log("Inspect test passed: identity, hierarchy, editable properties, source ranges, and the panel's edit points are stable JSON.");

