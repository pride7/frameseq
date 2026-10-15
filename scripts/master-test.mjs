#!/usr/bin/env node

// Slide masters, the way PowerPoint has them: master() draws objects behind every slide that uses
// it, placeholder() says where those slides put their title and content, and FrameSeq Studio's
// master view edits the master pages as slides are edited.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import JSZip from "jszip";
import puppeteer from "puppeteer";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";
import { inspectSource } from "./frameseq-inspect.mjs";
import { documentStatements } from "./source-marks.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const fixture = resolve(packageRoot, "scripts", "fixtures", "masters.slides.ts");
const output = resolve(packageRoot, "tmp", "master-test");
const workspace = resolve(output, "studio");
const deck = resolve(workspace, "talk.slides.ts");
const screenshots = process.env.FRAMESEQ_TEST_SCREENSHOTS;
const framework = await import(pathToFileURL(resolve(packageRoot, "lib", "index.js")).href);

const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: packageRoot, encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
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

await rm(output, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
await mkdir(workspace, { recursive: true });

// ── The language ───────────────────────────────────────────────────────────────────────────
{
  const { presentation, master, placeholder, slide, text, getActivePresentation } = framework;
  presentation({ title: "Masters" });
  master("content").background("#eef");
  text("{page} / {total}").position({ x: 1100, y: 680 });
  placeholder("title").position({ x: 60, y: 20 }).width(1160).height(80).color("#fff");
  slide("One");
  slide({ name: "Two" }).master(false);
  const slides = getActivePresentation();
  // A master stays out of the slides: two slides, one master.
  assert.equal(slides.slides.length, 2);
  assert.deepEqual(Object.keys(slides.masters), ["content"]);
  const page = slides.masters.content;
  assert.equal(page.props.masterPage, "content");
  assert.equal(page.styles.background, "#eef");
  assert.equal(page.children.length, 2);
  assert.equal(page.children[1].props.placeholder, "title");
  assert.equal(slides.slides[1].props.master, false);

  presentation({ title: "Errors" });
  assert.throws(() => placeholder(), /placeholder\(\) marks where a slide's content goes on a master page/);
  master("cover");
  assert.throws(() => master("cover"), /master\("cover"\) is written twice/);
  placeholder("title");
  assert.throws(() => placeholder("title"), /already has a title placeholder/);
  assert.throws(() => placeholder("footer"), /expects "body", "title", "subtitle", or "author"/);
  assert.throws(() => master("two words"), /master\(\) expects a name/);
  slide("Asks for a missing master").master("section");
  assert.throws(() => getActivePresentation(), /Slide 1 asks for master\("section"\), which this presentation does not define; it defines "cover"/);
}

// ── Inspection: master pages are reported beside the slides, never among them ─────────────────
{
  const source = await readFile(fixture, "utf8");
  const report = inspectSource(fixture, source, packageRoot);
  assert.equal(report.summary.slides, 4);
  assert.equal(report.summary.masters, 3);
  assert.deepEqual(report.masters.map((page) => page.master), ["cover", "content", "section"]);
  assert.deepEqual(report.masters[0].objects.map((object) => object.type), ["rect", "text", "placeholder", "placeholder", "placeholder"]);
  assert.ok(report.slides.every((page) => !page.objects.some((object) => object.type === "placeholder")));
  assert.deepEqual(report.slides[2].masterChoice?.value, "section");
  assert.equal(report.slides[3].masterChoice?.value, false);
  // Statements that begin a slide or a master page say so, so a slide's lines end before a master.
  const starts = documentStatements(source).map((statement) => statement.starts ?? "");
  assert.deepEqual(starts.filter(Boolean), ["master", "master", "master", "slide", "slide", "slide", "slide"]);
}

// ── Rendering, checks, and exports ─────────────────────────────────────────────────────────
{
  const checked = run("check", fixture, "--json");
  const report = JSON.parse(checked.stdout);
  // The master's objects are not counted again on every slide, and an empty slide drawn on a
  // master still has nothing of its own.
  assert.deepEqual(report.issues, [], JSON.stringify(report.issues, null, 2));

  const pptxPath = resolve(output, "masters.pptx");
  assert.equal(run("pptx", fixture, "--output", pptxPath).status, 0);
  const zip = await JSZip.loadAsync(await readFile(pptxPath));
  const slideXml = async (index) => zip.file(`ppt/slides/slide${index}.xml`).async("string");
  // The master's band and its {page} field are on the content slide, behind the slide's own text.
  const second = await slideXml(2);
  assert.match(second, /Diffusion Language Models · 2 \/ 4/);
  assert.ok(second.indexOf("1E3A8A") < second.indexOf("Motivation"), "the master's band must come before the title");
  // A master that paints the page paints the slide's background.
  assert.match(await slideXml(3), /<p:bg>[\s\S]*1E3A8A/);
  assert.doesNotMatch(await slideXml(4), /1E3A8A/, "a slide with master(false) has no master");

  const typstPath = resolve(output, "masters.typ");
  assert.equal(run("typst", fixture, "--output", typstPath).status, 0);
  const typst = await readFile(typstPath, "utf8");
  assert.match(typst, /#text\("Diffusion Language Models · 2 \/ 4"\)/);
  assert.match(typst, /inset: \(left: 45pt, top: 97\.5pt, right: 45pt, bottom: 52\.5pt\)/);
  assert.match(typst, /fill: rgb\("#1e3a8a"\),\n\)\[/, "a master's background fills its slides' pages");
}

// ── The renderer: layer, placeholders, and the master view ────────────────────────────────────
const browser = await puppeteer.launch(puppeteerLaunchOptions());
try {
  const built = resolve(output, "built");
  assert.equal(run("build", fixture, "--single-file", "--output", built).status, 0);
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(`${pathToFileURL(resolve(built, "index.html")).href}?print=1`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  const layout = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll(".frameseq-slide")];
    const box = (element, canvas) => {
      const rect = element.getBoundingClientRect();
      const origin = canvas.getBoundingClientRect();
      return { x: Math.round(rect.left - origin.left), y: Math.round(rect.top - origin.top), width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    return canvases.map((canvas) => ({
      master: canvas.dataset.frameseqMaster ?? null,
      layerFirst: canvas.firstElementChild?.classList.contains("frameseq-master-layer") ?? false,
      layerText: canvas.querySelector(".frameseq-master-layer")?.textContent ?? "",
      // Nothing on a master leads to the source from a slide.
      layerSources: canvas.querySelectorAll(".frameseq-master-layer [data-frameseq-source]").length,
      title: (() => {
        const title = canvas.querySelector(".frameseq-placeholder-box[data-frameseq-placeholder='title']");
        return title ? { ...box(title, canvas), color: getComputedStyle(title.firstElementChild).color } : null;
      })(),
      padding: getComputedStyle(canvas).padding,
    }));
  });
  assert.deepEqual(layout.map((slide) => slide.master), ["cover", "content", "section", null]);
  assert.ok(layout.slice(0, 3).every((slide) => slide.layerFirst), "the master is drawn first, behind the slide");
  assert.equal(layout[0].layerText, "University of Cambridge");
  assert.equal(layout[1].layerText, "Diffusion Language Models · 2 / 4");
  assert.ok(layout.every((slide) => slide.layerSources === 0));
  assert.deepEqual({ ...layout[0].title, color: undefined }, { x: 500, y: 180, width: 700, height: 220, color: undefined });
  assert.equal(layout[0].title.color, "rgb(30, 58, 138)");
  assert.equal(layout[1].title.color, "rgb(255, 255, 255)");
  assert.equal(layout[1].padding, "130px 60px 70px");
  if (screenshots) {
    for (const [index, frame] of (await page.$$(".frameseq-slide-frame")).entries()) {
      await frame.screenshot({ path: resolve(screenshots, `master-slide-${index + 1}.png`) });
    }
  }
} finally {
  await browser.close();
}

// ── FrameSeq Studio: the master view ──────────────────────────────────────────────────────────
await writeFile(deck, [
  'presentation({ title: "Master test", author: "Ada" });',
  "",
  'slide().cover();',
  'text("Master test").hero();',
  'text("Ada").author();',
  "",
  'slide("Intro");',
  'text("Hello");',
  "",
].join("\n"), "utf8");

const read = async () => {
  for (;;) {
    const first = await readFile(deck, "utf8");
    await delay(15);
    if (first === await readFile(deck, "utf8")) return first;
  }
};

const child = spawn(process.execPath, [cli, "studio", "talk.slides.ts", "--no-open"], {
  cwd: workspace,
  env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0", NO_COLOR: "1", FRAMESEQ_NO_DIALOGS: "1" },
  windowsHide: true,
});
let log = "";
const studioUrl = await new Promise((resolveAddress, rejectAddress) => {
  const timer = setTimeout(() => rejectAddress(new Error(`The Studio did not start.\n${log}`)), 60_000);
  const listen = (chunk) => {
    log += chunk.toString();
    const match = log.match(/Studio:\s+(https?:\/\/\S+studio\.html)/);
    if (match) {
      clearTimeout(timer);
      resolveAddress(match[1]);
    }
  };
  child.stdout.on("data", listen);
  child.stderr.on("data", listen);
  child.on("close", (code) => rejectAddress(new Error(`The Studio exited with ${code}.\n${log}`)));
});

let studio;
try {
  studio = await puppeteer.launch(puppeteerLaunchOptions());
  const page = await studio.newPage();
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
  const preview = () => page.frames().find((frame) => /frameseq-preview=studio(&|#|$)/.test(frame.url()));
  const rail = () => page.frames().find((frame) => /frameseq-preview=studio-rail/.test(frame.url()));

  // View › Slide master opens the master view, which says there are no masters yet.
  await page.click("[data-menu='view']");
  await page.click("[data-command='slide-master']");
  await waitFor(() => page.evaluate(() => !document.querySelector("[data-slot='master-bar']").hidden), "the master bar");
  assert.equal(await page.$eval("[data-slot='rail-title']", (node) => node.textContent), "Masters");
  await waitFor(() => preview()?.url().includes("masters=1"), "the preview to show the master pages");
  await waitFor(() => preview().evaluate(() => document.querySelector(".frameseq-master-empty")?.textContent).catch(() => ""), "the empty master view");

  // + adds the cover master, which starts from where the theme puts the cover's text.
  await page.click("[data-action='new-slide']");
  await page.waitForSelector(".studio-menu");
  await page.evaluate(() => [...document.querySelectorAll(".studio-menu button")].find((button) => button.textContent.includes("Cover master")).click());
  await waitFor(async () => (await read()).includes('master("cover");'), "the cover master to be written");
  const written = await read();
  assert.match(written, /presentation\(\{ title: "Master test", author: "Ada" \}\);\n\nmaster\("cover"\);\nplaceholder\("title"\)\.position\(\{ x: 96, y: 144 \}\)\.width\(1088\)\.height\(230\)\.justify\("end"\);/);
  assert.ok(written.indexOf('master("cover")') < written.indexOf("slide().cover()"), "a master is written before the slides");
  await waitFor(() => preview().evaluate(() => document.querySelectorAll(".frameseq-master-page").length === 1).catch(() => false), "the cover master in the preview");
  const boxes = await preview().evaluate(() => [...document.querySelectorAll(".frameseq-placeholder")].map((box) => ({
    role: box.dataset.frameseqPlaceholder,
    sample: box.textContent,
    movable: box.dataset.frameseqMove === "true",
  })));
  assert.deepEqual(boxes, [
    { role: "title", sample: "Master test", movable: true },
    { role: "subtitle", sample: "Subtitle", movable: true },
    { role: "author", sample: "Ada", movable: true },
  ]);
  if (screenshots) await page.screenshot({ path: resolve(screenshots, "master-view.png") });

  // Insert › Placeholders draws a body placeholder onto the master.
  await page.click("[data-action='insert']");
  await page.waitForSelector(".studio-insert-gallery [data-kind='placeholder-body']");
  await page.click(".studio-insert-gallery [data-kind='placeholder-body']");
  await waitFor(() => preview().evaluate(() => document.documentElement.classList.contains("frameseq-placing")).catch(() => false), "placing");
  const frameBox = await page.$eval(".studio-preview-frame", (frame) => frame.getBoundingClientRect().toJSON());
  const canvasBox = await preview().evaluate(() => document.querySelector(".frameseq-slide-frame.is-active .frameseq-slide").getBoundingClientRect().toJSON());
  const scale = canvasBox.width / 1280;
  const at = (x, y) => ({ x: frameBox.left + canvasBox.left + x * scale, y: frameBox.top + canvasBox.top + y * scale });
  const from = at(100, 40);
  const to = at(500, 100);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await waitFor(async () => /placeholder\(\)\.position\(\{ x: \d+, y: \d+ \}\)\.width\(\d+\)\.height\(\d+\);/.test(await read()), "the body placeholder to be written");
  const afterPlaceholder = await read();
  assert.ok(
    afterPlaceholder.indexOf("placeholder().") < afterPlaceholder.indexOf("slide().cover()"),
    "a placeholder drawn on a master is written into the master, before the slides",
  );

  // Closing the master view shows the slides again, drawn on the new master.
  await page.click("[data-action='close-masters']");
  await waitFor(() => preview() && !preview().url().includes("masters=1"), "the preview to show the slides");
  await waitFor(() => preview().evaluate(() => document.querySelector(".frameseq-slide")?.dataset.frameseqMaster === "cover").catch(() => false), "the cover drawn on its master");

  // Slide › Master draws the second slide on no master, and back.
  await page.evaluate(() => {
    const { view } = window.frameseqStudio;
    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('text("Hello")') } });
    view.focus();
  });
  await waitFor(() => preview().evaluate(() => document.querySelector(".frameseq-slide-frame.is-active")?.dataset.index === "1").catch(() => false), "the second slide");
  await page.click("[data-menu='slide']");
  await page.hover("[data-command='slide-master-choice']");
  await page.waitForSelector("[data-command='master-none']");
  await page.click("[data-command='master-none']");
  await waitFor(async () => (await read()).includes('slide("Intro").master(false);'), "the slide to name no master");
  await page.click("[data-menu='slide']");
  await page.hover("[data-command='slide-master-choice']");
  await page.waitForSelector("[data-command='master-automatic']");
  await page.click("[data-command='master-automatic']");
  await waitFor(async () => (await read()).includes('slide("Intro");'), "the slide to use its usual master again");

  assert.deepEqual(errors, []);
} finally {
  await studio?.close();
  child.kill();
}

console.log("Master test passed.");
