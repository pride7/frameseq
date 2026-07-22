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
      notes: false,
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
assert.ok(report.slides.every((slide) => slide.source.endLine >= slide.source.line));

console.log("Inspect test passed: titles, layouts, notes, objects, and source locations are stable JSON.");

