#!/usr/bin/env node

// Putting objects onto a slide from the Studio: a shape dragged out in the preview is written
// where it was drawn, a connector dragged between two objects names them and follows them, and
// content such as a formula, a table, or a picture is written after the selected object.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const workspace = resolve(packageRoot, "tmp", "studio-insert-test");
// A picture outside the presentation's folder, which inserting it copies in beside the slides.
const pictures = resolve(packageRoot, "tmp", "studio-insert-pictures");
const picture = resolve(pictures, "dot.png");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
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
await rm(pictures, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
await mkdir(pictures, { recursive: true });
await writeFile(picture, png);

const child = spawn(process.execPath, [cli, "studio", "talk.slides.ts", "--no-open"], {
  cwd: workspace,
  // No dialog of this computer's own: the Studio asks for a picture's path in the page instead.
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

  // The gallery lists content, named, and every shape, each drawn from its own outline.
  await page.click("[data-action='insert']");
  await page.waitForSelector(".studio-insert-gallery");
  const kinds = await page.$$eval(".studio-insert-item", (items) => items.map((item) => item.dataset.kind));
  assert.equal(kinds.length, 45, "the gallery must offer 13 kinds of content, 27 shapes, text, a line, an arrow, a connector, and a polygon");
  assert.ok(kinds.includes("diamond") && kinds.includes("cylinder") && kinds.includes("connector") && kinds.includes("polygon"));
  assert.ok(["typst", "math", "latex", "table", "chart", "image"].every((kind) => kinds.includes(kind)));
  assert.equal(
    await page.$eval(".studio-insert-item[data-kind='typst'] .studio-insert-label", (label) => label.textContent),
    "Typst formula",
    "content is named in the gallery",
  );
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

  // Its placeholder is typed over on the slide itself, selected as it arrives.
  await waitFor(() => preview.evaluate(() => {
    const typing = document.querySelector("#app .is-frameseq-typing");
    return Boolean(typing?.closest("[data-frameseq-shape='diamond']")) && getSelection()?.toString() === "Text";
  }).catch(() => false), "the diamond's placeholder to be selected on the slide, ready to be typed over");
  await page.keyboard.type("Valid?");
  await page.keyboard.press("Enter");
  await waitFor(async () => (await read()).includes('shape("diamond", "Valid?")'), "the words typed on the slide to be written");

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
  assert.match(connected, /shape\("diamond", "Valid\?"\)[^\n]*\.as\("shape1"\);/);
  assert.match(connected, /rect\("Box"\)[^\n]*\.as\("box1"\);/);
  // A redraw is laid out out of sight first, then swapped into #app, which is what is seen and
  // clicked; until then the old slide, without the diamond's new name, is still there.
  await waitFor(() => preview.evaluate(() => Boolean(
    document.querySelector("#app .frameseq-slide-frame.is-active [data-frameseq-node='line'] line")
    && document.querySelector("#app [data-frameseq-shape='diamond'][data-frameseq-name='shape1']"),
  )).catch(() => false), "the connector to be drawn");
  if (screenshots) await page.screenshot({ path: resolve(screenshots, "insert-connected.png") });

  // Delete in the preview removes the selected shape's lines and the connector that ends at it;
  // the object at the connector's other end keeps its name. One undo brings both back.
  const diamondCentre = await waitFor(() => preview.evaluate(() => {
    const shape = document.querySelector("#app .frameseq-slide-frame.is-active [data-frameseq-shape='diamond']");
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

  // A polygon is clicked in corner by corner: Backspace takes back a corner, and a double-click
  // puts down the last one and writes the polygon, its corners counted from its top-left.
  await page.evaluate(() => document.querySelector("[data-action='insert']").click());
  await page.click(".studio-insert-item[data-kind='polygon']");
  await preview.waitForFunction(() => document.documentElement.classList.contains("frameseq-placing"));
  const polygonSlide = await preview.evaluate(() => {
    const canvas = document.querySelector(".frameseq-slide-frame.is-active .frameseq-slide");
    const box = canvas.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height, scale: box.width / canvas.offsetWidth };
  });
  const corner = (dx, dy) => ({
    x: frameBox.x + polygonSlide.x + polygonSlide.width * 0.55 + dx * polygonSlide.scale,
    y: frameBox.y + polygonSlide.y + polygonSlide.height * 0.12 + dy * polygonSlide.scale,
  });
  for (const [dx, dy] of [[0, 0], [120, 0], [40, 200]]) {
    const { x, y } = corner(dx, dy);
    await page.mouse.click(x, y);
  }
  await page.keyboard.press("Backspace");
  const last = corner(120, 90);
  await page.mouse.click(last.x, last.y, { clickCount: 2 });
  const polygonText = await waitFor(async () => {
    const text = await read();
    return /polygon\(\[\[0, 0\], \[\d+, 0\], \[\d+, \d+\]\]\)\.position\(\{ x: -?\d+, y: -?\d+ \}\);/.test(text) && text;
  }, "the polygon to be written");
  const [, bx, cx, cy] = polygonText.match(/polygon\(\[\[0, 0\], \[(\d+), 0\], \[(\d+), (\d+)\]\]\)/).map(Number);
  assert.ok(Math.abs(bx - 120) <= 2 && Math.abs(cx - 120) <= 2 && Math.abs(cy - 90) <= 2, `the polygon keeps the corners clicked, not ${[bx, cx, cy]}`);
  await waitFor(() => preview.evaluate(() => Boolean(
    document.querySelector("#app .frameseq-slide-frame.is-active [data-frameseq-shape='polygon'] .frameseq-shape-body"),
  )).catch(() => false), "the polygon to be drawn");

  // On a canvas nothing flows, so a formula is drawn like a shape: a click places it there.
  await page.evaluate(() => document.querySelector("[data-action='insert']").click());
  await page.click(".studio-insert-item[data-kind='math']");
  await preview.waitForFunction(() => document.documentElement.classList.contains("frameseq-placing"));
  const canvasBox = await preview.evaluate(() => {
    const box = document.querySelector(".frameseq-slide-frame.is-active .frameseq-slide").getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  await page.mouse.click(frameBox.x + canvasBox.x + canvasBox.width * 0.3, frameBox.y + canvasBox.y + canvasBox.height * 0.75);
  await waitFor(
    async () => /math`E = mc\^2`\.position\(\{ x: -?\d+, y: -?\d+ \}\)\.width\(480\);/.test(await read()),
    "the formula to be placed on the canvas",
  );

  // A slide that flows takes content after the selected object, and Current slide opens the new
  // object's settings with its words selected, to be typed over.
  await page.evaluate(() => {
    const { view } = window.frameseqStudio;
    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('text("Hello")') } });
    view.focus();
  });
  await waitFor(async () => {
    if (await preview.evaluate(() => document.querySelector("#app .frameseq-slide-frame.is-active")?.dataset.index === "0").catch(() => false)) return true;
    // The slide's number in the editor's gutter shows it, should following the cursor be slow.
    await page.evaluate(() => {
      const marker = [...document.querySelectorAll(".cm-slide-marker")].find((element) => element.textContent.trim() === "1");
      marker?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      marker?.click();
      const { view } = window.frameseqStudio;
      view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('text("Hello")') } });
    });
    await delay(500);
    return false;
  }, "the preview to show the first slide");
  const insert = async (kind) => {
    await page.evaluate(() => document.querySelector("[data-action='insert']").click());
    await page.waitForSelector(`.studio-insert-item[data-kind='${kind}']`);
    await page.click(`.studio-insert-item[data-kind='${kind}']`);
  };
  await insert("typst");
  await waitFor(
    async () => (await read()).includes('text("Hello");\ntypst`\n  $ sum_(k=1)^n k = (n(n + 1)) / 2 $\n`;\n'),
    "the Typst formula to be written after the selected text",
  );
  await waitFor(() => page.evaluate(() => (
    Boolean(document.activeElement?.closest(".studio-object-card"))
    && document.activeElement.value === "$ sum_(k=1)^n k = (n(n + 1)) / 2 $"
    && document.activeElement.selectionStart === 0
    && document.activeElement.selectionEnd === document.activeElement.value.length
  )), "the formula's source to take the focus, selected, in Current slide");
  await page.keyboard.type("$ a^2 + b^2 = c^2 $");
  await page.keyboard.down("Control");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Control");
  await waitFor(async () => (await read()).includes("typst`\n  $ a^2 + b^2 = c^2 $\n`;"), "typing to replace the sample formula");

  // A picture from elsewhere on the computer is copied beside the presentation first.
  await insert("image");
  const pathField = await page.waitForSelector("dialog.studio-dialog input");
  await pathField.type(picture);
  await page.keyboard.press("Enter");
  await waitFor(
    async () => (await read()).includes('`;\nimage(new URL("./images/dot.png", import.meta.url).href, "Picture");\n'),
    "the picture to be written after the formula",
  );
  assert.ok(existsSync(resolve(workspace, "images", "dot.png")), "the picture is copied into the presentation's folder");
  await waitFor(() => preview.evaluate(() => {
    const image = document.querySelector(".frameseq-slide-frame.is-active img");
    return Boolean(image?.complete && image.naturalWidth > 0);
  }).catch(() => false), "the picture to show in the preview");

  // An icon is chosen by its picture, from a search over the whole set.
  await insert("icon");
  await page.waitForSelector(".studio-icon-choice", { timeout: 20_000 });
  await page.keyboard.type("rocket");
  await waitFor(() => page.$$eval(".studio-icon-choice", (items) => items.length > 0 && items.every((item) => item.dataset.name.includes("rocket"))),
    "the search to narrow the icons");
  await page.keyboard.press("Enter");
  await waitFor(async () => (await read()).includes('.href, "Picture");\nicon("rocket");\n'), "the chosen icon to be written after the picture");

  // New text is typed on the slide, its sample words selected. Words typed with a formula in them
  // are written as text`...`, which keeps the backslashes as typed, where "..." would need each
  // one doubled.
  await insert("paragraph");
  await waitFor(() => preview.evaluate(() => {
    const typing = document.querySelector("#app .is-frameseq-typing");
    return typing?.textContent === "Type your text here" && getSelection()?.toString() === "Type your text here";
  }).catch(() => false), "the new text's words to be selected on the slide");
  await page.keyboard.type(String.raw`Area $\frac{1}{2}ab$`);
  await page.keyboard.press("Enter");
  await waitFor(async () => (await read()).includes('icon("rocket");\ntext`Area $\\frac{1}{2}ab$`;\n'), "the words to be written as a template");

  // A formula typed into a quoted string by hand loses its backslashes; Problems says so, and
  // its fix writes the string as a template.
  await page.evaluate((line) => {
    const { view } = window.frameseqStudio;
    const at = view.state.doc.toString().indexOf("\n", view.state.doc.toString().indexOf("text`Area"));
    view.dispatch({ changes: { from: at, insert: line } });
  }, String.raw`
text("Angle $\theta$");`);
  await waitFor(() => page.evaluate(() => [...document.querySelectorAll(".studio-problem")]
    .some((row) => row.textContent.includes("\\theta lost its backslash"))), "the lost backslash to be reported");
  await page.evaluate(() => document.querySelector(".studio-problem-fix").click());
  await waitFor(async () => (await read()).includes('text`Area $\\frac{1}{2}ab$`;\ntext`Angle $\\theta$`;\n'), "the fix to write a template");
  await waitFor(() => page.evaluate(() => !document.querySelector(".studio-problem-fix")), "the formula problem to clear");

  // In the editor the same content is a snippet at the start of a line.
  await page.evaluate(() => {
    const { view } = window.frameseqStudio;
    const text = view.state.doc.toString();
    view.dispatch({ selection: { anchor: text.indexOf("\n", text.indexOf('text("Hello");')) } });
    view.focus();
  });
  await page.keyboard.press("Enter");
  await page.keyboard.type("chart");
  // The list redraws when TypeScript's completions arrive, so press the item it shows now.
  await waitFor(() => page.evaluate(() => {
    const item = document.querySelector(".cm-tooltip-autocomplete li:has(.cm-completionIcon-snippet)");
    item?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    return Boolean(item);
  }), "the chart snippet to be offered");
  await waitFor(
    async () => (await read()).includes('text("Hello");\nchart("bar", { "Q1": 12, "Q2": 18, "Q3": 25 });\n'),
    "the chart snippet to be written",
  );
  if (screenshots) await page.screenshot({ path: resolve(screenshots, "insert-content.png") });

  // Current slide writes a copy of the selected object after it.
  await page.evaluate(() => [...document.querySelectorAll(".studio-tree-row")].find((row) => row.textContent.includes("Hello"))?.click());
  await page.waitForSelector(".studio-object-card .studio-card-icon.is-duplicate");
  await page.click(".studio-object-card .studio-card-icon.is-duplicate");
  await waitFor(async () => (await read()).includes('text("Hello");\ntext("Hello");\nchart('), "the text to be duplicated after itself");

  assert.deepEqual(errors, [], "the Studio must not throw");
  console.log("Studio insert test passed.");
} finally {
  await browser?.close();
  child.kill();
}
