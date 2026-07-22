#!/usr/bin/env node

import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { preview } from "vite";

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

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => {
    const frames = Array.from(document.querySelectorAll("iframe"));
    return frames.length === 3
      && frames.every((frame) => frame.contentDocument?.querySelector(".frameseq-slide"));
  });

  const desktop = await page.evaluate(() => ({
    title: document.title,
    cards: document.querySelectorAll(".deck-card").length,
    frames: document.querySelectorAll("iframe").length,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    exampleLinks: Array.from(document.querySelectorAll(".open-deck"))
      .map((link) => link.getAttribute("href")),
  }));
  assert.equal(desktop.title, "FrameSeq Gallery");
  assert.equal(desktop.cards, 3);
  assert.equal(desktop.frames, 3);
  assert.ok(desktop.overflow <= 0);
  assert.deepEqual(desktop.exampleLinks, [
    "./examples/midnight/",
    "./examples/minimal-academic/",
    "./examples/beamer-madrid/",
  ]);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "networkidle0" });
  const mobile = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector(".gallery-grid")).gridTemplateColumns,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  assert.ok(mobile.overflow <= 0);
  assert.ok(!mobile.columns.includes(" "));
} finally {
  await browser.close();
  await server.close();
}

console.log("Gallery test passed: live examples load and the landing page fits desktop and mobile viewports.");
