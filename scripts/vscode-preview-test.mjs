#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
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
      window.revealed = [];
      window.edited = [];
      // Stands in for the extension host: it records what it was asked to do, and answers.
      const editor = {
        postMessage: (message) => {
          if (message.type === "frameseq.reveal") window.revealed.push(message);
          if (message.type === "frameseq.edit") {
            window.edited.push(message);
            window.postMessage({ type: "frameseq.edit-result", ok: true }, "*");
          }
        },
      };
      window.addEventListener("message", (event) => {
        const message = event.data;
        if (!message) return;
        if (event.source === preview.contentWindow) {
          if (message.type === "frameseq.reveal" || message.type === "frameseq.edit") {
            editor.postMessage(message);
          }
          return;
        }
        if (message.type === "frameseq.navigate" && typeof message.url === "string") {
          preview.src = message.url;
          return;
        }
        if (message.type === "frameseq.edit-result") {
          preview.contentWindow?.postMessage(message, "*");
        }
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

  // Alt-clicking inside the preview reaches the extension instead of the development server.
  await frame.evaluate(() => {
    const target = document.querySelector(".frameseq-slide-frame.is-active [data-frameseq-source]");
    if (!target) throw new Error("The preview carries no source spans");
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, altKey: true }));
  });
  await page.waitForFunction(() => window.revealed.length > 0, { timeout: 10_000 });
  const revealed = await page.evaluate(() => window.revealed[0]);
  assert.equal(revealed.type, "frameseq.reveal");
  assert.ok(revealed.line > 0, "A revealed object should report the line that wrote it");
  assert.ok(revealed.column > 0, "A revealed object should report the column that wrote it");

  // Dragging inside an embedded preview asks the editor, so the change can be undone there.
  // Nothing reaches the development server, which is why the deck on disk stays as it is.
  const deckBefore = await readFile(resolve(packageRoot, "slides.ts"), "utf8");
  await frame.click('[data-action="edit-toggle"]');
  const movableSlide = await frame.evaluate(() => {
    const element = document.querySelector("[data-frameseq-move]");
    return element ? Number(element.closest(".frameseq-slide-frame").dataset.index) : -1;
  });
  assert.ok(movableSlide >= 0, "The demo deck should place at least one object by coordinates");
  // A click advances a reveal before it advances the slide, so step until the index matches.
  const activeSlide = () => frame.evaluate(
    () => Number(document.querySelector(".frameseq-slide-frame.is-active")?.dataset.index),
  );
  for (let attempt = 0; attempt < 60 && await activeSlide() !== movableSlide; attempt += 1) {
    await frame.click('.frameseq-controls [data-action="next"]');
  }
  assert.equal(await activeSlide(), movableSlide, "The preview should reach the canvas slide");

  // The deck states these coordinates, and a drag may have changed them, so grab the object
  // wherever it currently shows rather than assuming it sits fully inside the slide.
  const bounds = await (await frame.$("[data-frameseq-move]")).boundingBox();
  const slide = await (await frame.$(".frameseq-slide-frame.is-active")).boundingBox();
  const left = Math.max(bounds.x, slide.x);
  const top = Math.max(bounds.y, slide.y);
  const right = Math.min(bounds.x + bounds.width, slide.x + slide.width);
  const bottom = Math.min(bounds.y + bounds.height, slide.y + slide.height);
  assert.ok(right - left > 8 && bottom - top > 8, "The object to drag should be visible on the slide");

  await page.mouse.move((left + right) / 2, (top + bottom) / 2);
  await page.mouse.down();
  await page.mouse.move((left + right) / 2 + 40, (top + bottom) / 2 + 20);
  await page.mouse.up();

  await page.waitForFunction(() => window.edited.length > 0, { timeout: 10_000 });
  const requested = await page.evaluate(() => window.edited[0]);
  assert.equal(requested.type, "frameseq.edit");
  assert.equal(requested.edits.length, 2, "Moving an object offers its two coordinates");
  for (const edit of requested.edits) {
    // The offsets and the text must describe the deck as it stands, whatever it now says.
    assert.equal(
      deckBefore.slice(edit.start, edit.end),
      edit.expected,
      `A drag should quote the deck at ${edit.start}..${edit.end}`,
    );
    assert.equal(typeof edit.value, "number");
  }
  assert.equal(
    await readFile(resolve(packageRoot, "slides.ts"), "utf8"),
    deckBefore,
    "An embedded preview must leave the writing to its host",
  );
  await frame.click('[data-action="edit-toggle"]');

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
