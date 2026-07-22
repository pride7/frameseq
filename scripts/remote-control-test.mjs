#!/usr/bin/env node

import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { createServer } from "vite";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.FRAMESEQ_ENTRY = resolve(packageRoot, "slides.ts");
process.env.FRAMESEQ_REMOTE = "1";

const server = await createServer({
  configFile: resolve(packageRoot, "vite.config.ts"),
  root: packageRoot,
  logLevel: "silent",
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: false,
    open: false,
  },
});
await server.listen();

const address = server.httpServer?.address();
if (!address || typeof address === "string") {
  await server.close();
  throw new Error("Could not determine remote-control test server address");
}

const browser = await puppeteer.launch(puppeteerLaunchOptions());
const errors = [];
const session = "0123456789abcdef0123456789abcdef";

try {
  const audience = await browser.newPage();
  const remote = await browser.newPage();
  audience.setDefaultTimeout(10_000);
  remote.setDefaultTimeout(10_000);
  for (const [label, page] of [["Audience", audience], ["Remote", remote]]) {
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${label}: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
  }

  const origin = `http://127.0.0.1:${address.port}`;
  await audience.goto(`${origin}/?session=${session}`, { waitUntil: "networkidle0" });
  await audience.waitForFunction(() => document.documentElement.dataset.ready === "true");

  await remote.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await remote.goto(`${origin}/?remote=1&session=${session}`, { waitUntil: "networkidle0" });
  await remote.waitForFunction(() => document.documentElement.dataset.ready === "true");
  await remote.waitForFunction(
    () => document.querySelector(".frameseq-remote-status")?.textContent === "Connected",
  );

  assert.equal(await remote.$$eval(".frameseq-remote", (elements) => elements.length), 1);
  assert.equal(await remote.$$eval(".frameseq-presenter", (elements) => elements.length), 0);
  assert.equal(
    await remote.$eval(".frameseq-counter", (element) => element.textContent),
    "1/7",
  );

  await remote.click(".frameseq-remote-controls [data-action='next']");
  await audience.waitForFunction(
    () => document.querySelector(".frameseq-slide-frame.is-active")?.getAttribute("data-index") === "1",
  );
  assert.equal(
    await remote.$eval(".frameseq-counter", (element) => element.textContent),
    "2/7",
  );

  await remote.click("[data-action='laser-toggle']");
  const remoteCanvas = await remote.$(
    ".frameseq-remote-current .frameseq-slide-frame.is-active > .frameseq-slide",
  );
  const remoteCanvasBounds = await remoteCanvas?.boundingBox();
  assert.ok(remoteCanvasBounds);
  await remote.mouse.move(
    remoteCanvasBounds.x + remoteCanvasBounds.width * 0.3,
    remoteCanvasBounds.y + remoteCanvasBounds.height * 0.65,
  );
  await audience.waitForFunction(
    () => Boolean(document.querySelector(".frameseq-laser-pointer.is-visible")),
  );
  const audiencePointer = await audience.$eval(
    ".frameseq-laser-pointer.is-visible",
    (element) => ({
      left: Number.parseFloat(element.style.left),
      top: Number.parseFloat(element.style.top),
    }),
  );
  assert.ok(Math.abs(audiencePointer.left - 30) < 0.5);
  assert.ok(Math.abs(audiencePointer.top - 65) < 0.5);

  await remote.click("[data-action='laser-toggle']");

  assert.equal(await audience.$$eval("[data-action='remote-pair']", (elements) => elements.length), 1);
  await audience.$eval(
    "[data-action='remote-pair']",
    (element) => (element instanceof HTMLButtonElement ? element.click() : undefined),
  );
  await audience.waitForSelector(".frameseq-remote-dialog[open] .frameseq-remote-qr svg");
  const pairingUrl = await audience.$eval(
    ".frameseq-remote-url",
    (element) => element.textContent ?? "",
  );
  assert.match(pairingUrl, /[?&]remote=1(?:&|$)/);
  assert.match(pairingUrl, new RegExp(`[?&]session=${session}(?:&|$)`));

  await Promise.all([
    remote.waitForNavigation({ waitUntil: "domcontentloaded" }),
    remote.click("[data-action='presenter-here']"),
  ]);
  await remote.waitForFunction(() => document.documentElement.dataset.ready === "true");
  await remote.waitForSelector(".frameseq-presenter");

  const presenterUrl = new URL(remote.url());
  assert.equal(presenterUrl.searchParams.get("presenter"), "1");
  assert.equal(presenterUrl.searchParams.get("session"), session);
  assert.equal(presenterUrl.searchParams.has("remote"), false);
  assert.equal(
    await remote.$eval(".frameseq-counter", (element) => element.textContent),
    "2/7",
  );
  assert.equal(
    await remote.$eval(".frameseq-presenter-notes", (element) => element.textContent?.trim()),
    "Emphasize that source order replaces nested callbacks and layout boilerplate.",
  );
  assert.equal(
    await remote.$$eval(".frameseq-presenter-next-frame > .frameseq-slide", (elements) => elements.length),
    1,
  );
  assert.equal(
    await remote.$eval("[data-action='remote-here']", (element) => element.textContent),
    "Simple remote",
  );

  const mobilePresenterLayout = await remote.evaluate(() => {
    const bounds = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return undefined;
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        display: getComputedStyle(element).display,
      };
    };
    return {
      viewportHeight: innerHeight,
      bodyOverflow: getComputedStyle(document.body).overflow,
      current: bounds(".frameseq-presenter-current"),
      notes: bounds(".frameseq-presenter-notes-panel"),
      next: bounds(".frameseq-presenter-next"),
      controls: bounds(".frameseq-presenter-controls"),
    };
  });
  assert.equal(mobilePresenterLayout.bodyOverflow, "hidden");
  assert.ok(mobilePresenterLayout.current?.height > 150);
  assert.ok(mobilePresenterLayout.notes?.height > 150);
  assert.equal(mobilePresenterLayout.next?.display, "none");
  assert.ok((mobilePresenterLayout.notes?.bottom ?? Infinity) <= (mobilePresenterLayout.controls?.top ?? 0) + 1);
  assert.ok((mobilePresenterLayout.controls?.bottom ?? Infinity) <= mobilePresenterLayout.viewportHeight + 1);

  await remote.click("[data-action='mobile-panel'][data-panel='next']");
  assert.equal(
    await remote.$eval(".frameseq-presenter-next", (element) => getComputedStyle(element).display),
    "block",
  );
  assert.equal(
    await remote.$eval(".frameseq-presenter-notes-panel", (element) => getComputedStyle(element).display),
    "none",
  );
  await remote.click("[data-action='mobile-panel'][data-panel='notes']");

  await remote.click(".frameseq-presenter-controls [data-action='next']");
  await audience.waitForFunction(
    () => document.querySelector(".frameseq-slide-frame.is-active")?.getAttribute("data-index") === "2",
  );

  await Promise.all([
    remote.waitForNavigation({ waitUntil: "domcontentloaded" }),
    remote.click("[data-action='remote-here']"),
  ]);
  await remote.waitForFunction(() => document.documentElement.dataset.ready === "true");
  await remote.waitForFunction(
    () => document.querySelector(".frameseq-remote-status")?.textContent === "Connected",
  );

  const returnedRemoteUrl = new URL(remote.url());
  assert.equal(returnedRemoteUrl.searchParams.get("remote"), "1");
  assert.equal(returnedRemoteUrl.searchParams.get("session"), session);
  assert.equal(returnedRemoteUrl.searchParams.has("presenter"), false);
  assert.match(
    await remote.$eval(".frameseq-counter", (element) => element.textContent ?? ""),
    /^3\/7 · 0\/3$/,
  );
  assert.deepEqual(errors, []);

  console.log("Remote-control test passed: QR pairing, phone presenter mode, navigation, and laser sync over LAN transport.");
} finally {
  await browser.close();
  await server.close();
}
