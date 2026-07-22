#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lowerDrive = (path) => process.platform === "win32"
  ? path.replace(/^[A-Z]:/, (drive) => drive.toLowerCase())
  : path;
const cli = lowerDrive(resolve(packageRoot, "scripts", "frameseq.mjs"));
const cwd = lowerDrive(packageRoot);
const child = spawn(process.execPath, [cli, "dev", "slides.ts", "--no-open"], {
  cwd,
  env: {
    ...process.env,
    BROWSER: "none",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
  },
  windowsHide: true,
});

let output = "";
let address;
let resolveAddress;
let rejectAddress;
const addressReady = new Promise((resolvePromise, rejectPromise) => {
  resolveAddress = resolvePromise;
  rejectAddress = rejectPromise;
});
const timeout = setTimeout(() => {
  rejectAddress(new Error(`Timed out waiting for the FrameSeq development server.\n${output}`));
}, 30_000);

const handleOutput = (chunk) => {
  const text = chunk.toString();
  output += text;
  const match = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/?/);
  if (match && !address) {
    address = match[0];
    clearTimeout(timeout);
    resolveAddress(address);
  }
};

child.stdout.on("data", handleOutput);
child.stderr.on("data", handleOutput);
child.on("error", (error) => rejectAddress(error));
child.on("close", (code) => {
  if (!address && code !== 0) rejectAddress(new Error(`FrameSeq preview exited with code ${code}.\n${output}`));
});

let browser;
try {
  const url = new URL(await addressReady);
  url.searchParams.set("frameseq-preview", "vscode-test");
  url.hash = "1";
  browser = await puppeteer.launch(puppeteerLaunchOptions());
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent(`
    <iframe id="frameseq-preview"
      sandbox="allow-scripts allow-forms allow-same-origin allow-downloads"
      src="${url.toString()}"
    ></iframe>
    <script>
      const preview = document.getElementById("frameseq-preview");
      window.addEventListener("message", (event) => {
        const message = event.data;
        if (!message || message.type !== "frameseq.navigate" || typeof message.url !== "string") return;
        preview.src = message.url;
      });
    </script>
  `);
  const frame = await page.waitForFrame((candidate) => candidate.url().includes("frameseq-preview=vscode-test"));
  await frame.waitForSelector(".frameseq-slide-frame", { timeout: 120_000 });
  await frame.waitForFunction(
    () => document.querySelector(".frameseq-slide-frame.is-active")?.getAttribute("data-index") === "0",
    { timeout: 120_000 },
  );
  assert.equal(await frame.$$eval(".frameseq-slide-frame", (slides) => slides.length), 8);
  assert.match(
    await frame.$eval(".frameseq-slide-frame.is-active", (slide) => slide.textContent ?? ""),
    /Build slides like building apps/,
  );

  const thirdSlideUrl = new URL(url);
  thirdSlideUrl.searchParams.set("frameseq-preview", "vscode-test-slide-3");
  thirdSlideUrl.hash = "3";
  await page.evaluate((nextUrl) => {
    window.postMessage({ type: "frameseq.navigate", url: nextUrl }, "*");
  }, thirdSlideUrl.toString());
  const thirdSlideFrame = await page.waitForFrame(
    (candidate) => candidate.url().includes("frameseq-preview=vscode-test-slide-3"),
  );
  await thirdSlideFrame.waitForFunction(
    () => document.querySelector(".frameseq-slide-frame.is-active")?.getAttribute("data-index") === "2",
    { timeout: 120_000 },
  );
  assert.match(
    await thirdSlideFrame.$eval(
      ".frameseq-slide-frame.is-active",
      (slide) => slide.textContent ?? "",
    ),
    /A fixed canvas with time/,
  );
  assert.deepEqual(errors, []);
  console.log("VS Code preview test passed: lower-case Windows paths render and Webview messages navigate the iframe.");
} finally {
  clearTimeout(timeout);
  await browser?.close();
  child.kill();
}
