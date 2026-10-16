#!/usr/bin/env node

// File › Page setup in FrameSeq Studio: the size of every slide, a screen ratio, a sheet of
// paper either way up, or a size of one's own, written into presentation() as one step, with
// the canvas kept as wide as it was when the content scales with the page. A poster offers only
// paper, and a figure its canvas and the width it prints at.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const workspace = resolve(packageRoot, "tmp", "studio-page-test");
const deck = resolve(workspace, "talk.slides.ts");
const screenshots = process.env.FRAMESEQ_TEST_SCREENSHOTS;

const source = [
  'presentation({ title: "Page test" });',
  "",
  'slide("Canvas").canvas();',
  'rect("Box").position({ x: 100, y: 100 }).width(300).height(120);',
  "",
].join("\n");

const read = async () => {
  for (;;) {
    const first = await readFile(deck, "utf8");
    await delay(15);
    if (first === await readFile(deck, "utf8")) return first;
  }
};

async function waitFor(check, message, timeout = 20_000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`Timed out: ${message}`);
    await delay(100);
  }
}

await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
await mkdir(workspace, { recursive: true });
await writeFile(deck, source, "utf8");

const child = spawn(process.execPath, [cli, "studio", "talk.slides.ts", "--no-open"], {
  cwd: workspace,
  env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0", NO_COLOR: "1", FRAMESEQ_NO_DIALOGS: "1" },
  windowsHide: true,
});
let output = "";
const studioUrl = await new Promise((resolveAddress, rejectAddress) => {
  const timer = setTimeout(() => rejectAddress(new Error(`The Studio did not start.\n${output}`)), 60_000);
  const listen = (chunk) => {
    output += chunk.toString();
    const match = output.match(/Studio:\s+(https?:\/\/\S+studio\.html)/);
    if (match) {
      clearTimeout(timer);
      resolveAddress(match[1]);
    }
  };
  child.stdout.on("data", listen);
  child.stderr.on("data", listen);
  child.on("close", (code) => rejectAddress(new Error(`The Studio exited with ${code}.\n${output}`)));
});

