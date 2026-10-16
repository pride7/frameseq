#!/usr/bin/env node

// The Studio in the FrameSeq app's own window, with that window stood in for by a fake
// `window.frameseqShell`: the top bar as title bar, the window's buttons, moving the window,
// links for the default browser, the window's own full screen for a slide show, asking before
// closing, and `frameseq studio --desktop`.

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
const workspace = resolve(packageRoot, "tmp", "studio-desktop-test");
const config = resolve(workspace, "config");
const deck = resolve(workspace, "talk.slides.ts");

async function waitFor(check, message, timeout = 30_000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`Timed out: ${message}`);
    await delay(100);
  }
}

/** The app's screens, as Windows names them: the main one, with the window, and one to its right. */
const appScreens = [
  { name: "\\\\.\\DISPLAY1", x: 0, y: 0, width: 1920, height: 1080, primary: true, current: true },
  { name: "\\\\.\\DISPLAY2", x: 1920, y: 0, width: 2560, height: 1440, primary: false, current: false },
];

/** A stand-in for the app's window, which records what the page asks of it. */
function fakeShell(chrome) {
  return `(() => {
    localStorage.setItem("frameseq-studio-language", "en");
    const calls = (window.__shellCalls = []);
    let maximized = false;
    let resized = () => {};
    window.__closed = [];
    window.frameseqShell = {
      chrome: ${JSON.stringify(chrome)},
      platform: ${JSON.stringify(chrome === "overlay" ? "macos" : "windows")},
      minimize: async () => { calls.push("minimize"); },
      toggleMaximize: async () => { calls.push("toggleMaximize"); maximized = !maximized; resized(); },
      isMaximized: async () => maximized,
      startDragging: async () => { calls.push("startDragging"); },
      // As the window does: the page's guard decides, and the window closes only on its yes.
      close: async () => { calls.push("close"); window.__closed.push(window.__guard ? await window.__guard() : true); },
      onResized: async (callback) => { resized = callback; },
      onCloseRequested: async (decide) => { window.__guard = decide; },
      openExternal: async (url) => { calls.push("open " + url); },
      screens: async () => ${JSON.stringify(appScreens)},
      startShow: async (show) => { calls.push("startShow " + JSON.stringify(show)); },
      endShow: async () => { calls.push("endShow"); },
      focus: async () => { calls.push("focus"); },
    };
    // The window goes full screen for a show, so the page never asks for it.
    Element.prototype.requestFullscreen = async function () { calls.push("requestFullscreen"); };
  })();`;
}

await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
await mkdir(workspace, { recursive: true });
await writeFile(deck, 'presentation("Desktop");\n\nslide("One");\ntext("Hello");\n', "utf8");

