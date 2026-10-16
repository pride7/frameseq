#!/usr/bin/env node

// Selecting and shaping objects on the slide in FrameSeq Studio as in a drawing program: a box
// dragged across the slide's empty part selects what lies inside it, the handles on an object's
// sides and corners resize it from there, and the one above it turns it, written as .rotate().

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
const workspace = resolve(packageRoot, "tmp", "studio-handles-test");
const deck = resolve(workspace, "talk.slides.ts");
const screenshots = process.env.FRAMESEQ_TEST_SCREENSHOTS;

const source = [
  'presentation({ title: "Handles test" });',
  "",
  'slide("Canvas").canvas();',
  'rect("A").position({ x: 100, y: 100 }).width(200).height(100);',
  'rect("B").position({ x: 400, y: 100 }).width(200).height(100);',
  'rect("C").position({ x: 700, y: 400 }).width(200).height(100);',
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
   * Where the canvas's coordinates start on the page, and how big a unit is: a canvas slide's
   * region begins below its title, so it is measured from the box A, written at 100, 100.
   */
  let origin = { x: 0, y: 0, scale: 1 };
  const measure = async () => {
    origin = await preview.evaluate(() => {
      const box = document.querySelector("#app [data-test='A']").getBoundingClientRect();
      const canvas = document.querySelector("#app .frameseq-slide-frame.is-active .frameseq-slide");
      const scale = canvas.getBoundingClientRect().width / canvas.offsetWidth;
      return { x: box.x - 100 * scale, y: box.y - 100 * scale, scale };
    });
  };
  /** A point on the canvas, in its units, on the page. */
  const at = (x, y) => ({ x: frameBox.x + origin.x + x * origin.scale, y: frameBox.y + origin.y + y * origin.scale });
  /** The middle of an element in the preview, on the page. */
  const centreOf = async (selector) => {
    const box = await waitFor(() => preview.evaluate((wanted) => {
      // A redraw drops the marks, so the boxes are marked again by their words each time.
      for (const candidate of document.querySelectorAll("#app .frameseq-slide-frame.is-active .frameseq-rect")) {
        candidate.setAttribute("data-test", candidate.textContent.trim());
      }
      const element = document.querySelector(`#app .frameseq-slide-frame.is-active ${wanted}`);
      if (!element) return undefined;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x: x + width / 2, y: y + height / 2 };
    }, selector).catch(() => undefined), `${selector} on the slide`);
    return { x: frameBox.x + box.x, y: frameBox.y + box.y };
  };
  const drag = async (from, to, { shift = false, steps = 12 } = {}) => {
    await page.mouse.move(from.x, from.y);
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.down();
    for (let step = 1; step <= steps; step += 1) {
      await page.mouse.move(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps);
    }
    await page.mouse.up();
    if (shift) await page.keyboard.up("Shift");
  };
  /**
   * Mark the box that says `label` in the drawing shown, for the selectors below, once it is
   * drawn as the code now says: `size` as [width, height], and `turn` in degrees.
   */
  const redrawn = async (label, size, turn) => {
    await waitFor(() => preview.evaluate((wanted, dimensions, degrees) => {
      const element = [...document.querySelectorAll("#app .frameseq-slide-frame.is-active .frameseq-rect")]
        .find((candidate) => candidate.textContent.trim() === wanted);
      if (!element) return false;
      if (dimensions && (element.offsetWidth !== dimensions[0] || element.offsetHeight !== dimensions[1])) return false;
      if (degrees !== null && !element.style.transform.includes(`rotate(${degrees}deg)`)) return false;
      element.setAttribute("data-test", wanted);
      return true;
    }, label, size ?? null, turn ?? null).catch(() => false), `the box ${label} to be drawn as written`);
    // A save can be drawn twice in quick succession; the slide is used once it has stopped changing.
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
  const selectedLabels = () => preview.evaluate(() => [...document.querySelectorAll("#app .is-frameseq-selected")]
    .map((element) => element.textContent.trim()).sort());
  const written = (text, message) => waitFor(async () => (await read()).includes(text), message);

  // ── A box dragged across the empty slide selects what lies wholly inside it ─────────────
  await redrawn("A");
  await measure();
  await drag(at(60, 60), at(640, 240));
  await waitFor(async () => JSON.stringify(await selectedLabels()) === JSON.stringify(["A", "B"]), "A and B to be selected by the box");
  // The editor selects the code of both.
  await waitFor(() => page.evaluate(() => window.frameseqStudio.view.state.selection.ranges.length === 2), "both objects' code to be selected");
  // Shift adds what another box takes in.
  await drag(at(660, 360), at(960, 540), { shift: true });
  await waitFor(async () => JSON.stringify(await selectedLabels()) === JSON.stringify(["A", "B", "C"]), "C to be added to the selection");
  // A plain click on the empty slide clears it.
  const empty = at(1100, 650);
  await page.mouse.click(empty.x, empty.y);
  await waitFor(async () => (await selectedLabels()).length === 0, "a click on the slide to clear the selection");

  // ── Eight handles resize from where they are, and one above turns ───────────────────────
  const a = await centreOf("[data-test='A']");
  await page.mouse.click(a.x, a.y);
  await waitFor(() => preview.evaluate(() => {
    const element = document.querySelector("#app [data-test='A']");
    return element?.querySelectorAll(":scope > .frameseq-edit-handle").length === 8
      && Boolean(element.querySelector(":scope > .frameseq-rotate-handle"));
  }).catch(() => false), "the selected box to have eight handles and one to turn it");
  if (screenshots) await page.screenshot({ path: resolve(screenshots, "handles.png") });
  // The left handle moves the left edge, and x with it.
  const west = await centreOf("[data-test='A'] > .frameseq-edit-handle.is-w");
  await drag(west, { x: west.x - 50 * origin.scale, y: west.y });
  await written('rect("A").position({ x: 50, y: 100 }).width(250).height(100);', "the left handle to move x and widen the box");
  // The top handle moves the top edge, and y with it.
  await redrawn("A", [250, 100]);
  await redrawn("B");
  const b = await centreOf("[data-test='B']");
  await page.mouse.click(b.x, b.y);
  const north = await centreOf("[data-test='B'] > .frameseq-edit-handle.is-n");
  await drag(north, { x: north.x, y: north.y - 40 * origin.scale });
  await written('rect("B").position({ x: 400, y: 60 }).width(200).height(140);', "the top handle to move y and heighten the box");
  // A corner with Shift keeps the proportions.
  await redrawn("B", [200, 140]);
  await redrawn("A", [250, 100]);
  const a2 = await centreOf("[data-test='A']");
  await page.mouse.click(a2.x, a2.y);
  const corner = await centreOf("[data-test='A'] > .frameseq-edit-handle.is-se");
  await drag(corner, { x: corner.x + 50 * origin.scale, y: corner.y + 20 * origin.scale }, { shift: true });
  await written('rect("A").position({ x: 50, y: 100 }).width(300).height(120);', "a corner with Shift to keep the box's proportions");

  // ── The handle above turns an object, and writes .rotate() ──────────────────────────────
  await redrawn("A", [300, 120]);
  await redrawn("C");
  const c = await centreOf("[data-test='C']");
  await page.mouse.click(c.x, c.y);
  const turner = await centreOf("[data-test='C'] > .frameseq-rotate-handle");
  // From straight above the middle to straight right of it is a quarter turn; Shift keeps it to 15°.
  await drag(turner, { x: c.x + (c.y - turner.y), y: c.y }, { shift: true, steps: 16 });
  await written('rect("C").position({ x: 700, y: 400 }).width(200).height(100).rotate(90);', "the turn to be written as .rotate()");
  // Turned again, the number written is rewritten.
  await redrawn("C", undefined, 90);
  await page.mouse.click(c.x, c.y);
  const turned = await centreOf("[data-test='C'] > .frameseq-rotate-handle");
  const radius = Math.hypot(turned.x - c.x, turned.y - c.y);
  await drag(turned, { x: c.x + radius * Math.SQRT1_2, y: c.y - radius * Math.SQRT1_2 }, { shift: true, steps: 16 });
  await written(".rotate(45);", "the second turn to rewrite the angle");

  // ── A locked layout turns and resizes nothing ────────────────────────────────────────────
  await preview.evaluate(() => document.querySelector("[data-action='layout-lock']").click());
  await redrawn("C", undefined, 45);
  await redrawn("A");
  await waitFor(() => preview.evaluate(() => document.documentElement.classList.contains("frameseq-layout-locked"))
    .catch(() => false), "the layout to be locked");
  const a3 = await centreOf("[data-test='A']");
  await page.mouse.click(a3.x, a3.y);
  assert.equal(await preview.evaluate(() => document.querySelectorAll("#app .frameseq-edit-handle, #app .frameseq-rotate-handle").length), 0,
    "a locked layout shows no handles");
  await preview.evaluate(() => document.querySelector("[data-action='layout-lock']").click());

  assert.deepEqual(errors, [], "the Studio must not throw");
  console.log("Studio handles test passed: box selection, eight resize handles from their own sides, Shift on a corner, and turning written as .rotate().");
} finally {
  await browser?.close();
  child.kill();
}
