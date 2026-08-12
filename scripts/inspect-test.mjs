#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

console.log("Inspect test passed: identity, hierarchy, editable properties, and source ranges are stable JSON.");