// `studio --desktop` is how the app's window starts the server: no window of its own, the
// presentation remembered, and a stop when its input closes.
const child = spawn(process.execPath, [cli, "studio", deck, "--desktop"], {
  cwd: workspace,
  env: { ...process.env, FRAMESEQ_CONFIG_DIR: config, FRAMESEQ_NO_DIALOGS: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
let output = "";
const exited = new Promise((resolveExit) => child.on("close", resolveExit));
const address = await new Promise((resolveAddress, rejectAddress) => {
  const timer = setTimeout(() => rejectAddress(new Error(`The Studio did not start.\n${output}`)), 60_000);
  const read = (chunk) => {
    output += chunk.toString();
    const match = output.match(/Studio:\s+(https?:\/\/\S+studio\.html)/);
    if (match) {
      clearTimeout(timer);
      resolveAddress(match[1]);
    }
  };
  child.stdout.on("data", read);
  child.stderr.on("data", read);
});

let browser;
try {
  browser = await puppeteer.launch(puppeteerLaunchOptions());
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.evaluateOnNewDocument(fakeShell("custom"));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(address, { waitUntil: "networkidle2" });
  await page.waitForSelector(".studio-topbar");
  const calls = () => page.evaluate(() => window.__shellCalls.slice());

  const session = await page.evaluate(() => fetch("/__frameseq/studio/session").then((response) => response.json()));
  assert.equal(session.quitOnClose, true, "the server stops with the app's window");

  // Its presentation opened again from outside brings the window to the front.
  const show = (path) => page.evaluate((token, file) => fetch("/__frameseq/studio/files/show", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-FrameSeq-Studio": token },
    body: JSON.stringify({ path: file }),
  }).then((response) => response.status), session.token, path);
  assert.equal(await show(session.entry), 200);
  await waitFor(async () => (await calls()).includes("focus"), "the window to be brought to the front");
  assert.equal(await show(resolve(dirname(session.entry), "else.fsq")), 409, "another presentation is not opened over this one");
  await page.evaluate(() => { window.__shellCalls.length = 0; });
  await waitFor(async () => {
    const settings = JSON.parse(await readFile(resolve(config, "studio.json"), "utf8").catch(() => "{}"));
    return settings.recent?.some((item) => item.path === deck);
  }, "the presentation to join the recent list");

  // The window's buttons sit at the top bar's right end, beside Present and clear of it.
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains("is-desktop-custom")));
  assert.deepEqual(await page.$$eval(".studio-window-control", (items) => items.map((item) => item.getAttribute("aria-label"))), ["Minimize", "Maximize", "Close"]);
  const [presentRight, controlsLeft, barHeight, controlsHeight] = await page.evaluate(() => [
    document.querySelector("[data-action='present']").getBoundingClientRect().right,
    document.querySelector(".studio-window-controls").getBoundingClientRect().left,
    document.querySelector(".studio-topbar").getBoundingClientRect().height,
    document.querySelector(".studio-window-controls").getBoundingClientRect().height,
  ]);
  assert.ok(presentRight <= controlsLeft, "Present must not sit under the window's buttons");
  assert.equal(controlsHeight, barHeight, "the buttons fill the top bar's height");
  assert.equal(await page.$eval(".studio-window-drag", (strip) => getComputedStyle(strip).display), "none", "the top bar moves the window itself");

  await page.click("[data-window='minimize']");
  await page.click("[data-window='maximize']");
  await waitFor(async () => (await page.$eval("[data-window='maximize']", (button) => button.title)) === "Restore", "the button to offer Restore");
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains("is-window-maximized")));
  await page.click("[data-window='maximize']");
  await waitFor(async () => (await page.$eval("[data-window='maximize']", (button) => button.title)) === "Maximize", "the button to offer Maximize");
  assert.deepEqual(await calls(), ["minimize", "toggleMaximize", "toggleMaximize"]);

  // Pressing on the top bar's empty part moves the window; pressing twice maximises it; the
  // menus and buttons on it stay what they are.
  const [x, y] = await page.evaluate(() => {
    const menus = document.querySelector(".studio-menubar").getBoundingClientRect();
    const file = document.querySelector("[data-action='file-menu']").getBoundingClientRect();
    return [(menus.right + file.left) / 2, menus.top + menus.height / 2];
  });
  await page.mouse.click(x, y);
  await page.mouse.click(x, y, { clickCount: 2 });
  await page.click("[data-menu='file']");
  await page.waitForSelector(".studio-menubar-menu");
  await page.keyboard.press("Escape");
  // Puppeteer's double click is one press counted twice: the second press of a real one.
  assert.deepEqual((await calls()).slice(3), ["startDragging", "toggleMaximize"]);

  // Links go to the default browser, as absolute addresses; the window keeps the Studio.
  await page.click("[data-menu='help']");
  await page.waitForSelector("[data-command='documentation']");
  await page.click("[data-command='documentation']");
  await page.click("[data-action='open-browser']");
  const opened = (await calls()).filter((call) => call.startsWith("open "));
  assert.equal(opened[0], "open https://pride7.github.io/frameseq/docs/");
  assert.match(opened[1], /^open http:\/\/localhost:\d+\/#1$/);

  // A slide show takes the window full screen, onto a second screen with presenter view on this
  // one when there is one; ending it brings the window back. Without presenter view the window
  // stays on its screen, unless Present › Show screen names another.
  const onScreens = 'startShow {"slides":{"x":1920,"y":0},"presenter":{"address":"/?presenter=1&show=1&lang=en#1","x":0,"y":0}}';
  const showScreens = async () => {
    await page.click("[data-menu='present']");
    await page.click("[data-command='show-screen']");
    await page.waitForSelector("[data-command='show-screen-auto']");
    return page.$$eval("[data-command^='show-screen-']", (items) => items.map((item) => (
      `${item.getAttribute("aria-checked") === "true" ? "✓ " : ""}${item.querySelector(".studio-menu-label").textContent}`
    )));
  };
  const showCalls = async () => (await calls()).filter((call) => /^(startShow|endShow|requestFullscreen)/.test(call));
  const showing = () => page.evaluate(() => Boolean(document.querySelector(".studio-show")));
  const shown = () => page.frames().find((frame) => /[?&]show=1/.test(frame.url()))
    ?.evaluate(() => document.documentElement.dataset.ready === "true").catch(() => false);
  await page.focus(".cm-content");
  await page.keyboard.press("F5");
  await waitFor(() => shown(), "F5 to start the show");
  await waitFor(async () => (await showCalls()).length === 1, "the show to ask the window for full screen");
  assert.deepEqual(await showCalls(), [onScreens]);
  await page.keyboard.press("Escape");
  await waitFor(async () => !(await showing()), "Escape to end the show");
  await waitFor(async () => (await showCalls()).length === 2, "the show to give the window back");
  await page.click("[data-menu='present']");
  await page.click("[data-command='use-presenter-view']");
  await page.focus(".cm-content");
  await page.keyboard.press("F5");
  await waitFor(async () => (await showCalls()).length === 3 && (await shown()), "F5 to start a show without presenter view");
  await page.keyboard.press("Escape");
  await waitFor(async () => (await showCalls()).length === 4, "Escape to end it");
  assert.deepEqual(await showCalls(), [onScreens, "endShow", 'startShow {"slides":null,"presenter":null}', "endShow"]);
  // The screens go by where they are, since Windows names them by device alone.
  assert.deepEqual(await showScreens(), [
    "✓ Automatic",
    "the Studio's screen · 1920 × 1080 · main display",
    "on the right · 2560 × 1440",
  ]);
  await page.click("[data-command='show-screen-2']");
  await page.focus(".cm-content");
  await page.keyboard.press("F5");
  await waitFor(async () => (await showCalls()).length === 5 && (await shown()), "F5 to start a show on the chosen screen");
  await page.keyboard.press("Escape");
  await waitFor(async () => (await showCalls()).length === 6, "Escape to end it");
  assert.deepEqual((await showCalls()).slice(4), ['startShow {"slides":{"x":1920,"y":0},"presenter":null}', "endShow"]);
  await showScreens();
  await page.click("[data-command='show-screen-auto']");
  await page.click("[data-menu='present']");
  await page.click("[data-command='use-presenter-view']");

  // Closing settles unsaved edits first: Cancel keeps the window, Don't save lets it close.
  await page.click("[data-menu='file']");
  await page.waitForSelector("[data-command='autosave'][aria-checked='true']");
  await page.click("[data-command='autosave']");
  await page.focus(".cm-content");
  await page.keyboard.press("End");
  await page.keyboard.type(" ", { delay: 10 });
  await page.click("[data-window='close']");
  await page.waitForSelector("dialog[open]");
  const dialogButtons = await page.$$eval("dialog[open] button", (items) => items.map((item) => item.textContent));
  assert.deepEqual(dialogButtons, ["Cancel", "Don't save", "Save"]);
  await (await page.$$("dialog[open] button"))[0].click();
  await waitFor(() => page.evaluate(() => window.__closed.length === 1), "Cancel to answer");
  await page.click("[data-window='close']");
  await page.waitForSelector("dialog[open]");
  await (await page.$$("dialog[open] button"))[1].click();
  await waitFor(() => page.evaluate(() => window.__closed.length === 2), "Don't save to answer");
  assert.deepEqual(await page.evaluate(() => window.__closed), [false, true]);
  assert.equal((await readFile(deck, "utf8")).endsWith(" "), false, "Don't save leaves the file alone");

  // On macOS the traffic lights sit over the top bar's left end, and the system draws the buttons.
  const mac = await browser.newPage();
  await mac.setViewport({ width: 1400, height: 900 });
  await mac.evaluateOnNewDocument(fakeShell("overlay"));
  await mac.goto(address, { waitUntil: "networkidle2" });
  await mac.waitForSelector(".studio-topbar");
  assert.equal(await mac.$(".studio-window-controls"), null);
  assert.equal(await mac.$eval(".studio-topbar", (bar) => getComputedStyle(bar).paddingLeft), "84px");

  // In a browser, nothing of the kind.
  const plain = await browser.newPage();
  await plain.evaluateOnNewDocument(() => localStorage.setItem("frameseq-studio-language", "en"));
  await plain.goto(address, { waitUntil: "networkidle2" });
  await plain.waitForSelector(".studio-topbar");
  assert.equal(await plain.$(".studio-window-controls"), null);
  assert.equal(await plain.evaluate(() => document.documentElement.classList.contains("is-desktop")), false);
  // A first visit folds the problems panel; the problem counts in the status bar open it.
  const folded = () => plain.$eval("#studio", (studio) => studio.classList.contains("is-panel-collapsed"));
  assert.equal(await folded(), true, "the problems panel starts folded");
  await plain.click("[data-action='show-problems']");
  assert.equal(await folded(), false, "the problem counts open the panel");
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(output);
  throw error;
} finally {
  await browser?.close();
}

// Closing its input stops the server, as when the app's window closes.
child.stdin.end();
const code = await Promise.race([exited, delay(20_000).then(() => "still running")]);
assert.equal(code, 0, `the server must stop when its input closes:\n${output}`);

console.log("Studio desktop test passed: the top bar as title bar, the window's buttons, moving and maximising, links for the default browser, the window's own full screen for a show, asking before closing, the macOS traffic lights, and studio --desktop.");