let browser;
try {
  browser = await puppeteer.launch(puppeteerLaunchOptions());
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("frameseq-studio-language", "en");
  });
  await page.goto(studioUrl, { waitUntil: "networkidle2" });
  await page.waitForFunction(
    () => document.querySelector("[data-slot='check-state']")?.textContent?.includes("Layout checked"),
    { timeout: 120_000 },
  );
  const preview = page.frames().find((frame) => /frameseq-preview=studio(#|$)/.test(frame.url()));
  assert.ok(preview, "the preview must be embedded");

  /** The canvas the preview draws, in units. */
  const canvas = () => preview.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return `${Number.parseFloat(style.getPropertyValue("--slide-width"))} × ${Number.parseFloat(style.getPropertyValue("--slide-height"))}`;
  }).catch(() => "");
  const openPageSetup = async () => {
    await page.click("[data-menu='file']");
    await page.waitForSelector("[data-command='page-setup']");
    await page.click("[data-command='page-setup']");
    await page.waitForSelector(".studio-page-dialog");
  };
  const note = () => page.$eval(".studio-page-dialog .studio-dialog-problem", (element) => element.textContent);
  const choose = (size) => page.select(".studio-page-dialog select[aria-label='Size']", size);
  const apply = async () => {
    await page.click(".studio-page-dialog button[type='submit']");
    await page.waitForFunction(() => !document.querySelector(".studio-page-dialog"));
  };
  const written = (text, message) => waitFor(async () => (await read()).includes(text), message);

  // ── The dialog starts from what presentation() states ─────────────────────────────────
  await openPageSetup();
  assert.equal(await page.$eval(".studio-page-dialog select[aria-label='Size']", (select) => select.value), "16:9");
  assert.equal(await note(), "The canvas will be 1280 × 720 units.");

  // ── A screen ratio ──────────────────────────────────────────────────────────────────────
  await choose("4:3");
  assert.equal(await note(), "The canvas will be 1280 × 960 units.");
  await apply();
  await written('presentation({ title: "Page test", ratio: "4:3" });', "the 4:3 ratio to be written");
  await waitFor(async () => (await canvas()) === "1280 × 960", "the preview to draw a 4:3 canvas");

  // ── A sheet of paper, the content scaled with it ───────────────────────────────────────
  await openPageSetup();
  await choose("A4");
  await page.click(".studio-page-dialog input[value='landscape']");
  assert.equal(await note(), "The canvas will be 1280 × 905 units, printed 297 × 210 mm.");
  if (screenshots) await page.screenshot({ path: resolve(screenshots, "page-setup.png") });
  await apply();
  await written('presentation({ title: "Page test", size: "A4", orientation: "landscape", width: 1280 });', "A4 landscape to be written, kept 1280 units across");
  await waitFor(async () => (await canvas()) === "1280 × 905", "the preview to draw the A4 page");

  // ── The paper's own canvas, when the content does not scale ─────────────────────────────
  await openPageSetup();
  assert.equal(await page.$eval(".studio-page-dialog select[aria-label='Size']", (select) => select.value), "A4");
  await page.click(".studio-page-dialog input[value='portrait']");
  await page.click(".studio-page-keep input");
  assert.equal(await note(), "The canvas will be 1600 × 2263 units, printed 210 × 297 mm.");
  await apply();
  await written('presentation({ title: "Page test", size: "A4" });', "A4 portrait to be written with the paper's own canvas");

  // ── A size of one's own, in canvas units ────────────────────────────────────────────────
  await openPageSetup();
  await choose("custom");
  await page.select(".studio-page-dialog select[aria-label='Unit']", "px");
  const setField = async (label, value) => {
    await page.click(`.studio-page-dialog input[aria-label='${label}']`, { clickCount: 3 });
    await page.keyboard.type(value);
  };
  await setField("Width", "1920");
  await setField("Height", "1080");
  assert.equal(await note(), "The canvas will be 1920 × 1080 units.");
  await apply();
  await written('presentation({ title: "Page test", width: 1920, height: 1080 });', "the canvas of one's own to be written");

  // Each change is one step: undo puts the page back.
  await page.focus(".cm-content");
  await page.keyboard.down("Control");
  await page.keyboard.press("z");
  await page.keyboard.up("Control");
  await written('presentation({ title: "Page test", size: "A4" });', "undo to put the page back");

  // ── A poster is made for paper ───────────────────────────────────────────────────────────
  await writeFile(deck, 'poster({ title: "Poster" });\ntext("Findings");\n', "utf8");
  await waitFor(async () => (await canvas()) === "1600 × 2263", "the preview to draw the A0 poster");
  await openPageSetup();
  const sizes = await page.$$eval(".studio-page-dialog select[aria-label='Size'] option", (options) => options.map((option) => option.value));
  assert.ok(!sizes.includes("16:9") && !sizes.includes("4:3") && sizes.includes("A0"), "a poster offers only paper");
  assert.equal(await page.$eval(".studio-page-dialog select[aria-label='Size']", (select) => select.value), "A0");
  await choose("A1");
  await apply();
  await written('poster({ title: "Poster", size: "A1" });', "the poster's sheet to be written");

  // ── A figure: its canvas, and the width it prints at ────────────────────────────────────
  await writeFile(deck, 'figure({ title: "Method", width: 1600, height: 820 });\nrect("A").position({ x: 40, y: 40 });\n', "utf8");
  await waitFor(async () => (await canvas()) === "1600 × 820", "the preview to draw the figure");
  await openPageSetup();
  assert.equal(await page.$eval(".studio-page-dialog input[aria-label='Printed width']", (input) => input.value), "170mm");
  await page.select(".studio-page-dialog select[aria-label='Printed width']", "85mm");
  await apply();
  await written('figure({ title: "Method", width: 1600, height: 820, printWidth: "85mm" });', "the figure's printed width to be written");

  assert.deepEqual(errors, [], "the Studio must not throw");
  console.log("Studio page test passed: screen ratios, paper either way up with its content scaled or not, sizes of one's own, posters, and figures.");
} finally {
  await browser?.close();
  child.kill();
}
