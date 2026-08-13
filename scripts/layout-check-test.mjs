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

const localGrid = runCheck("layout-section.slides.ts", "--strict");
assert.equal(localGrid.status, 0);
assert.deepEqual(localGrid.report.summary, {
  slides: 1,
  errors: 0,
  warnings: 0,
});

const names = runCheck("layout-names.slides.ts");
assert.equal(names.status, 0);
assert.deepEqual(names.report.summary, {
  slides: 2,
  errors: 0,
  warnings: 2,
});
assert.deepEqual(
  names.report.issues.map((issue) => issue.rule),
  ["empty-region", "similar-name"],
);
assert.equal(names.report.issues[0].slide.label, "Mistyped region path");
assert.equal(names.report.issues[0].details.name, "cell1/later");
assert.ok(names.report.issues[0].suggestions.some((suggestion) => suggestion.includes("at(")));
assert.deepEqual(names.report.issues[1].details, { name: "cell0/nwo", other: "cell0/now" });

const strictNames = runCheck("layout-names.slides.ts", "--strict");
assert.equal(strictNames.status, 1);

// A layout modifier the browser silently ignores is reported against the object that
// wrote it, and the same modifiers are left alone where they do mean something.
const inert = runCheck("layout-inert.slides.ts");
assert.equal(inert.status, 0);
assert.deepEqual(inert.report.summary, {
  slides: 3,
  errors: 0,
  warnings: 4,
});
assert.deepEqual(
  inert.report.issues.map((issue) => [issue.slide.label, issue.details.modifier]),
  [
    ["Ignored by the container", "selfAlign()"],
    ["Ignored by the container", "grow()"],
    ["Ignored by the object", "align()"],
    ["Ignored by the object", "gap()"],
  ],
);
assert.deepEqual([...new Set(inert.report.issues.map((issue) => issue.rule))], ["inert-modifier"]);
assert.equal(inert.report.issues[0].element.type, "text");
assert.match(inert.report.issues[0].message, /container holding this object is not a row\(\)/);
assert.match(inert.report.issues[2].message, /this object is not a row\(\)/);
assert.ok(inert.report.issues[2].suggestions.some((hint) => hint.includes("centerSelf()")));

const strictInert = runCheck("layout-inert.slides.ts", "--strict");
assert.equal(strictInert.status, 1);

console.log("Layout check test passed: overflow, clipping, font size, empty slides, region names, inert modifiers, automatic covers, local grids, JSON, and strict mode.");
