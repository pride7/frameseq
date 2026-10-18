#!/usr/bin/env node

// Smart guides in FrameSeq Studio, as a drawing program has them: an object dragged on a slide
// snaps to even spacing with the objects in its row and lines up with their edges, a side pulled
// by its handle snaps to another object's edge, and an object's middle snaps to the page's.

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
const workspace = resolve(packageRoot, "tmp", "studio-snap-test");
const deck = resolve(workspace, "talk.slides.ts");
const screenshots = process.env.FRAMESEQ_TEST_SCREENSHOTS;

const source = [
  'presentation({ title: "Snap test" });',
  "",
  'slide("Canvas").canvas();',
  'rect("A").position({ x: 100, y: 100 }).width(200).height(100);',
  'rect("B").position({ x: 400, y: 100 }).width(200).height(100);',
  'rect("C").position({ x: 800, y: 400 }).width(200).height(100);',
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
  const frameBox = await (await page.$(".studio-preview-frame")).boundingBox();

  /**
   * Mark the box that says `label` once it is drawn at `x`, and wait for the slide to stop
   * changing, since a save can be drawn twice in quick succession.
   */
  const redrawn = async (label, x) => {
    await waitFor(() => preview.evaluate((wanted, left) => {
      const element = [...document.querySelectorAll("#app .frameseq-slide-frame.is-active .frameseq-rect")]
        .find((candidate) => candidate.textContent.trim() === wanted);
      if (!element || (left !== null && element.style.left !== `${left}px`)) return false;
      element.setAttribute("data-test", wanted);
      return true;
    }, label, x ?? null).catch(() => false), `the box ${label} to be drawn`);
    await waitFor(async () => {
      const marked = await preview.evaluate(() => {
        const slides = document.querySelector("#app .frameseq-slides");
        if (!slides) return false;
        slides.dataset.testDrawing = "seen";
        return true;
      }).catch(() => false);
      if (!marked) return false;
      await delay(500);
      return preview.evaluate(() => document.querySelector("#app .frameseq-slides")?.dataset.testDrawing === "seen").catch(() => false);
    }, "the slide to stop changing");
  };
  /** Where the canvas's coordinates start in the preview, measured from A at 100, 100, and the page. */
  const measure = () => preview.evaluate(() => {
    const box = [...document.querySelectorAll("#app .frameseq-slide-frame.is-active .frameseq-rect")]
      .find((candidate) => candidate.textContent.trim() === "A").getBoundingClientRect();
    const canvas = document.querySelector("#app .frameseq-slide-frame.is-active .frameseq-slide");
    const scale = canvas.getBoundingClientRect().width / canvas.offsetWidth;
    const pageBox = canvas.getBoundingClientRect();
    const x = box.x - 100 * scale;
    const y = box.y - 100 * scale;
    return { x, y, scale, pageMiddle: (pageBox.left + pageBox.width / 2 - x) / scale };
  });
  const centreOf = async (selector) => {
    const box = await waitFor(() => preview.evaluate((wanted) => {
      const element = document.querySelector(`#app .frameseq-slide-frame.is-active ${wanted}`);
      if (!element) return undefined;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x: x + width / 2, y: y + height / 2 };
    }, selector).catch(() => undefined), `${selector} on the slide`);
    return { x: frameBox.x + box.x, y: frameBox.y + box.y };
  };
  /** Drag by `dx`, `dy` in the canvas's units, and count the guides and gaps shown before letting go. */
  const drag = async (from, dx, dy, scale, picture) => {
    const to = { x: from.x + dx * scale, y: from.y + dy * scale };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let step = 1; step <= 12; step += 1) {
      await page.mouse.move(from.x + ((to.x - from.x) * step) / 12, from.y + ((to.y - from.y) * step) / 12);
    }
    const shown = await preview.evaluate(() => ({
      vertical: document.querySelectorAll(".frameseq-smart-guide.is-vertical").length,
      horizontal: document.querySelectorAll(".frameseq-smart-guide.is-horizontal").length,
      gaps: document.querySelectorAll(".frameseq-smart-gap").length,
    }));
    if (screenshots && picture) await page.screenshot({ path: resolve(screenshots, picture) });
    await page.mouse.up();
    return shown;
  };
  const written = (text, message) => waitFor(async () => (await read()).includes(text), message);

  // ── A move snaps to the spacing of A and B, and to their tops ─────────────────────────────
  await redrawn("A");
  await redrawn("C");
  let origin = await measure();
  // C's left lands 4 short of 700, where it would be as far from B as B is from A, and 3 low.
  const moved = await drag(await centreOf("[data-test='C']"), -104, -297, origin.scale, "snap-spacing.png");
  assert.equal(moved.gaps, 2, "the gap evened and the gap it copies are shown while dragging");
  assert.ok(moved.horizontal >= 1, "the tops C lines up with are shown while dragging");
  await written('rect("C").position({ x: 700, y: 100 })', "C to snap to even spacing and to the tops of A and B");
  assert.equal(await preview.evaluate(() => document.querySelectorAll(".frameseq-smart-guide, .frameseq-smart-gap").length), 0,
    "the guides go once the drag ends");

  // ── A side pulled by its handle snaps to another object's edge ────────────────────────────
  await redrawn("C", 700);
  await redrawn("A");
  const a = await centreOf("[data-test='A']");
  await page.mouse.click(a.x, a.y);
  const east = await centreOf("[data-test='A'] > .frameseq-edit-handle.is-e");
  // A's right edge ends 4 short of B's left.
  const pulled = await drag(east, 96, 0, origin.scale, "snap-resize.png");
  assert.ok(pulled.vertical >= 1, "the edge A's side lines up with is shown while resizing");
  await written('rect("A").position({ x: 100, y: 100 }).width(300).height(100);', "A's right side to snap to B's left");

  // ── An object's middle snaps to the page's ────────────────────────────────────────────────
  await redrawn("A");
  await redrawn("C", 700);
  origin = await measure();
  const left = Math.round(origin.pageMiddle - 100);
  // C's middle lands 4 right of the page's, with nothing else of the slide near it.
  await drag(await centreOf("[data-test='C']"), left + 4 - 700, 300, origin.scale);
  await written(`rect("C").position({ x: ${left}, y: 400 })`, "C's middle to snap to the page's middle");

  assert.deepEqual(errors, [], "the Studio must not throw");
  console.log("Studio snap test passed: even spacing, lined-up edges, a resized side, and the page's middle.");
} finally {
  await browser?.close();
  child.kill();
}
