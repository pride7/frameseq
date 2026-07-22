#!/usr/bin/env node

import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { preview } from "vite";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const galleryOutput = resolve(packageRoot, "dist", "gallery");
const server = await preview({
  configFile: false,
  root: packageRoot,
  build: { outDir: galleryOutput },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("Gallery preview did not expose a local URL");

const llmsResponse = await fetch(new URL("llms.txt", url));
assert.equal(llmsResponse.status, 200);
assert.match(await llmsResponse.text(), /# FrameSeq[\s\S]+## Authoring model/);

const browser = await puppeteer.launch(puppeteerLaunchOptions());
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => {
    const frames = Array.from(document.querySelectorAll("iframe"));
    return frames.length === 10
      && frames.every((frame) => frame.contentDocument?.querySelector(".frameseq-slide"));
  });

  const desktop = await page.evaluate(() => ({
    title: document.title,
    themeCards: document.querySelectorAll(".theme-card").length,
    capabilityCards: document.querySelectorAll(".capability-card").length,
    frames: document.querySelectorAll("iframe").length,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    themeLinks: Array.from(document.querySelectorAll(".theme-copy > a"))
      .map((link) => link.getAttribute("href")),
    languageHeading: document.querySelector("#language-title")?.textContent,
    outputHeading: document.querySelector("#outputs-title")?.textContent,
  }));
  assert.equal(desktop.title, "FrameSeq — Declarative presentations in TypeScript");
  assert.equal(desktop.themeCards, 7);
  assert.equal(desktop.capabilityCards, 4);
  assert.equal(desktop.frames, 10);
  assert.ok(desktop.overflow <= 0);
  assert.match(desktop.languageHeading ?? "", /top to bottom/i);
  assert.match(desktop.outputHeading ?? "", /web/i);
  assert.equal(
    await page.$eval(".ai-example-preview iframe", (frame) => frame.getAttribute("src")),
    "./examples/ai-research/#2",
  );
  assert.deepEqual(desktop.themeLinks, [
    "./examples/blank/",
    "./examples/midnight/",
    "./examples/paper/",
    "./examples/beamer-default/",
    "./examples/beamer-madrid/",
    "./examples/beamer-cambridge-us/",
    "./examples/minimal-academic/",
  ]);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "networkidle0" });
  const mobile = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector(".theme-grid")).gridTemplateColumns,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  assert.ok(mobile.overflow <= 0);
  assert.ok(!mobile.columns.includes(" "));
} finally {
  await browser.close();
  await server.close();
}

console.log("Gallery test passed: the product story, AI example, seven themes, and live presentations fit desktop and mobile viewports.");
