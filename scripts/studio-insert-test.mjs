#!/usr/bin/env node

// Drawing objects onto a slide from the Studio: a shape dragged out in the preview is written
// where it was drawn, and a connector dragged between two objects names them and follows them.

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
const workspace = resolve(packageRoot, "tmp", "studio-insert-test");
const deck = resolve(workspace, "talk.slides.ts");
const screenshots = process.env.FRAMESEQ_TEST_SCREENSHOTS;

const source = [
  'presentation({ title: "Insert test" });',
  "",
  'slide("Intro");',
  'text("Hello");',
  "",
  'slide("Canvas").canvas();',
  'rect("Box").position({ x: 700, y: 300 }).width(200).height(100);',
  "",
  'slide("Last");',
  'text("Bye");',
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
  env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0", NO_COLOR: "1" },
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
  await page.goto(`${studioUrl}`, { waitUntil: "networkidle2" });
  await page.waitForFunction(
    () => document.querySelector("[data-slot='check-state']")?.textContent?.includes("Layout checked"),
    { timeout: 120_000 },
  );
  const preview = page.frames().find((frame) => /frameseq-preview=studio(#|$)/.test(frame.url()));
  assert.ok(preview, "the preview must be embedded");

  // Show the canvas slide.
  await page.evaluate(() => {
    const { view } = window.frameseqStudio;
    const at = view.state.doc.toString().indexOf('rect("Box")');
    view.dispatch({ selection: { anchor: at } });
    view.focus();
  });
  await waitFor(() => preview.evaluate(() => document.querySelector(".frameseq-slide-frame.is-active")?.dataset.index === "1")
    .catch(() => false), "the preview to show the canvas slide");

  // The gallery lists every shape, each drawn from its own outline.
  await page.click("[data-action='insert']");
  await page.waitForSelector(".studio-insert-gallery");
  const kinds = await page.$$eval(".studio-insert-item", (items) => items.map((item) => item.dataset.kind));
  assert.equal(kinds.length, 31, "the gallery must offer 27 shapes, text, a line, an arrow, and a connector");
  assert.ok(kinds.includes("diamond") && kinds.includes("cylinder") && kinds.includes("connector"));
  if (screenshots) await page.screenshot({ path: resolve(screenshots, "insert-gallery.png") });

  // Pick the diamond, then drag it out on the slide.
  await page.click(".studio-insert-item[data-kind='diamond']");
  await preview.waitForFunction(() => document.documentElement.classList.contains("frameseq-placing"));
  const frameBox = await (await page.$(".studio-preview-frame")).boundingBox();
  const slide = await preview.evaluate(() => {
    const canvas = document.querySelector(".frameseq-slide-frame.is-active .frameseq-slide");
    const box = canvas.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height, scale: box.width / canvas.offsetWidth };
  });
  const start = { x: frameBox.x + slide.x + slide.width * 0.2, y: frameBox.y + slide.y + slide.height * 0.4 };
  const end = { x: start.x + 220 * slide.scale, y: start.y + 140 * slide.scale };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(start.x + ((end.x - start.x) * step) / 8, start.y + ((end.y - start.y) * step) / 8);
  }
  await page.mouse.up();
  const drawn = await waitFor(async () => {
    const text = await read();
    return /shape\("diamond", "Text"\)\.position\(\{ x: -?\d+, y: -?\d+ \}\)\.width\(\d+\)\.height\(\d+\);/.test(text) && text;
  }, "the diamond to be written");
  const [, width, height] = drawn.match(/shape\("diamond", "Text"\)\.position\(\{ x: -?\d+, y: -?\d+ \}\)\.width\((\d+)\)\.height\((\d+)\)/);
  assert.ok(Math.abs(Number(width) - 220) <= 2 && Math.abs(Number(height) - 140) <= 2, `the diamond keeps its drawn size, not ${width} x ${height}`);
  assert.ok(drawn.indexOf('shape("diamond"') < drawn.indexOf('slide("Last")'), "the diamond belongs to the canvas slide");
  const editorSelection = await page.evaluate(() => {
    const { view } = window.frameseqStudio;
    const { from, to } = view.state.selection.main;
    return view.state.doc.sliceString(from, to);
  });
  assert.equal(editorSelection, "Text", "the placeholder text is selected, ready to be typed over");

  // The diamond lands where it was drawn, and editing turns on so it can be dragged at once. The
  // redrawn slide is swapped in before it is scaled to the frame, so wait for it to settle.
  let landed;
  await waitFor(async () => {
    landed = await preview.evaluate(() => {
      const shape = document.querySelector(".frameseq-slide-frame.is-active [data-frameseq-shape='diamond']");
      if (!shape) return undefined;
      const box = shape.getBoundingClientRect();
      return { x: box.x, y: box.y, editing: document.documentElement.classList.contains("frameseq-edit-mode") };
    }).catch(() => undefined);
    return landed && Math.abs(frameBox.x + landed.x - start.x) <= 3 && Math.abs(frameBox.y + landed.y - start.y) <= 3;
  }, `the diamond to appear where it was drawn, not at ${JSON.stringify(landed)}`);
  assert.equal(landed.editing, true, "layout editing turns on after drawing");

  // Connect the diamond to the box: both get names, and the connector refers to them.
  await page.evaluate(() => {
    document.querySelector("[data-action='insert']").click();
  });
  await page.waitForSelector(".studio-insert-item[data-kind='connector']");
  await page.click(".studio-insert-item[data-kind='connector']");
  await preview.waitForFunction(() => document.documentElement.dataset.frameseqPlacing === "connector");
  const centres = await preview.evaluate(() => {
    const centre = (selector) => {
      const box = document.querySelector(`.frameseq-slide-frame.is-active ${selector}`).getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    return { from: centre("[data-frameseq-shape='diamond']"), to: centre(".frameseq-rect") };
  });
  await page.mouse.move(frameBox.x + centres.from.x, frameBox.y + centres.from.y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(
      frameBox.x + centres.from.x + ((centres.to.x - centres.from.x) * step) / 8,
      frameBox.y + centres.from.y + ((centres.to.y - centres.from.y) * step) / 8,
    );
  }
  await page.mouse.up();
  const connected = await waitFor(async () => {
    const text = await read();
    return text.includes('line().from("shape1").to("box1").arrow();') && text;
  }, "the connector to be written");
  assert.match(connected, /shape\("diamond", "Text"\)[^\n]*\.as\("shape1"\);/);
  assert.match(connected, /rect\("Box"\)[^\n]*\.as\("box1"\);/);
  await waitFor(() => preview.evaluate(() => Boolean(
    document.querySelector(".frameseq-slide-frame.is-active [data-frameseq-node='line'] line"),
  )).catch(() => false), "the connector to be drawn");
  if (screenshots) await page.screenshot({ path: resolve(screenshots, "insert-connected.png") });

  // Delete in the preview removes the selected shape's lines and the connector that ends at it;
  // the object at the connector's other end keeps its name. One undo brings both back.
  const diamondCentre = await waitFor(() => preview.evaluate(() => {
    const shape = document.querySelector(".frameseq-slide-frame.is-active [data-frameseq-shape='diamond']");
    if (!shape || !document.documentElement.classList.contains("frameseq-edit-mode")) return undefined;
    const box = shape.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }).catch(() => undefined), "the diamond to be selectable");
  await page.mouse.click(frameBox.x + diamondCentre.x, frameBox.y + diamondCentre.y);
  await preview.waitForFunction(() => Boolean(document.querySelector(".is-frameseq-selected[data-frameseq-shape='diamond']")));
  await page.keyboard.press("Delete");
  const deleted = await waitFor(async () => {
    const text = await read();
    return !text.includes('shape("diamond"') && text;
  }, "the diamond to be deleted");
  assert.ok(!deleted.includes("line().from"), "the connector that ended at the diamond goes with it");
  assert.match(deleted, /rect\("Box"\)[^\n]*\.as\("box1"\);/, "the box keeps its name");
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyZ");
  await page.keyboard.up("Control");
  await waitFor(async () => (await read()) === connected, "one undo to bring the diamond and its connector back");

  // Escape abandons drawing without writing anything.
  const before = await read();
  await page.evaluate(() => document.querySelector("[data-action='insert']").click());
  await page.click(".studio-insert-item[data-kind='cloud']");
  await preview.waitForFunction(() => document.documentElement.classList.contains("frameseq-placing"));
  await page.keyboard.press("Escape");
  await preview.waitForFunction(() => !document.documentElement.classList.contains("frameseq-placing"));
  await delay(400);
  assert.equal(await read(), before, "Escape must not write anything");

  assert.deepEqual(errors, [], "the Studio must not throw");
  console.log("Studio insert test passed.");
} finally {
  await browser?.close();
  child.kill();
}
