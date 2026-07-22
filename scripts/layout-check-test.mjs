#!/usr/bin/env node

import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");

function runCheck(fixture, ...options) {
  const result = spawnSync(
    process.execPath,
    [cli, "check", resolve(packageRoot, "scripts", "fixtures", fixture), "--json", ...options],
    {
      cwd: packageRoot,
      encoding: "utf8",
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.stderr, "");
  return {
    status: result.status,
    report: JSON.parse(result.stdout),
  };
}

const broken = runCheck("layout-issues.slides.ts");
assert.equal(broken.status, 1);
assert.deepEqual(broken.report.summary, {
  slides: 1,
  errors: 2,
  warnings: 1,
});
assert.deepEqual(
  broken.report.issues.map((issue) => issue.rule),
  ["canvas-overflow", "text-clipped", "font-too-small"],
);
assert.equal(broken.report.issues[0].slide.label, "Broken layout");
assert.equal(broken.report.issues[0].element.type, "text");
assert.ok(broken.report.issues[0].suggestions.length > 0);

const warning = runCheck("layout-warning.slides.ts");
assert.equal(warning.status, 0);
assert.equal(warning.report.summary.errors, 0);
assert.equal(warning.report.summary.warnings, 1);
assert.equal(warning.report.issues[0].details.fontSize, 13);

const strictWarning = runCheck("layout-warning.slides.ts", "--strict");
assert.equal(strictWarning.status, 1);
assert.deepEqual(strictWarning.report.summary, warning.report.summary);

const empty = runCheck("layout-empty.slides.ts");
assert.equal(empty.status, 0);
assert.deepEqual(empty.report.summary, {
  slides: 3,
  errors: 0,
  warnings: 1,
});
assert.equal(empty.report.issues[0].rule, "empty-slide");
assert.equal(empty.report.issues[0].slide.label, "Accidental blank");
assert.equal(empty.report.issues[0].element.type, "slide");
assert.equal(empty.report.issues[0].details.visibleObjects, 0);
assert.ok(empty.report.issues[0].suggestions.some((suggestion) => suggestion.includes("allowEmpty")));

const strictEmpty = runCheck("layout-empty.slides.ts", "--strict");
assert.equal(strictEmpty.status, 1);
assert.deepEqual(strictEmpty.report.summary, empty.report.summary);

const automaticCover = runCheck("layout-auto-cover.slides.ts", "--strict");
assert.equal(automaticCover.status, 0);
assert.deepEqual(automaticCover.report.summary, {
  slides: 1,
  errors: 0,
  warnings: 0,
});

console.log("Layout check test passed: overflow, clipping, font size, empty slides, automatic covers, JSON, and strict mode.");
