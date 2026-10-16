#!/usr/bin/env node

// Typing on the slide in FrameSeq Studio: a double-click on an object's words lets them be typed
// in place, as in PowerPoint, and Enter writes them into the string in the code that holds them.
// Escape puts them back; words a loop or the code makes say so instead, and offer the code.

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
const workspace = resolve(packageRoot, "tmp", "studio-typing-test");
const deck = resolve(workspace, "talk.slides.ts");
const screenshots = process.env.FRAMESEQ_TEST_SCREENSHOTS;

const source = [
  'presentation({ title: "Typing test" });',
  "",
  'const name = "Ada";',
  "",
  'slide("Words");',
  'text("Hello");',
  "bullets('First', 'Second');",
  'table([["Model", "Score"], ["Ours", 94]]);',
  "text(`Hi ${name}`);",
  "",
  'slide("Shapes").canvas();',
  'rect().position({ x: 100, y: 100 }).width(240).height(120);',
  'shape("diamond", "Valid?").position({ x: 500, y: 100 }).width(240).height(160);',
  "",
  "for (const topic of [\"Alpha\", \"Beta\"]) {",
  "  slide(topic);",
  "  text(topic);",
  "}",
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
  if (process.env.TYPING_DEBUG) page.on("console", (message) => console.log("console:", message.text()));
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

  const showSlide = async (index) => {
    await waitFor(async () => {
      if (await preview.evaluate((wanted) => document.querySelector("#app .frameseq-slide-frame.is-active")?.dataset.index === String(wanted), index).catch(() => false)) return true;
      const rail = page.frames().find((frame) => /thumbnails=1/.test(frame.url()));
      await (await rail?.$$(".frameseq-thumbnail").catch(() => []))?.[index]?.click().catch(() => undefined);
      await delay(400);
      return false;
    }, `the preview to show slide ${index + 1}`);
  };
  /** The page point at the middle of the element a selector finds on the slide shown. */
  const centreOf = async (selector) => {
    const box = await waitFor(() => preview.evaluate((wanted) => {
      const element = document.querySelector(`#app .frameseq-slide-frame.is-active ${wanted}`);
      if (!element) return undefined;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x: x + width / 2, y: y + height / 2 };
    }, selector).catch(() => undefined), `${selector} on the slide`);
    return { x: frameBox.x + box.x, y: frameBox.y + box.y };
  };
  /** The page point at the middle of the object on the slide shown that says `words`. */
  const centreOfWords = async (words) => {
    const box = await waitFor(() => preview.evaluate((wanted) => {
      const element = [...document.querySelectorAll("#app .frameseq-slide-frame.is-active [data-frameseq-source]")]
        .find((candidate) => !candidate.classList.contains("frameseq-slide") && candidate.textContent.trim() === wanted);
      if (!element) return undefined;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x: x + width / 2, y: y + height / 2 };
    }, words).catch(() => undefined), `“${words}” on the slide`);
    return { x: frameBox.x + box.x, y: frameBox.y + box.y };
  };
  const doubleClick = async (selector) => {
    const point = await centreOf(selector);
    await page.mouse.click(point.x, point.y, { clickCount: 2 });
  };
  const doubleClickWords = async (words) => {
    const point = await centreOfWords(words);
    await page.mouse.click(point.x, point.y, { clickCount: 2 });
  };
  const typing = () => preview.evaluate(() => document.querySelector("#app .is-frameseq-typing")?.textContent ?? null)
    .catch(() => null);
  /** Wait for the slide shown to be drawn again with these words on it, as a person would. */
  const shows = (words) => waitFor(() => preview.evaluate((wanted) => {
    const active = document.querySelector("#app .frameseq-slide-frame.is-active");
    return Boolean(active && !active.querySelector(".is-frameseq-typing") && active.textContent.includes(wanted));
  }, words).catch(() => false), `the slide to show “${words}”`);
  const selectAllTyped = async () => {
    await page.keyboard.down("Control");
    await page.keyboard.press("a");
    await page.keyboard.up("Control");
  };
  const toasts = () => page.evaluate(() => [...document.querySelectorAll(".studio-toast-text")].map((toast) => toast.textContent));
  const toastSays = (words) => waitFor(async () => (await toasts()).some((toast) => toast.includes(words)), `a notice saying “${words}”`)
    .catch(async (error) => {
      throw new Error(`${error.message}; the notices say ${JSON.stringify(await toasts())}`);
    });

  // ── A text: double-click, retype, and Enter writes it in its own quotes ──────────────────
  await showSlide(0);
  await doubleClickWords("Hello");
  await waitFor(async () => (await typing()) === "Hello", "the text to be typed in place");
  await selectAllTyped();
  await page.keyboard.type("Hello there");
  await page.keyboard.press("Enter");
  await waitFor(async () => (await read()).includes('text("Hello there");'), "the typed words to be written");

  // Escape puts the words back and writes nothing.
  const beforeEscape = await read();
  await waitFor(() => preview.evaluate(() => [...document.querySelectorAll("#app [data-frameseq-node='text']")]
    .some((element) => element.textContent === "Hello there")).catch(() => false), "the slide to show the new words");
  await doubleClickWords("Hello there");
  await waitFor(async () => (await typing()) === "Hello there", "typing to start again");
  await page.keyboard.type(" and more");
  await page.keyboard.press("Escape");
  await waitFor(async () => (await typing()) === null, "Escape to stop typing");
  await delay(400);
  assert.equal(await read(), beforeEscape, "Escape writes nothing");
  const shown = await preview.evaluate(() => [...document.querySelectorAll("#app .frameseq-slide-frame.is-active [data-frameseq-node='text']")]
    .map((element) => element.textContent));
  assert.ok(shown.includes("Hello there"), `Escape puts the words back as they were, not ${JSON.stringify(shown)}`);

  // ── A list's item, in the list's single quotes ───────────────────────────────────────────
  await doubleClick(".frameseq-list-item:nth-child(2) .frameseq-list-copy");
  await waitFor(async () => (await typing()) === "Second", "the second item to be typed in place");
  await selectAllTyped();
  await page.keyboard.type("Other's turn");
  await page.keyboard.press("Enter");
  await waitFor(async () => (await read()).includes("bullets('First', 'Other\\'s turn');"), "the item to be written in its own quotes");
  await shows("Other's turn");

  // ── A table's cells: a word, and a number that stays a number ───────────────────────────
  await doubleClick("tbody tr td:nth-child(1)");
  await waitFor(async () => (await typing()) === "Ours", "the cell to be typed in place").catch(async (error) => {
    const state = await preview.evaluate(() => ({
      typing: [...document.querySelectorAll(".is-frameseq-typing")].map((element) => [element.isConnected, element.closest("#app") !== null, element.textContent]),
      editable: [...document.querySelectorAll("[contenteditable]")].map((element) => element.outerHTML.slice(0, 120)),
      active: document.activeElement?.outerHTML.slice(0, 120),
      table: document.querySelector("#app .frameseq-slide-frame.is-active table")?.outerHTML.slice(0, 400),
      url: location.href,
    }));
    throw new Error(`${error.message}: ${JSON.stringify(state)}`);
  });
  await selectAllTyped();
  await page.keyboard.type("Mine");
  await page.keyboard.press("Enter");
  await waitFor(async () => (await read()).includes('["Mine", 94]'), "the cell to be written");
  await waitFor(() => preview.evaluate(() => document.querySelector("#app tbody td")?.textContent === "Mine").catch(() => false), "the table to be redrawn");
  await doubleClick("tbody tr td:nth-child(2)");
  await waitFor(async () => (await typing()) === "94", "the number cell to be typed in place");
  await selectAllTyped();
  await page.keyboard.type("95");
  await page.keyboard.press("Enter");
  await waitFor(async () => (await read()).includes('["Mine", 95]'), "a number to stay a number");
  await shows("95");

  // ── Words the code works out are changed in the code ────────────────────────────────────
  await doubleClickWords("Hi Ada");
  await toastSays("The code works these words out");
  assert.equal(await typing(), null, "computed words are not typed in place");

  // ── A shape without a label takes one; a shape's label is typed in its outline ──────────
  await showSlide(1);
  await doubleClick(".frameseq-rect");
  await waitFor(async () => (await typing()) === "", "the empty box to be typed into");
  await page.keyboard.type("Cache");
  await page.keyboard.press("Enter");
  await waitFor(async () => (await read()).includes('rect("Cache").position'), "the box to take the label typed on it");
  await shows("Cache");
  await doubleClick("[data-frameseq-shape='diamond'] .frameseq-shape-label");
  await waitFor(async () => (await typing()) === "Valid?", "the diamond's label to be typed in place");
  await selectAllTyped();
  await page.keyboard.type("Ready?");
  // A line break inside a label is Shift+Enter.
  await page.keyboard.down("Shift");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Shift");
  await page.keyboard.type("Go");
  await page.keyboard.press("Enter");
  await waitFor(async () => (await read()).includes('shape("diamond", "Ready?\\nGo")'), "a label over two lines to be written");
  await shows("Go");
  if (screenshots) await page.screenshot({ path: resolve(screenshots, "typing.png") });

  // ── An object a loop draws is changed in the code ──────────────────────────────────────
  await showSlide(2);
  await doubleClickWords("Alpha");
  await toastSays("A loop or a helper function writes these words");
  assert.equal(await typing(), null, "words a loop writes are not typed in place");

  // ── Edit text, from the right-click menu, types on the slide too ───────────────────────
  await showSlide(0);
  const hello = await centreOfWords("Hello there");
  await page.mouse.click(hello.x, hello.y, { button: "right" });
  await page.waitForSelector(".studio-context-menu [data-command='edit-text']");
  await page.click(".studio-context-menu [data-command='edit-text']");
  await waitFor(async () => (await typing()) === "Hello there", "Edit text to type on the slide");
  await page.keyboard.type("Bye");
  await page.keyboard.press("Enter");
  await waitFor(async () => (await read()).includes('text("Bye");'), "the words chosen with Edit text to be written");

  // Every change was one step: undo takes the last one back.
  await page.focus(".cm-content");
  await page.keyboard.down("Control");
  await page.keyboard.press("z");
  await page.keyboard.up("Control");
  await waitFor(async () => (await read()).includes('text("Hello there");'), "undo to take the typing back");

  assert.deepEqual(errors, [], "the Studio must not throw");
  console.log("Studio typing test passed: words typed on the slide are written into their strings, in their own quotes, and the rest says why not.");
} finally {
  await browser?.close();
  child.kill();
}
