#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import puppeteer from "puppeteer";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(packageRoot, "tmp", "single-file-test");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");

if (!outputDirectory.startsWith(resolve(packageRoot, "tmp"))) {
  throw new Error(`Unsafe single-file test path: ${outputDirectory}`);
}

await rm(outputDirectory, { recursive: true, force: true });
const result = spawnSync(
  process.execPath,
  [cli, "build", "slides.ts", "--single-file", "--output", outputDirectory],
  { cwd: packageRoot, encoding: "utf8", stdio: "inherit" },
);
if (result.error) throw result.error;
assert.equal(result.status, 0);

assert.deepEqual(await readdir(outputDirectory), ["index.html"]);
const htmlPath = resolve(outputDirectory, "index.html");
const html = await readFile(htmlPath, "utf8");
assert.match(html, /<style>/);
assert.match(html, /data:font\/woff2;base64,/);
assert.match(html, /data:image\/svg\+xml;base64,/);
assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
assert.doesNotMatch(html, /<link\b[^>]*\brel=["']stylesheet["']/i);

const browser = await puppeteer.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  assert.equal(await page.$$eval(".frameseq-slide-frame", (slides) => slides.length), 7);
  assert.equal(await page.$$eval(".katex", (formulas) => formulas.length), 2);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

console.log("Single-file test passed: one portable HTML file renders directly from disk.");
