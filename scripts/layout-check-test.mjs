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

console.log("Layout check test passed: overflow, clipping, font size, JSON, and strict mode.");
