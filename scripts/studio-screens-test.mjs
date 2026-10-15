#!/usr/bin/env node

// FrameSeq Studio's slide show on a computer with more than one screen, as a headless Chrome
// stands one in for: the slides go full screen on another screen, or the one chosen in Present ›
// Show screen, and presenter view opens on the Studio's, once the browser may place windows
// there; Escape or End show in presenter view ends the show.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const workspace = await mkdtemp(join(tmpdir(), "frameseq-studio-screens-"));
await writeFile(resolve(workspace, "talk.slides.ts"), [
  'presentation({ title: "Screens test", theme: "midnight" });',
  'slide("One").notes("First notes"); text("First");',
  'slide("Two"); text("Second");',
  'slide("Three"); text("Third");',
  "",
].join("\n"));

async function waitFor(check, message, timeout = 20_000) {
  const started = Date.now();
  for (;;) {
    const value = await Promise.resolve().then(check).catch(() => undefined);
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`Timed out: ${message}`);
    await delay(100);
  }
}

const server = spawn(process.execPath, [cli, "studio", "talk.slides.ts", "--no-open"], {
  cwd: workspace,
  env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0", NO_COLOR: "1" },
  windowsHide: true,
});
let output = "";
const studioUrl = await new Promise((resolveAddress, rejectAddress) => {
  const timer = setTimeout(() => rejectAddress(new Error(`The Studio did not start.\n${output}`)), 60_000);
  const read = (chunk) => {
    output += chunk.toString();
    const match = output.match(/Studio:\s+(https?:\/\/\S+studio\.html)/);
    if (match) {
      clearTimeout(timer);
      resolveAddress(match[1]);
    }
  };
  server.stdout.on("data", read);
  server.stderr.on("data", read);
  server.on("close", (code) => rejectAddress(new Error(`The Studio exited with ${code}.\n${output}`)));
});

