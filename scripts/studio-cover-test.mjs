#!/usr/bin/env node

// A cover drawn from the presentation's details, edited in FrameSeq Studio: its words are selected
// and typed on the slide, set in Current slide, and written into presentation(); the cover can
// also be turned into text of its own. A poster's header is edited the same way.

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
const workspace = resolve(packageRoot, "tmp", "studio-cover-test");
const deck = resolve(workspace, "talk.slides.ts");
const screenshots = process.env.FRAMESEQ_TEST_SCREENSHOTS;

const source = [
  "presentation({",
  '  title: "Cover test",',
  '  author: "Ada",',
  '  theme: "minimal-academic",',
  "});",
  "",
  "slide().cover();",
  "",
  'slide("Next");',
  'text("Body");',
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

  /** The page point at the middle of a detail the cover shows. */
  const detailPoint = async (field) => {
    const box = await waitFor(() => preview.evaluate((wanted) => {
      const element = document.querySelector(`#app .frameseq-slide-frame.is-active [data-frameseq-meta="${wanted}"]`);
      if (!element) return undefined;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x: x + width / 2, y: y + height / 2 };
    }, field).catch(() => undefined), `the cover's ${field}`);
    return { x: frameBox.x + box.x, y: frameBox.y + box.y };
  };
  const typing = () => preview.evaluate(() => document.querySelector("#app .is-frameseq-typing")?.textContent ?? null)
    .catch(() => null);
  const detailBox = (name) => `.studio-object-card.is-details input[aria-label='${name}']`;
  const shows = (field, words) => waitFor(() => preview.evaluate((wanted, text) => {
    const element = document.querySelector(`#app .frameseq-slide-frame.is-active [data-frameseq-meta="${wanted}"]`);
    return element?.textContent === text && !element.classList.contains("is-frameseq-typing");
  }, field, words).catch(() => false), `the cover to show its ${field} as “${words}”`);

  // ── Current slide lists the details the cover is drawn from ────────────────────────────
  await page.waitForSelector(".studio-object-card.is-details");
  assert.equal(await page.$eval(".studio-object-card.is-details .studio-card-heading", (heading) => heading.textContent), "Cover");
  assert.equal(await page.$eval(detailBox("Title"), (input) => input.value), "Cover test");
  assert.equal(await page.$eval(detailBox("Author"), (input) => input.value), "Ada");
  assert.equal(await page.$eval(detailBox("Subtitle"), (input) => input.value), "");

  // ── A click selects a detail, as an object, and leads to presentation() ────────────────
  const title = await detailPoint("title");
  await page.mouse.click(title.x, title.y);
  await waitFor(() => preview.evaluate(() => Boolean(document.querySelector("#app .is-frameseq-selected[data-frameseq-meta='title']")))
    .catch(() => false), "the title to be selected on the slide");
  await waitFor(() => page.evaluate(() => {
    const { view } = window.frameseqStudio;
    const { from, to } = view.state.selection.main;
    return view.state.doc.sliceString(from, to) === '"Cover test"'
      && document.querySelector(".studio-object-card.is-details .studio-card-row.is-highlighted")?.textContent.includes("Title");
  }), "the title's option to be selected in the code and in Current slide");

  // ── A double-click types it on the slide, and Enter writes it into presentation() ──────
  await page.mouse.click(title.x, title.y, { clickCount: 2 });
  await waitFor(async () => (await typing()) === "Cover test", "the title to be typed on the slide");
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.type("New title");
  await page.keyboard.press("Enter");
  await waitFor(async () => (await read()).includes('  title: "New title",\n'), "the typed title to be written into presentation()");
  await shows("title", "New title");

  // ── Current slide adds a detail on a line of its own, and clearing one takes it away ───
  await page.click(detailBox("Subtitle"));
  await page.keyboard.type("A subtitle");
  await page.keyboard.press("Enter");
  await waitFor(async () => (await read()).includes('  theme: "minimal-academic",\n  subtitle: "A subtitle",\n});'), "the subtitle to be added");
  await shows("subtitle", "A subtitle");
  await page.click(detailBox("Author"), { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");
  await waitFor(async () => !(await read()).includes("author:"), "the emptied author to be taken away");
  await waitFor(() => preview.evaluate(() => !document.querySelector("#app [data-frameseq-meta='author']")).catch(() => false),
    "the cover to show no author");
  if (screenshots) await page.screenshot({ path: resolve(screenshots, "cover-details.png") });

  // ── Delete leaves a detail alone, and says where it is cleared ───────────────────────────
  const beforeDelete = await read();
  const subtitle = await detailPoint("subtitle");
  await page.mouse.click(subtitle.x, subtitle.y);
  await page.keyboard.press("Delete");
  await delay(400);
  assert.equal(await read(), beforeDelete, "Delete does not take a detail away");

  // ── The cover becomes text of its own ───────────────────────────────────────────────────
  await page.mouse.click(subtitle.x, subtitle.y, { button: "right" });
  await page.waitForSelector(".studio-context-menu [data-command='convert-cover']");
  assert.deepEqual(
    await page.$$eval(".studio-context-menu .studio-menu-item", (items) => items.map((item) => item.dataset.command)),
    ["edit-text", "go-to-code", "convert-cover"],
    "a detail's menu types it, shows its code, and converts the cover",
  );
  await page.click(".studio-context-menu [data-command='convert-cover']");
  await waitFor(
    async () => (await read()).includes('slide().cover();\ntext("New title").hero();\ntext("A subtitle").subtitle();\n'),
    "the cover's words to be written on its slide",
  );
  await waitFor(() => preview.evaluate(() => {
    const active = document.querySelector("#app .frameseq-slide-frame.is-active");
    return Boolean(active?.querySelector(".frameseq-cover-title[data-frameseq-source]")) && !active.querySelector("[data-frameseq-meta]");
  }).catch(() => false), "the cover to be drawn from its own text");
  await waitFor(() => page.evaluate(() => !document.querySelector(".studio-object-card.is-details")), "Current slide to list the cover's objects instead");

  // ── A poster's header is edited the same way ─────────────────────────────────────────────
  await writeFile(deck, [
    'poster({ title: "Poster title", author: "Grace" });',
    'text("Findings");',
    "",
  ].join("\n"), "utf8");
  await waitFor(() => page.evaluate(() => document.querySelector(".studio-object-card.is-details .studio-card-heading")?.textContent === "Poster header"),
    "Current slide to list the poster header's details");
  const author = await detailPoint("author");
  await page.mouse.click(author.x, author.y, { clickCount: 2 });
  await waitFor(async () => (await typing()) === "Grace", "the poster's author to be typed on the slide");
  // The caret lands where the words were double-clicked; End takes it after them.
  await page.keyboard.press("End");
  await page.keyboard.type(" Hopper");
  await page.keyboard.press("Enter");
  await waitFor(async () => (await read()).includes('poster({ title: "Poster title", author: "Grace Hopper" });'), "the poster's author to be written");

  assert.deepEqual(errors, [], "the Studio must not throw");
  console.log("Studio cover test passed: a cover's and a poster header's details are selected, typed on the slide, set in Current slide, and converted to text of their own.");
} finally {
  await browser?.close();
  child.kill();
}
