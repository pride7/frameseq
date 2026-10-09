#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { get } from "node:http";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const workspace = resolve(packageRoot, "tmp", "studio-test");
const deck = resolve(workspace, "talk.slides.ts");

// Written with CRLF line breaks on every platform: the preview reports offsets into the file
// as stored, the editor counts "\n" only, and every edit has to land on the same characters.
const source = [
  'presentation({ title: "Studio test", theme: "midnight" });',
  "",
  'slide("Intro");',
  'text("Hello");',
  'text("Second line");',
  "",
  'slide("Canvas").canvas();',
  'rect("Box").position({ x: 120, y: 140 }).width(200).height(100);',
  "",
  'slide("Third");',
  'text("Last slide");',
  "",
].join("\r\n");

// A save replaces the file's contents in place, so a read that lands mid-write sees part of it.
const read = async () => {
  for (;;) {
    const first = await readFile(deck, "utf8");
    await delay(15);
    const second = await readFile(deck, "utf8");
    if (first === second) return second;
  }
};
const lf = (text) => text.replaceAll("\r\n", "\n");

async function waitFor(check, message, timeout = 20_000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`Timed out: ${message}`);
    await delay(100);
  }
}

function startServer(command, entry) {
  const child = spawn(process.execPath, [cli, command, entry, "--no-open"], {
    cwd: workspace,
    env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0", NO_COLOR: "1" },
    windowsHide: true,
  });
  let output = "";
  const address = new Promise((resolveAddress, rejectAddress) => {
    const timer = setTimeout(() => rejectAddress(new Error(`The ${command} server did not start.\n${output}`)), 60_000);
    const read = (chunk) => {
      output += chunk.toString();
      const pattern = command === "studio"
        ? /Studio:\s+(https?:\/\/\S+studio\.html)/
        : /(https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/)/;
      const match = output.match(pattern);
      if (match) {
        clearTimeout(timer);
        resolveAddress(match[1]);
      }
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.on("close", (code) => rejectAddress(new Error(`The ${command} server exited with ${code}.\n${output}`)));
  });
  return { child, address, log: () => output };
}

// A virus scanner or an editor's file watcher can hold the folder for a moment on Windows.
await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
await mkdir(workspace, { recursive: true });
await writeFile(deck, source, "utf8");

const server = startServer("studio", "talk.slides.ts");
let browser;
let page;
try {
  const studioUrl = await server.address;
  const origin = new URL(studioUrl).origin;

  // The Studio's API answers only its own page, and only with the session token.
  const anonymous = await fetch(`${origin}/__frameseq/studio/source`);
  assert.equal(anonymous.status, 403, "reading the document without the token must be refused");
  const crossOrigin = await fetch(`${origin}/__frameseq/studio/session`, {
    headers: { Origin: "https://example.com" },
  });
  assert.equal(crossOrigin.status, 403, "another site must not obtain the session token");
  // A domain made to resolve to this computer is not the Studio's origin, whatever it claims.
  const rebound = await new Promise((resolveStatus, rejectStatus) => {
    const request = get({
      hostname: new URL(origin).hostname,
      port: new URL(origin).port,
      path: "/__frameseq/studio/session",
      headers: { Host: `rebound.example:${new URL(origin).port}` },
    }, (response) => {
      response.resume();
      resolveStatus(response.statusCode);
    });
    request.on("error", rejectStatus);
  });
  assert.equal(rebound, 403, "a rebound host name must not obtain the session token");
  const session = await (await fetch(`${origin}/__frameseq/studio/session`)).json();
  const forged = await fetch(`${origin}/__frameseq/studio/source`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-FrameSeq-Studio": session.token, Origin: "https://example.com" },
    body: JSON.stringify({ text: "overwritten" }),
  });
  assert.equal(forged.status, 403, "a write sent from another site must be refused");
  assert.equal(await read(), source, "a refused write must not touch the document");

  browser = await puppeteer.launch(puppeteerLaunchOptions());
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(studioUrl, { waitUntil: "networkidle2" });
  await page.waitForFunction(
    () => document.querySelector("[data-slot='check-state']")?.textContent?.includes("Layout checked"),
    { timeout: 120_000 },
  );
  const editorText = () => page.evaluate(() => window.frameseqStudio.text);
  const saveState = () => page.$eval("[data-slot='save-state']", (element) => element.dataset.state);
  const problems = () => page.$$eval(".studio-problem", (rows) => rows.map((row) => row.textContent));
  const preview = page.frames().find((frame) => /frameseq-preview=studio(#|$)/.test(frame.url()));
  const rail = page.frames().find((frame) => frame.url().includes("thumbnails=1"));
  assert.ok(preview && rail, "the preview and the slide rail must be embedded");
  const activeSlide = () => preview
    .evaluate(() => Number(document.querySelector(".frameseq-slide-frame.is-active")?.dataset.index))
    .catch(() => undefined);
  const placeCursor = (text, offset = 0) => page.evaluate((wanted, shift) => {
    const { view } = window.frameseqStudio;
    const index = view.state.doc.toString().indexOf(wanted);
    if (index < 0) throw new Error(`Missing ${wanted}`);
    view.dispatch({ selection: { anchor: index + shift } });
    view.focus();
  }, text, offset);
  // Every save redraws the preview and the rail. A gesture waits for its frame to settle,
  // retries when what it touched was replaced, and checks that it took effect.
  const replaced = (error) => /detached|not clickable|Execution context|Cannot find context|Cannot read prop/.test(String(error));
  const retrying = async (action) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await action();
      } catch (error) {
        if (attempt >= 40 || !replaced(error)) throw error;
        await delay(100);
      }
    }
  };
  /** Wait until a frame has shown the same deck for a moment, so no gesture lands mid-swap. */
  const settle = async (frame) => {
    let previous;
    await waitFor(async () => {
      const probe = await frame.evaluate(() => {
        const root = document.querySelector(".frameseq-slides");
        if (!root) return undefined;
        root.dataset.settleProbe ??= Math.random().toString(36).slice(2);
        return root.dataset.settleProbe;
      }).catch(() => undefined);
      const settled = probe !== undefined && probe === previous;
      previous = probe;
      if (!settled) await delay(250);
      return settled;
    }, "a frame to settle");
  };
  const clickThumbnail = async (index, options) => {
    await settle(rail);
    await retrying(async () => (await rail.$$(".frameseq-thumbnail"))[index].click(options));
  };
  const showSlide = async (index) => {
    await waitFor(async () => {
      if ((await activeSlide()) === index) return true;
      await clickThumbnail(index);
      await delay(300);
      return (await activeSlide()) === index;
    }, `the preview to show slide ${index + 1}`);
  };
  const openSlideMenu = async (index) => {
    await waitFor(async () => {
      await clickThumbnail(index, { button: "right" });
      return Boolean(await page.waitForSelector(".studio-menu", { timeout: 1500 }).catch(() => null));
    }, `the menu of slide ${index + 1}`);
  };
  const setEditMode = async (on) => {
    await waitFor(async () => {
      await settle(preview);
      const pressed = await preview
        .$eval("[data-action='edit-toggle']", (button) => button.getAttribute("aria-pressed"))
        .catch(() => undefined);
      if (pressed === String(on)) return true;
      await retrying(() => preview.click("[data-action='edit-toggle']"));
      return false;
    }, `layout editing to turn ${on ? "on" : "off"}`);
  };
  const undoInEditor = async (times = 1) => {
    await page.focus(".cm-content");
    for (let index = 0; index < times; index += 1) {
      await page.keyboard.down("Control");
      await page.keyboard.press("z");
      await page.keyboard.up("Control");
    }
  };

  assert.equal(await editorText(), lf(source), "the editor must open the document with plain line breaks");
  assert.equal(await page.$eval("[data-slot='status-format']", (element) => element.textContent), "CRLF");
  assert.equal(await rail.$$eval(".frameseq-thumbnail", (items) => items.length), 3, "the rail must show every slide");
  assert.deepEqual(await problems(), [], "a clean deck must report no problems");

  // Typing saves on its own, keeps the file's line breaks, and the preview follows.
  await placeCursor('"Hello"', 6);
  await page.keyboard.type(" world", { delay: 20 });
  await waitFor(async () => (await read()).includes('text("Hello world");\r\n'), "auto-save with CRLF line breaks");
  assert.equal(lf(await read()), await editorText());
  await waitFor(
    () => preview.evaluate(() => document.querySelector(".frameseq-slide-frame.is-active")?.textContent?.includes("Hello world")),
    "the preview to show the typed text",
  );

  // Text that does not parse is never handed to the preview by auto-save.
  const beforeSyntax = await read();
  await placeCursor('text("Hello world");', 'text("Hello world");'.length);
  // A stray brace: the editor closes brackets as they are typed, but never opens one.
  await page.keyboard.type("\n}", { delay: 20 });
  await waitFor(async () => (await saveState()) === "blocked", "auto-save to refuse a syntax error");
  assert.equal(await read(), beforeSyntax, "a syntax error must not reach the file");
  await undoInEditor();
  await waitFor(async () => (await saveState()) === "saved", "the document to be clean again");

  // TypeScript reports mistakes in the Problems panel, and completes FrameSeq methods.
  await placeCursor('text("Last slide");', 'text("Last slide");'.length);
  await page.keyboard.type("\ntext(\"x\").nope();", { delay: 10 });
  await waitFor(async () => (await problems()).some((row) => row.includes("Property 'nope' does not exist")), "a TypeScript diagnostic");
  await undoInEditor();
  await waitFor(async () => (await problems()).length === 0, "the diagnostic to clear");
  await placeCursor('text("Last slide");', 'text("Last slide");'.length);
  await page.keyboard.type("\ntext(\"y\").hig", { delay: 30 });
  await page.waitForSelector(".cm-tooltip-autocomplete li", { timeout: 15_000 });
  const completions = await page.$$eval(".cm-tooltip-autocomplete li", (items) => items.map((item) => item.textContent));
  assert.ok(completions.includes("height"), `completions should offer height(), got ${completions.join(", ")}`);
  await page.keyboard.press("Escape");
  await undoInEditor();
  await waitFor(async () => (await editorText()) === lf(await read()) && !(await editorText()).includes("hig"), "the completion probe to be undone");
  await waitFor(async () => (await saveState()) === "saved", "the document to be saved after undo");

  // A thumbnail shows its slide and moves the editor to the line that starts it.
  await showSlide(1);
  assert.equal(await page.$eval("[data-slot='status-cursor']", (element) => element.textContent), "Ln 7, Col 1");

  // Dragging in the preview becomes an ordinary editor edit, saved to the right characters.
  const beforeDrag = await read();
  await setEditMode(true);
  await settle(preview);
  const box = await retrying(async () => (await preview.$(".frameseq-slide-frame.is-active [data-frameseq-move='true']")).boundingBox());
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) await page.mouse.move(startX + step * 5, startY + step * 4);
  await page.mouse.up();
  await waitFor(async () => (await read()) !== beforeDrag, "the drag to be written");
  const dragged = await read();
  assert.match(dragged, /rect\("Box"\)\.position\(\{ x: \d+, y: \d+ \}\)\.width\(200\)\.height\(100\);\r\n/);
  assert.notEqual(dragged.match(/x: (\d+)/)[1], "120", "the drag must change x");
  assert.equal(lf(dragged), await editorText(), "the editor must hold the dragged numbers");
  // Undo from the preview goes to the editor, which owns the history.
  await settle(preview);
  await retrying(() => preview.focus(".frameseq-slides"));
  await page.keyboard.down("Control");
  await page.keyboard.press("z");
  await page.keyboard.up("Control");
  await waitFor(async () => (await read()) === beforeDrag, "Ctrl+Z in the preview to undo the drag");

  // Objects selected together in the preview can be bound into one named region.
  await showSlide(0);
  await waitFor(async () => {
    await settle(preview);
    await retrying(async () => {
      const texts = await preview.$$(".frameseq-slide-frame.is-active .frameseq-text[data-frameseq-source]");
      await texts[0].click();
      await page.keyboard.down("Control");
      try {
        await texts[1].click();
      } finally {
        await page.keyboard.up("Control");
      }
    });
    return Boolean(await preview
      .waitForSelector(".frameseq-selection-toolbar.is-visible [data-action='bind-region']:not([hidden])", { timeout: 1500 })
      .catch(() => null));
  }, "two objects to be selected in the preview");
  await retrying(() => preview.click(".frameseq-selection-toolbar [data-action='bind-region']"));
  await page.waitForSelector(".studio-dialog input");
  assert.equal(await page.$eval(".studio-dialog input", (input) => input.value), "group");
  await page.click(".studio-dialog button[type='submit']");
  await waitFor(
    async () => (await read()).includes('at("group").column();\r\ntext("Hello world");\r\ntext("Second line");\r\nmain();\r\n'),
    "the selection to be bound into a region",
  );
  await undoInEditor();
  await waitFor(async () => (await read()) === beforeDrag, "undo to remove the binding");
  await setEditMode(false);

  // An edit made outside the Studio, by an agent or another editor, reloads the clean buffer,
  // and the layout check measures it at once.
  const overflowing = beforeDrag.replace(
    'text("Last slide");',
    'text("Last slide");\r\ntext("Overflow").position({ x: 1200, y: 640 }).width(400);',
  );
  await writeFile(deck, overflowing, "utf8");
  await waitFor(async () => (await editorText()) === lf(overflowing), "the external edit to reload");
  await waitFor(async () => (await problems()).some((row) => row.includes("exceeds the slide canvas")), "a live layout problem");
  await retrying(async () => (await page.$(".studio-problem.is-error")).click());
  await waitFor(async () => (await activeSlide()) === 2, "the problem to show its slide");
  await writeFile(deck, beforeDrag, "utf8");
  await waitFor(async () => (await editorText()) === lf(beforeDrag), "the deck to be restored");
  await waitFor(async () => (await problems()).length === 0, "the layout problem to clear");

  // With unsaved edits, a change on disk is a conflict the Studio asks about.
  await page.click(".studio-switch");
  await placeCursor('"Third"', 6);
  await page.keyboard.type(" slide", { delay: 10 });
  await writeFile(deck, beforeDrag.replace('text("Last slide");', 'text("Changed elsewhere");'), "utf8");
  await page.waitForSelector("[data-slot='banner']:not([hidden])", { timeout: 15_000 });
  assert.equal(await saveState(), "conflict");
  const [, keep] = await page.$$("[data-slot='banner-actions'] button");
  await keep.click();
  await waitFor(async () => (await read()).includes('slide("Third slide");'), "keeping the editor's version");
  assert.ok(!(await read()).includes("Changed elsewhere"), "keeping my version must overwrite the other change");
  await page.click(".studio-switch");

  // Slides can be duplicated and moved from the rail, and the editor's history undoes both.
  const beforeRail = await read();
  await openSlideMenu(0);
  const menu = await page.$$eval(".studio-menu-item", (items) => items.map((item) => item.textContent));
  await (await page.$$(".studio-menu-item"))[menu.findIndex((label) => label.startsWith("Duplicate"))].click();
  await waitFor(async () => ((await read()).match(/slide\("Intro"\)/g) ?? []).length === 2, "the duplicated slide");
  await waitFor(async () => (await rail.$$eval(".frameseq-thumbnail", (items) => items.length)) === 4, "the rail to show four slides");
  await undoInEditor();
  await waitFor(async () => (await read()) === beforeRail, "undo to remove the duplicate");

  await waitFor(async () => (await rail.$$eval(".frameseq-thumbnail", (items) => items.length)) === 3, "the rail to settle");
  await settle(rail);
  const thumbnails = await rail.$$(".frameseq-thumbnail");
  const third = await thumbnails[2].boundingBox();
  const first = await thumbnails[0].boundingBox();
  await page.mouse.move(third.x + third.width / 2, third.y + third.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(third.x + third.width / 2, third.y + third.height / 2 - ((third.y + third.height / 2 - first.y - 6) * step) / 12);
  }
  await page.mouse.up();
  await waitFor(async () => /^slide\("Third slide"\)/m.test(await read())
    && (await read()).indexOf('slide("Third slide")') < (await read()).indexOf('slide("Intro")'), "the rail drag to move slide 3 first");
  assert.ok((await read()).includes("\r\n"), "moving slides must keep CRLF line breaks");
  await undoInEditor();
  await waitFor(async () => (await read()) === beforeRail, "undo to restore the slide order");

  // A deck that throws while it runs keeps the last good preview and says why.
  await placeCursor('text("Last slide");', 'text("Last slide");'.length);
  await page.keyboard.type("\n(undefined as any).boom();", { delay: 5 });
  await waitFor(async () => (await problems()).some((row) => row.includes("boom")), "the runtime error to be reported");
  await undoInEditor();
  await waitFor(async () => (await read()) === beforeRail, "the runtime error to be undone");
  await waitFor(async () => (await problems()).length === 0, "the runtime error to clear once the preview renders");

  // Exports run the CLI with its usual output locations.
  await page.click("[data-action='export']");
  await page.waitForSelector(".studio-menu");
  const formats = await page.$$eval(".studio-menu-item", (items) => items.map((item) => item.textContent));
  await (await page.$$(".studio-menu-item"))[formats.findIndex((label) => label.startsWith("Single HTML file"))].click();
  await page.waitForFunction(
    () => [...document.querySelectorAll(".studio-toast")].some((toast) => toast.dataset.tone === "success" || toast.dataset.tone === "error"),
    { timeout: 180_000 },
  );
  const exported = await page.$$eval(".studio-toast[data-tone='success'] .studio-toast-text", (items) => items.map((item) => item.textContent));
  assert.ok(exported.some((message) => message.includes("dist/index.html")), `the export should report its file, got ${exported}`);
  assert.ok(existsSync(resolve(workspace, "dist", "index.html")), "the single-file export must exist");

  assert.deepEqual(errors, [], "the Studio page must not throw");

  // Slides made by a loop or a helper call belong to the statement that ran, and move, repeat,
  // and disappear with it; the slides around them still move one at a time.
  const generated = [
    'presentation({ title: "Generated", theme: "midnight" });',
    "",
    'slide("Intro");',
    'text("Hello");',
    "",
    "// Topics come from data.",
    'for (const topic of ["Alpha", "Beta", "Gamma"]) {',
    "  slide(topic);",
    "  text(`About ${topic}`);",
    "}",
    "",
    "function section(title: string): void {",
    "  slide(title);",
    '  text("Section");',
    "  slide(`${title}, continued`);",
    "}",
    "",
    'section("Part");',
    "",
    'slide("End");',
    'text("Last slide");',
    "",
  ].join("\r\n");
  const railLabels = () => rail.$$eval(".frameseq-thumbnail-label", (items) => items.map((item) => item.textContent));
  const slideOrder = async () => [...(await read()).matchAll(/^(?:slide\("([^"]+)"\)|for |section\("([^"]+)"\))/gm)]
    .map((match) => match[1] ?? match[2] ?? "loop");
  await writeFile(deck, generated, "utf8");
  await waitFor(async () => (await editorText()) === lf(generated), "the generated deck to load");
  await waitFor(async () => (await railLabels()).join("|") === "Intro|Alpha|Beta|Gamma|Part|Part, continued|End", "the rail to show the generated slides");
  assert.deepEqual(
    await rail.$$eval(".frameseq-thumbnail", (items) => items.map((item) => item.classList.contains("is-grouped"))),
    [false, true, true, true, true, true, false],
    "slides made by one statement must be grouped in the rail",
  );
  await waitFor(
    async () => (await page.$$eval(".cm-slide-marker", (items) => items.map((item) => item.textContent))).join() === "1,2–4,5–6,7",
    "the gutter to number the statements with the slides they make",
  );

  // A thumbnail made in a loop leads to the slide() call inside the loop.
  await showSlide(2);
  assert.equal(await page.$eval("[data-slot='status-cursor']", (element) => element.textContent), "Ln 8, Col 3");
  // The cursor on a helper call shows the first slide that call made.
  await placeCursor('section("Part");', 3);
  await waitFor(async () => (await activeSlide()) === 4, "the cursor on the helper call to show its slide");

  // Moving the last slide up lands it before the helper call's two slides, and the helper's
  // declaration stays where it was.
  await openSlideMenu(6);
  let items = await page.$$eval(".studio-menu-item", (rows) => rows.map((row) => row.textContent));
  await (await page.$$(".studio-menu-item"))[items.findIndex((label) => label.startsWith("Move up"))].click();
  await waitFor(async () => (await slideOrder()).join() === "Intro,loop,End,Part", "End to move before the helper call");
  assert.ok((await read()).indexOf("function section") < (await read()).indexOf('slide("End")'), "the helper declaration must stay put");
  await waitFor(async () => (await railLabels()).join("|") === "Intro|Alpha|Beta|Gamma|End|Part|Part, continued", "the rail to follow the move");
  await undoInEditor();
  await waitFor(async () => (await read()) === generated, "undo to restore the generated deck");

  // The menu of a slide made in a loop says the whole loop is affected, and duplicating it
  // repeats the loop.
  await waitFor(async () => (await railLabels()).length === 7, "the rail to settle");
  await openSlideMenu(2);
  await page.waitForSelector(".studio-menu-note");
  assert.match(await page.$eval(".studio-menu-note", (note) => note.textContent), /Made by line 7 with 2 other slides/);
  items = await page.$$eval(".studio-menu-item", (rows) => rows.map((row) => row.textContent));
  await (await page.$$(".studio-menu-item"))[items.findIndex((label) => label.startsWith("Duplicate"))].click();
  await waitFor(async () => ((await read()).match(/^for \(/gm) ?? []).length === 2, "the loop to be duplicated");
  await waitFor(async () => (await railLabels()).length === 10, "the rail to show the repeated loop");
  await undoInEditor();
  await waitFor(async () => (await read()) === generated, "undo to remove the repeated loop");

  // Dragging a slide made by the helper call moves both of its slides, before the loop.
  await waitFor(async () => (await railLabels()).length === 7, "the rail to settle again");
  await settle(rail);
  const helperSlide = await (await rail.$$(".frameseq-thumbnail"))[5].boundingBox();
  const loopSlide = await (await rail.$$(".frameseq-thumbnail"))[1].boundingBox();
  await page.mouse.move(helperSlide.x + helperSlide.width / 2, helperSlide.y + helperSlide.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(
      helperSlide.x + helperSlide.width / 2,
      helperSlide.y + helperSlide.height / 2 - ((helperSlide.y + helperSlide.height / 2 - loopSlide.y + 4) * step) / 12,
    );
  }
  await page.mouse.up();
  await waitFor(async () => (await slideOrder()).join() === "Intro,Part,loop,End", "the helper call to move before the loop");
  await waitFor(async () => (await railLabels()).join("|") === "Intro|Part|Part, continued|Alpha|Beta|Gamma|End", "the rail to follow the drag");
  await undoInEditor();
  await waitFor(async () => (await read()) === generated, "undo to restore the order");

  // Deleting a slide made by the helper call removes the call, and says how many slides went.
  await waitFor(async () => (await railLabels()).length === 7, "the rail to settle once more");
  await openSlideMenu(4);
  items = await page.$$eval(".studio-menu-item", (rows) => rows.map((row) => row.textContent));
  await (await page.$$(".studio-menu-item"))[items.findIndex((label) => label.startsWith("Delete"))].click();
  await waitFor(async () => !(await read()).includes('section("Part");'), "the helper call to be deleted");
  assert.ok((await read()).includes("function section"), "deleting the call must keep the helper");
  assert.ok(
    (await page.$$eval(".studio-toast-text", (toasts) => toasts.map((toast) => toast.textContent))).some((text) => text.includes("the 2 slides made by line 18")),
    "the Studio must say both slides were deleted",
  );
  await undoInEditor();
  await waitFor(async () => (await read()) === generated, "undo to restore the helper call");

  // A deck that throws before the preview has started is reported with its reason, and the
  // frames start again once the document is fixed, without reloading the Studio.
  const healthy = await read();
  // The rail is still redrawing after the last undo; count its slides once it shows the deck.
  const healthyLabels = "Intro|Alpha|Beta|Gamma|Part|Part, continued|End";
  await waitFor(async () => (await railLabels()).join("|") === healthyLabels, "the rail to show the restored deck");
  const healthySlides = healthyLabels.split("|").length;
  await writeFile(deck, healthy.replace('slide("Intro");', '(undefined as any).early();\r\nslide("Intro");'), "utf8");
  await delay(500);
  await page.reload({ waitUntil: "networkidle2" });
  await waitFor(async () => (await problems()).some((row) => row.includes("early")), "the startup error to be reported");
  await writeFile(deck, healthy, "utf8");
  await waitFor(async () => (await problems()).length === 0, "the preview to restart after the fix", 30_000);
  const railFrame = () => page.frames().find((frame) => frame.url().includes("thumbnails=1"));
  try {
    await waitFor(
      async () => (await railFrame()?.$$eval(".frameseq-thumbnail", (items) => items.length).catch(() => 0)) === healthySlides,
      "the rail to restart after the fix",
      40_000,
    );
  } catch (error) {
    const frames = await Promise.all(page.frames().map((frame) => frame.evaluate(() => ({
      url: location.href,
      ready: document.readyState,
      deck: document.documentElement.dataset.ready ?? "",
      error: window.__frameseqError ?? "",
      thumbnails: document.querySelectorAll(".frameseq-thumbnail").length,
    })).catch((reason) => ({ url: frame.url(), unreachable: String(reason) }))));
    throw new Error(`${error.message}\n${JSON.stringify(frames, null, 2)}`);
  }
} catch (error) {
  console.error(`Studio server output:\n${server.log()}`);
  const notices = await page?.$$eval(".studio-toast-text", (items) => items.map((item) => item.textContent)).catch(() => []);
  console.error(`Studio notices: ${JSON.stringify(notices)}`);
  throw error;
} finally {
  await browser?.close();
  server.child.kill();
}

// The Studio's API exists only when `frameseq studio` started the server.
const plain = startServer("dev", "talk.slides.ts");
try {
  const address = await plain.address;
  const response = await fetch(new URL("__frameseq/studio/session", address));
  assert.equal(response.status, 404, "frameseq dev must not serve the Studio's API");
} finally {
  plain.child.kill();
}

console.log("Studio test passed: CRLF-safe auto-save, syntax gating, TypeScript diagnostics and completions, rail navigation, preview drags, region binding, and undo, external reloads, conflicts, live layout checks, slide duplication and reordering, slides made by loops and helpers, runtime and startup errors, exports, and API isolation.");