// A laptop's own screen, where the Studio is, a projector to its right, and a monitor to its left.
const browser = await puppeteer.launch(puppeteerLaunchOptions({
  defaultViewport: { width: 1400, height: 860 },
  args: ["--screen-info={0,0 1600x1000 label=Laptop isInternal=true}{1600,0 1920x1080 label=Projector}{-1280,0 1280x1024 label=Monitor}"],
}));
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(`Studio: ${error.message}`));
  // Which screen each request for full screen names. A headless window never moves to another
  // screen, so a window opened beside it would take it out of full screen, as on one screen; the
  // request is granted without the window going there.
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("frameseq-studio-language", "en");
    window.__fullScreens = [];
    Element.prototype.requestFullscreen = function (options) {
      window.__fullScreens.push(options?.screen?.label ?? "this screen");
      return Promise.resolve();
    };
  });
  await page.goto(studioUrl, { waitUntil: "load" });
  const origin = new URL(studioUrl).origin;
  const previewFrame = () => page.frames().find((frame) => /frameseq-preview=studio(#|$)/.test(frame.url()));
  await waitFor(
    () => previewFrame()?.evaluate(() => document.documentElement.dataset.ready === "true"),
    "the preview to render",
    120_000,
  );
  assert.equal(await page.evaluate(() => screen.isExtended), true, "the browser stands in two screens");

  const showFrame = () => page.frames().find((frame) => /[?&]show=1/.test(frame.url()) && !/presenter=1/.test(frame.url()));
  const shownSlide = () => showFrame()?.evaluate(() => (document.documentElement.dataset.ready === "true"
    ? Number(document.querySelector(".frameseq-slide-frame.is-active")?.dataset.index)
    : undefined));
  const showing = () => page.evaluate(() => Boolean(document.querySelector(".studio-show")));
  const fullScreens = () => page.evaluate(() => window.__fullScreens.splice(0));
  const popups = [];
  browser.on("targetcreated", async (target) => {
    if (target.type() === "page") popups.push(await target.page());
  });
  const presenter = () => popups.find((popup) => {
    try {
      return !popup.isClosed() && /[?&]presenter=1/.test(popup.url());
    } catch {
      return false;
    }
  });
  const presenterSlide = () => presenter()?.evaluate(() => (document.documentElement.dataset.ready === "true"
    ? Number(document.querySelector(".frameseq-presenter-current .frameseq-slide-frame.is-active")?.dataset.index)
    : undefined));
  const previewSlide = () => previewFrame()
    ?.evaluate(() => Number(document.querySelector(".frameseq-slide-frame.is-active")?.dataset.index));
  /** Present › Show screen, open, as the labels of its items and which one is checked. */
  const showScreens = async () => {
    await page.click("[data-menu='present']");
    await page.click("[data-command='show-screen']");
    await page.waitForSelector("[data-command='show-screen-auto']");
    return page.$$eval("[data-command^='show-screen-']", (items) => items.map((item) => (
      `${item.getAttribute("aria-checked") === "true" ? "✓ " : ""}${item.querySelector(".studio-menu-label").textContent}`
    )));
  };
  const chooseShowScreen = async (label) => {
    const items = await showScreens();
    const index = items.findIndex((item) => item.replace("✓ ", "").startsWith(label));
    assert.ok(index >= 0, `Show screen lists ${label}: ${items.join(" | ")}`);
    await (await page.$$("[data-command^='show-screen-']"))[index].click();
  };
  const presenterLeft = async () => {
    await waitFor(async () => (await presenterSlide()) !== undefined, "presenter view to open");
    return presenter().evaluate(() => screenX);
  };
  const endShow = async (message) => {
    await page.keyboard.press("Escape");
    await waitFor(async () => !(await showing()), message);
    await waitFor(() => popups.every((popup) => popup.isClosed() || !/[?&]presenter=1/.test(popup.url())), "presenter view to close");
  };

  // Until the browser may tell the Studio about the screens, Show screen offers to find them.
  assert.deepEqual(await showScreens(), ["✓ Automatic", "Find the other screens…"]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Until the browser may place windows, F5 says what two screens would do, and This screen only
  // presents in the window as on one screen.
  await page.focus(".cm-content");
  await page.keyboard.press("F5");
  await page.waitForSelector("dialog.studio-dialog[open]");
  assert.match(await page.$eval("dialog.studio-dialog[open] h2", (title) => title.textContent), /two screens/);
  const thisScreen = await page.$$("dialog.studio-dialog[open] .studio-button");
  await (await waitFor(async () => {
    for (const button of thisScreen) {
      if (await button.evaluate((element) => element.textContent === "This screen only")) return button;
    }
    return undefined;
  }, "the This screen only button")).click();
  await waitFor(async () => (await shownSlide()) === 0, "the show to start in the window");
  assert.deepEqual(await fullScreens(), ["this screen"], "the show fills this screen");
  assert.equal(presenter(), undefined, "presenter view stays closed on one screen");
  await page.keyboard.press("Escape");
  await waitFor(async () => !(await showing()), "Escape to end the show");

  // Once it may, F5 takes the slides to the projector and opens presenter view over the laptop's
  // screen; presenter view moves the show on, and its Escape ends it.
  const cdp = await browser.target().createCDPSession();
  await cdp.send("Browser.grantPermissions", { origin, permissions: ["windowManagement"] });
  // With more than one other screen, Automatic takes the first external one the browser lists.
  const automatic = await page.evaluate(async () => (await getScreenDetails()).screens
    .find((other) => !other.isInternal && !other.isPrimary)?.label);
  assert.ok(["Projector", "Monitor"].includes(automatic), `an external screen is automatic: ${automatic}`);
  await page.focus(".cm-content");
  await page.keyboard.press("F5");
  await waitFor(async () => (await shownSlide()) === 0, "the show to start on two screens");
  assert.deepEqual(await fullScreens(), [automatic], "the slides fill an external screen");
  await waitFor(async () => (await presenterSlide()) === 0, "presenter view to open on the first slide");
  const view = presenter();
  assert.match(view.url(), /[?&]show=1/, "presenter view knows it is beside the show");
  const bounds = await view.evaluate(() => ({ x: screenX, y: screenY, width: outerWidth, height: outerHeight }));
  assert.equal(bounds.x, 0, "presenter view opens on the laptop's screen");
  assert.ok(bounds.x + bounds.width <= 1600, `presenter view stays on the laptop's screen: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.width >= 1200, `presenter view fills the laptop's screen: ${JSON.stringify(bounds)}`);
  assert.equal(await view.$("[data-action='audience']"), null, "presenter view beside the show has no audience view to open");
  assert.ok(await view.$("[data-action='end-show']"), "presenter view can end the show");
  await view.keyboard.press("ArrowRight");
  await waitFor(async () => (await shownSlide()) === 1, "presenter view to move the show on");
  await view.keyboard.press("Escape");
  await waitFor(async () => !(await showing()), "Escape in presenter view to end the show");
  await waitFor(() => view.isClosed(), "presenter view to close with the show");
  await waitFor(async () => (await previewSlide()) === 1, "the Studio to come back on the slide the show ended on");

  // End show in presenter view ends it as well, and Escape in the Studio's window closes
  // presenter view with the show.
  await page.focus(".cm-content");
  await page.keyboard.press("F5");
  await waitFor(async () => (await presenterSlide()) === 1, "presenter view to open on the current slide");
  await fullScreens();
  await presenter().click("[data-action='end-show']");
  await waitFor(async () => !(await showing()), "End show to end the show");
  await page.keyboard.down("Shift");
  await page.keyboard.press("F5");
  await page.keyboard.up("Shift");
  await waitFor(async () => (await presenterSlide()) === 0, "Shift+F5 to open presenter view on the first slide");
  const second = presenter();
  await page.keyboard.press("Escape");
  await waitFor(async () => !(await showing()), "Escape in the Studio to end the show");
  await waitFor(() => second.isClosed(), "presenter view to close when the Studio ends the show");
  await fullScreens();

  // Present › Show screen lists every screen by where it is from the Studio's, and the slides go
  // to the chosen one, with presenter view on the Studio's screen, or on another when the slides
  // take that one.
  const listed = await showScreens();
  assert.equal(listed[0], "✓ Automatic");
  assert.deepEqual(listed.slice(1).sort(), [
    "Laptop · the Studio's screen · 1600 × 1000 · main display",
    "Monitor · on the left · 1280 × 1024",
    "Projector · on the right · 1920 × 1080",
  ]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await chooseShowScreen("Monitor");
  assert.deepEqual((await showScreens()).filter((item) => item.startsWith("✓")), ["✓ Monitor · on the left · 1280 × 1024"]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.focus(".cm-content");
  await page.keyboard.press("F5");
  assert.equal(await presenterLeft(), 0, "presenter view stays on the Studio's screen");
  assert.deepEqual(await fullScreens(), ["Monitor"], "the slides fill the chosen screen");
  await endShow("Escape to end the show on the chosen screen");
  assert.equal(await page.$(".studio-menubar-menu"), null, "a menu closed by its item's click stays closed");
  await chooseShowScreen("Laptop");
  await page.focus(".cm-content");
  await page.keyboard.press("F5");
  const elsewhere = await presenterLeft();
  assert.ok(elsewhere === 1600 || elsewhere === -1280, `presenter view goes to another screen when the slides take the Studio's: ${elsewhere}`);
  assert.deepEqual(await fullScreens(), ["Laptop"], "the slides fill the Studio's screen when it is chosen");
  await endShow("Escape to end the show on the Studio's screen");
  // A screen no longer there leaves the choice to Automatic until it comes back.
  await page.evaluate(() => localStorage.setItem("frameseq-studio-show-screen", "Gone@9000,0"));
  await page.reload({ waitUntil: "load" });
  await waitFor(
    () => previewFrame()?.evaluate(() => document.documentElement.dataset.ready === "true"),
    "the preview to render again",
    120_000,
  );
  assert.equal((await showScreens())[0], "✓ Automatic", "a screen that is gone chooses automatically");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.focus(".cm-content");
  await page.keyboard.press("F5");
  assert.equal(await presenterLeft(), 0, "an automatic show puts presenter view on the Studio's screen");
  assert.deepEqual(await fullScreens(), [automatic], "an automatic show puts the slides on an external screen");
  await endShow("Escape to end the automatic show");
  await chooseShowScreen("Monitor");

  // Present › Use presenter view turned off puts the slides on the chosen screen alone, and with
  // Automatic, in the window, as on one screen.
  await page.click("[data-menu='present']");
  assert.equal(await page.$eval("[data-command='use-presenter-view']", (item) => item.getAttribute("aria-checked")), "true");
  await page.click("[data-command='use-presenter-view']");
  await page.focus(".cm-content");
  await page.keyboard.press("F5");
  await waitFor(async () => (await shownSlide()) === 0, "the show to start on the chosen screen without presenter view");
  assert.deepEqual(await fullScreens(), ["Monitor"], "without presenter view the slides still fill the chosen screen");
  await delay(500);
  assert.equal(presenter(), undefined, "without presenter view no window opens");
  await endShow("Escape to end the show without presenter view");
  await chooseShowScreen("Automatic");
  await page.focus(".cm-content");
  await page.keyboard.press("F5");
  await waitFor(async () => (await shownSlide()) === 0, "the show to start in the window again");
  assert.deepEqual(await fullScreens(), ["this screen"], "without presenter view or a chosen screen the show fills this screen");
  await delay(500);
  assert.equal(presenter(), undefined, "without presenter view no window opens");
  await page.keyboard.press("Escape");
  await waitFor(async () => !(await showing()), "Escape to end the last show");

  assert.deepEqual(errors, [], "no page errors");
  console.log("Studio screens test passed: one screen until the browser may place windows, the slides on another screen with presenter view on this one, ending the show from either, Show screen and its choices, and Use presenter view.");
} finally {
  await browser.close();
  server.kill();
  await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => undefined);
}
