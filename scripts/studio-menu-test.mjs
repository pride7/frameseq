#!/usr/bin/env node

// Right-click menus in FrameSeq Studio: on an object in the preview, which selects it and offers
// the clipboard, duplicating, deleting, stacking, aligning, and its settings and code; on the
// slide itself; on an object listed in Current slide; and in the code.

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
const workspace = resolve(packageRoot, "tmp", "studio-menu-test");
const deck = resolve(workspace, "talk.slides.ts");
const screenshots = process.env.FRAMESEQ_TEST_SCREENSHOTS;

const source = [
  'presentation({ title: "Menu test" });',
  "",
  'slide("Intro");',
  'text("Hello");',
  'text("World");',
  "",
  'slide("Canvas").canvas();',
  "// The box",
  'rect("Box").position({ x: 700, y: 300 }).width(200).height(100).as("box");',
  'circle("Dot").position({ x: 200, y: 200 }).width(80).height(80).as("dot");',
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
  await browser.defaultBrowserContext().overridePermissions(new URL(studioUrl).origin, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
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

  const showSlide = async (index, anchor) => {
    await waitFor(async () => {
      if (await preview.evaluate((wanted) => document.querySelector("#app .frameseq-slide-frame.is-active")?.dataset.index === String(wanted), index).catch(() => false)) return true;
      await page.evaluate((text) => {
        const { view } = window.frameseqStudio;
        view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf(text) } });
        view.focus();
      }, anchor);
      await delay(400);
      return false;
    }, `the preview to show slide ${index + 1}`);
  };
  /**
   * A point on an object on the slide in the preview, on the Studio's page: by default its
   * middle, or a fraction of the way across and down, clear of the copies that overlap it.
   */
  const pointOn = (selector, across = 0.5, down = 0.5) => waitFor(() => preview.evaluate((wanted, fx, fy) => {
    const element = document.querySelector(`#app .frameseq-slide-frame.is-active ${wanted}`);
    if (!element) return undefined;
    const box = element.getBoundingClientRect();
    return { x: box.x + box.width * fx, y: box.y + box.height * fy };
  }, selector, across, down).catch(() => undefined), `${selector} to be on the slide`).then((point) => ({ x: frameBox.x + point.x, y: frameBox.y + point.y }));
  const centreOf = (selector) => pointOn(selector);
  const commands = () => page.$eval(".studio-context-menu", (menu) => [...menu.querySelectorAll(":scope > .studio-menu-item")].map((item) => ({
    command: item.dataset.command,
    disabled: item.disabled,
  })));
  /** The items of the open menu that have no picture before their label. */
  const withoutPictures = () => page.$eval(".studio-context-menu", (menu) => [...menu.querySelectorAll(":scope > .studio-menu-item")]
    .filter((item) => !item.querySelector(":scope > .studio-menu-icon svg"))
    .map((item) => item.dataset.command));
  const menuOpen = () => page.waitForSelector(".studio-context-menu", { timeout: 10_000 });
  const menuClosed = () => page.waitForFunction(() => !document.querySelector(".studio-context-menu"));
  const choose = async (...path) => {
    for (const command of path) {
      await page.waitForSelector(`.studio-context-menu [data-command='${command}']:not(:disabled)`);
      await page.click(`.studio-context-menu [data-command='${command}']`);
    }
    await menuClosed();
  };
  const rightClick = async (point) => {
    await page.mouse.click(point.x, point.y, { button: "right" });
    await menuOpen();
  };
  const press = async (key, modifier) => {
    if (modifier) await page.keyboard.down(modifier);
    await page.keyboard.press(key);
    if (modifier) await page.keyboard.up(modifier);
  };
  /**
   * Wait for the file to hold what an action wrote, and for the preview to have swapped in the
   * redrawn slide, where `selector` finds an object, or `gone` no longer does.
   */
  const settled = async (check, message, { selector, gone } = {}) => {
    const text = await waitFor(async () => {
      const current = await read();
      return check(current) && current;
    }, message).catch(async (error) => {
      throw new Error(`${error.message}\n${await read()}`);
    });
    if (selector || gone) {
      await waitFor(() => preview.evaluate((present, absent) => {
        const scope = document.querySelector("#app .frameseq-slide-frame.is-active");
        return Boolean(scope)
          && (!present || Boolean(scope.querySelector(present)))
          && (!absent || !scope.querySelector(absent));
      }, selector, gone).catch(() => false), `the preview to show ${message}`);
    }
    await waitFor(() => page.evaluate(() => document.querySelector("[data-slot='check-state']")?.textContent?.includes("Layout checked")), "the layout check to catch up");
    return text;
  };

  // ── An object on a canvas ────────────────────────────────────────────────────────────────
  await showSlide(1, 'rect("Box")');
  await rightClick(await centreOf("[data-frameseq-name='dot']"));
  assert.ok(await preview.evaluate(() => (
    document.documentElement.classList.contains("frameseq-edit-mode")
    && Boolean(document.querySelector(".is-frameseq-selected[data-frameseq-name='dot']"))
  )), "a right-click selects the object, alone, in layout editing");
  const objectMenu = await commands();
  assert.deepEqual(
    objectMenu.map((item) => item.command),
    ["cut", "copy", "paste", "duplicate", "delete", "order", "edit-text", "format", "go-to-code"],
    "the object's menu offers the clipboard, duplicating, deleting, stacking, and its settings and code",
  );
  assert.ok(objectMenu.find((item) => item.command === "paste").disabled, "nothing has been copied to paste");
  assert.deepEqual(await withoutPictures(), [], "every command in the object's menu has a picture");
  if (screenshots) await page.screenshot({ path: resolve(screenshots, "menu-object.png") });

  // Escape closes the menu; the arrow keys reach its items.
  await page.keyboard.press("Escape");
  await menuClosed();
  await rightClick(await centreOf("[data-frameseq-name='dot']"));
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.command), "cut", "ArrowDown reaches the first item");
  await page.keyboard.press("Escape");
  await menuClosed();

  // Order › Send to back moves the dot's line before the box's, and its comment.
  await rightClick(await centreOf("[data-frameseq-name='dot']"));
  await page.click(".studio-context-menu [data-command='order']");
  await page.waitForSelector(".studio-context-menu [data-command='send-to-back']");
  if (screenshots) await page.screenshot({ path: resolve(screenshots, "menu-order.png") });
  assert.equal(
    await page.$eval(".studio-context-menu [data-command='bring-to-front']", (item) => item.disabled),
    true,
    "the dot is already at the front",
  );
  await choose("send-to-back");
  await settled(
    (text) => text.includes('slide("Canvas").canvas();\ncircle("Dot").position({ x: 200, y: 200 }).width(80).height(80).as("dot");\n// The box\nrect("Box")'),
    "the dot to be sent to the back",
    { selector: "[data-frameseq-name='dot'] + [data-frameseq-name='box'], [data-frameseq-name='dot'] ~ [data-frameseq-name='box']" },
  );

  // Duplicate writes a copy after the box, with its comment, a new name, and moved over.
  await rightClick(await centreOf("[data-frameseq-name='box']"));
  await choose("duplicate");
  await settled(
    (text) => text.includes('.as("box");\n// The box\nrect("Box").position({ x: 724, y: 324 }).width(200).height(100).as("box2");\n'),
    "the box to be duplicated",
    { selector: "[data-frameseq-name='box2']" },
  );

  // Copy, then paste onto the same slide: the copies step over, with names of their own.
  await rightClick(await centreOf("[data-frameseq-name='dot']"));
  await choose("copy");
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    'circle("Dot").position({ x: 200, y: 200 }).width(80).height(80).as("dot");',
    "the object's code goes to the clipboard too",
  );
  await rightClick(await centreOf("[data-frameseq-name='dot']"));
  await choose("paste");
  await settled((text) => text.includes('circle("Dot").position({ x: 224, y: 224 }).width(80).height(80).as("dot2");'), "the dot to be pasted", { selector: "[data-frameseq-name='dot2']" });
  await rightClick(await centreOf("[data-frameseq-name='dot']"));
  await choose("paste");
  await settled((text) => text.includes('circle("Dot").position({ x: 248, y: 248 }).width(80).height(80).as("dot3");'), "the dot to be pasted again", { selector: "[data-frameseq-name='dot3']" });

  // Several objects: align them, from the menu of one of them.
  const box = await pointOn("[data-frameseq-name='box']", 0.06, 0.15);
  await page.mouse.click(box.x, box.y);
  await page.keyboard.down("Control");
  const dot = await pointOn("[data-frameseq-name='dot']", 0.3, 0.3);
  await page.mouse.click(dot.x, dot.y);
  await page.keyboard.up("Control");
  await preview.waitForFunction(() => document.querySelectorAll(".is-frameseq-selected").length === 2);
  await rightClick(dot);
  assert.equal(await preview.evaluate(() => document.querySelectorAll(".is-frameseq-selected").length), 2, "a right-click on a selected object keeps the selection");
  assert.deepEqual(
    (await commands()).map((item) => item.command),
    ["cut", "copy", "paste", "duplicate", "delete", "align", "bind-region", "go-to-code"],
    "several objects can be aligned or bound into a region",
  );
  await page.click(".studio-context-menu [data-command='align']");
  await choose("align-top");
  await settled((text) => /rect\("Box"\)\.position\(\{ x: 700, y: 200 \}\)[^\n]*\.as\("box"\);/.test(text), "the box to be aligned with the dot's top");
  await preview.waitForFunction(() => {
    const box = document.querySelector("#app .frameseq-slide-frame.is-active [data-frameseq-name='box']");
    const dot = document.querySelector("#app .frameseq-slide-frame.is-active [data-frameseq-name='dot']");
    return box && dot && Math.abs(box.getBoundingClientRect().top - dot.getBoundingClientRect().top) < 1;
  });

  // Keys: Ctrl+C and Ctrl+V on the preview's selection, and Ctrl+D.
  const box2 = await centreOf("[data-frameseq-name='box2']");
  await page.mouse.click(box2.x, box2.y);
  await preview.waitForFunction(() => document.querySelectorAll(".is-frameseq-selected").length === 1);
  await press("KeyD", "Control");
  await settled((text) => text.includes('rect("Box").position({ x: 748, y: 348 }).width(200).height(100).as("box3");'), "Ctrl+D to duplicate the box", { selector: "[data-frameseq-name='box3']" });
  // Delete from the menu, which goes through the preview as the Delete key does.
  await rightClick(await centreOf("[data-frameseq-name='box3']"));
  await choose("delete");
  await settled((text) => !text.includes('as("box3")'), "the copy to be deleted", { gone: "[data-frameseq-name='box3']" });
  // Ctrl+C in the preview puts the code on the clipboard, and Ctrl+V pastes the object.
  const copy = await centreOf("[data-frameseq-name='box2']");
  await page.mouse.click(copy.x, copy.y);
  await preview.waitForFunction(() => Boolean(document.querySelector(".is-frameseq-selected[data-frameseq-name='box2']")));
  await press("KeyC", "Control");
  await waitFor(async () => (await page.evaluate(() => navigator.clipboard.readText())) === '// The box\nrect("Box").position({ x: 724, y: 324 }).width(200).height(100).as("box2");',
    "Ctrl+C to put the box's code on the clipboard");
  await press("KeyV", "Control");
  await settled((text) => text.includes('.as("box2");\n// The box\nrect("Box").position({ x: 748, y: 348 }).width(200).height(100).as("box3");'), "Ctrl+V to paste the box", { selector: "[data-frameseq-name='box3']" });

  // ── The slide itself ──────────────────────────────────────────────────────────────────────
  const slideBox = await preview.evaluate(() => {
    const box = document.querySelector("#app .frameseq-slide-frame.is-active .frameseq-slide").getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  const blank = { x: frameBox.x + slideBox.x + slideBox.width * 0.9, y: frameBox.y + slideBox.y + slideBox.height * 0.9 };
  await rightClick(blank);
  assert.equal(await preview.evaluate(() => document.querySelectorAll(".is-frameseq-selected").length), 0, "a right-click on the slide clears the selection");
  assert.deepEqual(
    (await commands()).map((item) => item.command),
    ["paste", "insert", "new-slide", "lock-layout", "go-to-source", "present-here"],
    "the slide's menu pastes, inserts, adds a slide, and locks the layout",
  );
  await page.click(".studio-context-menu [data-command='insert']");
  await page.waitForSelector(".studio-context-menu [data-command='insert-formulas']");
  assert.deepEqual(
    await page.$eval(".studio-context-menu:has([data-command='insert-formulas'])", (menu) => [...menu.querySelectorAll(":scope > .studio-menu-item")]
      .filter((item) => !item.querySelector(":scope > .studio-menu-icon svg"))
      .map((item) => item.dataset.command)),
    [],
    "every command in Insert has a picture, the drawing tools included",
  );
  // The kinds inside Insert's groups are drawn as the gallery draws them, shapes by their outline.
  await page.click(".studio-context-menu [data-command='insert-formulas']");
  await page.waitForSelector(".studio-context-menu [data-command='insert-math'] .studio-menu-icon.is-drawing .studio-insert-picture");
  if (screenshots) await page.screenshot({ path: resolve(screenshots, "menu-slide.png") });
  await page.keyboard.press("Escape");
  await page.click(".studio-context-menu [data-command='insert-basic']");
  await page.waitForSelector(".studio-context-menu [data-command='insert-diamond'] .studio-menu-icon.is-drawing .studio-insert-picture path");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  // A new slide's layouts are drawn as small slides, as the layout picker shows them.
  await page.click(".studio-context-menu [data-command='new-slide']");
  await page.waitForSelector(".studio-context-menu [data-command^='new-slide-'] .studio-menu-icon.is-drawing .studio-layout-sketch");
  if (screenshots) await page.screenshot({ path: resolve(screenshots, "menu-layouts.png") });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await menuClosed();
  await rightClick(blank);
  await choose("lock-layout");
  await preview.waitForFunction(() => document.documentElement.classList.contains("frameseq-layout-locked")
    && document.querySelector("[data-action='layout-lock']")?.getAttribute("aria-pressed") === "true");
  // Locking keeps the preview editing: objects are still selected, and typed into.
  assert.ok(await preview.evaluate(() => document.documentElement.classList.contains("frameseq-edit-mode")));
  await rightClick(blank);
  assert.equal(
    await page.$eval(".studio-context-menu [data-command='lock-layout']", (item) => item.getAttribute("aria-checked")),
    "true",
    "the slide's menu shows the layout as locked",
  );
  await choose("lock-layout");
  await preview.waitForFunction(() => !document.documentElement.classList.contains("frameseq-layout-locked"));

  // Cut on one slide, paste after an object on another, where the name is free.
  await rightClick(await pointOn("[data-frameseq-name='dot2']", 0.2, 0.32));
  assert.ok(await preview.evaluate(() => Boolean(document.querySelector(".is-frameseq-selected[data-frameseq-name='dot2']"))));
  await choose("cut");
  await settled((text) => !text.includes('as("dot2")'), "the copy of the dot to be cut", { gone: "[data-frameseq-name='dot2']" });
  await showSlide(0, 'text("Hello")');
  const hello = await waitFor(() => preview.evaluate(() => {
    const text = [...document.querySelectorAll("#app .frameseq-slide-frame.is-active [data-frameseq-node='text']")]
      .find((element) => element.textContent.trim() === "Hello");
    const box = text?.getBoundingClientRect();
    return box && { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }).catch(() => undefined), "the text to be on the first slide");
  await rightClick({ x: frameBox.x + hello.x, y: frameBox.y + hello.y });
  await choose("paste");
  await settled(
    (text) => text.includes('text("Hello");\ncircle("Dot").position({ x: 224, y: 224 }).width(80).height(80).as("dot2");\ntext("World");'),
    "the dot to be pasted after the text on the first slide",
    { selector: "[data-frameseq-name='dot2']" },
  );

  // ── Current slide ────────────────────────────────────────────────────────────────────────
  await page.waitForFunction(() => [...document.querySelectorAll(".studio-tree-row[role='treeitem']")].some((item) => item.textContent.includes("#dot2")));
  const row = await page.waitForFunction(() => [...document.querySelectorAll(".studio-tree-row[role='treeitem']")].find((item) => item.textContent.includes("World")));
  await row.evaluate((item) => item.scrollIntoView({ block: "center" }));
  const rowBox = await row.boundingBox();
  await rightClick({ x: rowBox.x + rowBox.width / 2, y: rowBox.y + rowBox.height / 2 });
  assert.deepEqual(
    (await commands()).map((item) => item.command),
    ["cut", "copy", "paste", "duplicate", "delete", "edit-text", "format", "go-to-code"],
    "an object listed in Current slide has the same menu, without what only the preview can do",
  );
  await choose("edit-text");
  await waitFor(() => page.evaluate(() => (
    Boolean(document.activeElement?.closest(".studio-object-card")) && document.activeElement.value === "World"
  )), "Edit text to put the focus in the object's words");

  // ── The code ─────────────────────────────────────────────────────────────────────────────
  const nameAt = await page.evaluate(() => {
    const { view } = window.frameseqStudio;
    const at = view.state.doc.toString().indexOf('"box"') + 2;
    view.dispatch({ selection: { anchor: 0 } });
    const coords = view.coordsAtPos(at);
    return { x: coords.left + 1, y: (coords.top + coords.bottom) / 2, at };
  });
  await rightClick(nameAt);
  const codeMenu = await commands();
  assert.deepEqual(
    codeMenu.map((item) => item.command),
    ["go-to-definition", "rename-name", "cut", "copy", "paste", "toggle-comment", "select-all", "find"],
    "the code's menu offers names, the clipboard, and the text",
  );
  assert.ok(!codeMenu.find((item) => item.command === "rename-name").disabled, "a name under the pointer can be renamed");
  const head = await page.evaluate(() => window.frameseqStudio.view.state.selection.main.head);
  assert.ok(Math.abs(head - nameAt.at) <= 1, `a right-click moves the cursor to where it landed, not to ${head}`);
  assert.deepEqual(await withoutPictures(), [], "every command in the code's menu has a picture");
  if (screenshots) await page.screenshot({ path: resolve(screenshots, "menu-code.png") });
  await choose("toggle-comment");
  await waitFor(() => page.evaluate(() => window.frameseqStudio.view.state.doc.toString().includes('// rect("Box")')), "the line to be commented out");
  await press("KeyZ", "Control");
  // Shift+F10 opens the menu at the cursor, with its first item that can be used focused.
  await page.mouse.move(4, 996);
  await press("F10", "Shift");
  await menuOpen();
  const first = (await commands()).find((item) => !item.disabled).command;
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.command), first, "the keyboard's menu focuses its first item");
  await page.keyboard.press("Escape");
  await menuClosed();
  assert.ok(await page.evaluate(() => document.activeElement?.closest(".cm-editor") !== null), "closing the menu gives the code back the focus");

  // Elsewhere, the browser's own menu does not open.
  const prevented = await page.evaluate(() => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
    document.querySelector(".studio-topbar").dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(prevented, true, "a right-click on the Studio's chrome opens no browser menu");

  assert.deepEqual(errors, [], "the Studio must not throw");
  console.log("Studio menu test passed.");
} finally {
  await browser?.close();
  child.kill();
}
