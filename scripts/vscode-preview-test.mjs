#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
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
  await page.setViewport({ width: 800, height: 1000 });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent(`
    <iframe id="frameseq-preview"
      style="width: 620px; height: 900px; border: 0"
      sandbox="allow-scripts allow-forms allow-same-origin allow-downloads"
      src="${url.toString()}"
    ></iframe>
    <script>
      const preview = document.getElementById("frameseq-preview");
      window.revealed = [];
      window.edited = [];
      window.selected = [];
      window.bound = [];
      // Stands in for the extension host: it records what it was asked to do, and answers.
      const editor = {
        postMessage: (message) => {
          if (message.type === "frameseq.reveal") window.revealed.push(message);
          if (message.type === "frameseq.select") window.selected.push(message);
          if (message.type === "frameseq.bind-selection") window.bound.push(message);
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
          if (["frameseq.reveal", "frameseq.edit", "frameseq.select", "frameseq.bind-selection"].includes(message.type)) {
            editor.postMessage(message);
          }
          return;
        }
        if (message.type === "frameseq.navigate" && typeof message.url === "string") {
          preview.src = message.url;
          return;
        }
        if (message.type === "frameseq.focus-source") {
          preview.contentWindow?.postMessage(message, "*");
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
  const fittedFrame = await frame.$eval(".frameseq-slide-frame.is-active", (element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height, viewportHeight: innerHeight };
  });
  assert.ok(
    Math.abs(fittedFrame.width / fittedFrame.height - 16 / 9) < 0.01,
    "The visible slide frame should keep the presentation ratio in a tall editor pane",
  );
  assert.ok(
    fittedFrame.height < fittedFrame.viewportHeight * 0.6,
    "A tall editor pane should letterbox the slide instead of stretching its frame",
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

  // Selecting the same component in Current Slide highlights it in the embedded preview.
  await page.evaluate((target) => {
    window.postMessage({ type: "frameseq.focus-source", line: target.line, column: target.column }, "*");
  }, revealed);
  await frame.waitForSelector(".is-frameseq-source-focus", { timeout: 10_000 });
  assert.equal(
    await frame.$eval(".is-frameseq-source-focus", (element) => {
      const [line, column] = (element.getAttribute("data-frameseq-source") ?? "").split(":").map(Number);
      return `${line}:${column}`;
    }),
    `${revealed.line}:${revealed.column}`,
  );

  // Moving the source cursor to another slide changes the preview page and its highlighted object.
  const thirdSlideTarget = await frame.evaluate(() => {
    const element = document.querySelector('.frameseq-slide-frame[data-index="2"] [data-frameseq-source]');
    const [line, column] = (element?.getAttribute("data-frameseq-source") ?? "").split(":").map(Number);
    return { line, column };
  });
  assert.ok(thirdSlideTarget.line > 0 && thirdSlideTarget.column > 0);
  await page.evaluate((target) => {
    window.postMessage({ type: "frameseq.focus-source", slideIndex: 3, ...target }, "*");
  }, thirdSlideTarget);
  await frame.waitForFunction(
    () => document.querySelector(".frameseq-slide-frame.is-active")?.getAttribute("data-index") === "2",
    { timeout: 10_000 },
  );
  assert.equal(
    await frame.$eval(".is-frameseq-source-focus", (element) => (
      (element.getAttribute("data-frameseq-source") ?? "").split(":").slice(0, 2).join(":")
    )),
    `${thirdSlideTarget.line}:${thirdSlideTarget.column}`,
  );

  // The Current Slide focus is dismissible rather than becoming a permanent frame.
  await frame.evaluate(() => {
    document.querySelector(".frameseq-slides")?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      button: 0,
    }));
  });
  assert.equal(await frame.$$(".is-frameseq-source-focus").then((items) => items.length), 0);
  await page.evaluate((target) => {
    window.postMessage({ type: "frameseq.focus-source", slideIndex: 3, ...target }, "*");
  }, thirdSlideTarget);
  await frame.waitForSelector(".is-frameseq-source-focus", { timeout: 10_000 });
  await frame.evaluate(() => dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  assert.equal(await frame.$$(".is-frameseq-source-focus").then((items) => items.length), 0);

  // Dragging inside an embedded preview asks the editor, so the change can be undone there.
  // Nothing reaches the development server, which is why the deck on disk stays as it is.
  const deckBefore = await readFile(resolve(packageRoot, "slides.ts"), "utf8");
  await frame.click('[data-action="edit-toggle"]');
  const editMode = await frame.evaluate(() => ({
    pressed: document.querySelector('[data-action="edit-toggle"]')?.getAttribute("aria-pressed"),
    active: document.documentElement.classList.contains("frameseq-edit-mode"),
    indicator: getComputedStyle(document.body, "::before").content,
  }));
  assert.equal(editMode.pressed, "true");
  assert.equal(editMode.active, true);
  assert.doesNotMatch(editMode.indicator, /EDIT MODE/);

  // Edit mode uses a plain click for selection, Ctrl/Command-click for multi-select,
  // and offers the exact selected source spans to the host for one-click region binding.
  await frame.evaluate(() => {
    const components = [...document.querySelectorAll(
      '.frameseq-slide-frame.is-active [data-frameseq-source]:not(.frameseq-slide)',
    )];
    if (components.length < 2) throw new Error("The active slide needs two selectable components");
    components[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
  });
  await page.waitForFunction(() => window.selected.at(-1)?.targets?.length === 1, { timeout: 10_000 });
  assert.equal(
    await frame.$eval(".frameseq-selection-toolbar", (element) => element.classList.contains("is-visible")),
    false,
    "A single outlined component should not repeat its label in a top toolbar",
  );
  assert.match(
    await frame.$eval(".frameseq-selection-coordinates", (element) => element.textContent ?? ""),
    /^Selected · (?:flow item|x )/,
    "A selected component should identify itself and explain whether it is positioned",
  );
  await frame.evaluate(() => {
    const components = [...document.querySelectorAll(
      '.frameseq-slide-frame.is-active [data-frameseq-source]:not(.frameseq-slide)',
    )];
    components[1]?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      button: 0,
      ctrlKey: true,
    }));
  });
  await page.waitForFunction(() => window.selected.at(-1)?.targets?.length === 2, { timeout: 10_000 });
  assert.equal(await frame.$$(".is-frameseq-selected").then((items) => items.length), 2);
  assert.match(
    await frame.$eval(".frameseq-selection-path", (element) => element.textContent ?? ""),
    /2 selected/,
  );
  await frame.click('.frameseq-selection-toolbar [data-action="bind-region"]');
  await page.waitForFunction(() => window.bound.at(-1)?.targets?.length === 2, { timeout: 10_000 });

  // Positioned multi-selection offers source-backed alignment as one edit batch.
  await frame.evaluate(() => {
    document.querySelector(".frameseq-slide-frame.is-active")?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      button: 0,
    }));
    const canvas = document.querySelector(".frameseq-slide-frame.is-active .frameseq-slide");
    if (!canvas) throw new Error("The active slide needs a canvas");
    const components = [10, 50, 90].map((x, index) => {
      const element = document.createElement("div");
      element.dataset.arrangeTest = String(index);
      element.dataset.frameseqSource = `${300 + index}:1:${300 + index * 10}:${305 + index * 10}`;
      element.textContent = `Arrange ${index + 1}`;
      element.style.position = "absolute";
      element.style.left = `${x}px`;
      element.style.top = `${40 + index * 50}px`;
      element.style.width = "24px";
      element.style.height = "24px";
      element.style.zIndex = "9999";
      element.dataset.frameseqEdit = JSON.stringify({
        x: { start: 100 + index * 10, end: 102 + index * 10, text: String(x), value: x },
        y: { start: 200 + index * 10, end: 202 + index * 10, text: "40", value: 40 + index * 50 },
      });
      canvas.append(element);
      return element;
    });
    components.forEach((element, index) => {
      element.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        button: 0,
        ctrlKey: index > 0,
      }));
    });
  });
  await page.waitForFunction(() => window.selected.at(-1)?.targets?.length === 3, { timeout: 10_000 });
  const arrangeToolbarBounds = await frame.$eval(".frameseq-selection-toolbar", (element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, viewport: innerWidth };
  });
  assert.ok(
    arrangeToolbarBounds.left >= 0 && arrangeToolbarBounds.right <= arrangeToolbarBounds.viewport,
    "The multi-selection toolbar should fit inside a narrow preview pane",
  );
  assert.equal(
    await frame.$eval('[data-action="align-left"]', (button) => button.disabled),
    false,
  );
  await frame.click('.frameseq-selection-toolbar [data-action="align-left"]');
  await page.waitForFunction(() => window.edited.at(-1)?.edits?.length === 2, { timeout: 10_000 });
  assert.deepEqual(
    await page.evaluate(() => window.edited.at(-1).edits.map((edit) => edit.value)),
    [10, 10],
  );
  await page.evaluate(() => { window.edited = []; });

  // Real keyboard input (not a synthetic event) reaches the focused preview canvas and
  // nudges all selected positioned objects, coalescing repeats into one batch.
  assert.equal(
    await frame.evaluate(() => document.activeElement?.classList.contains("frameseq-slides")),
    true,
    "Click selection should focus the slide canvas for keyboard editing",
  );
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => window.edited.at(-1)?.edits?.length === 3, { timeout: 10_000 });
  assert.deepEqual(
    await page.evaluate(() => window.edited.at(-1).edits.map((edit) => edit.value)),
    [12, 52, 92],
  );

  // Escape clears selection first and leaves editing active; a second Escape exits the mode.
  await page.keyboard.press("Escape");
  assert.equal(await frame.$$(".is-frameseq-selected").then((items) => items.length), 0);
  assert.equal(
    await frame.$eval('[data-action="edit-toggle"]', (button) => button.getAttribute("aria-pressed")),
    "true",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await frame.$eval('[data-action="edit-toggle"]', (button) => button.getAttribute("aria-pressed")),
    "false",
  );
  await frame.click('[data-action="edit-toggle"]');

  // A single selection shows only compact geometry, then smart guides appear near peer anchors.
  await frame.click('[data-arrange-test="0"]');
  await frame.waitForFunction(
    () => document.activeElement?.classList.contains("frameseq-slides"),
    { timeout: 10_000 },
  );
  assert.match(
    await frame.$eval(".frameseq-selection-coordinates", (element) => element.textContent ?? ""),
    /Selected · x 10 · y 40 · 24 × 24/,
  );
  await page.evaluate(() => { window.edited = []; });
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => window.edited.at(-1)?.edits?.[0]?.value === 11, { timeout: 10_000 });
  const firstArrangeBox = await (await frame.$('[data-arrange-test="0"]')).boundingBox();
  const secondArrangeBox = await (await frame.$('[data-arrange-test="1"]')).boundingBox();
  assert.ok(firstArrangeBox && secondArrangeBox);
  await page.evaluate(() => { window.edited = []; });
  await page.mouse.move(firstArrangeBox.x + 4, firstArrangeBox.y + 4);
  await page.mouse.down();
  await page.mouse.move(secondArrangeBox.x + 2, firstArrangeBox.y + 4, { steps: 3 });
  assert.equal(await frame.$$(".frameseq-smart-guide.is-vertical").then((items) => items.length), 1);
  await page.mouse.up();
  assert.equal(await frame.$$(".frameseq-smart-guide").then((items) => items.length), 0);
  await page.waitForFunction(() => window.edited.at(-1)?.edits?.length >= 1, { timeout: 10_000 });
  await frame.evaluate(() => {
    document.querySelector(".frameseq-slide-frame.is-active")?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      button: 0,
    }));
  });
  await page.evaluate(() => { window.edited = []; });

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

  // The source-edit test covers a physical mouse drag. Here a deterministic pointer sequence
  // verifies that an embedded preview routes the resulting edit request to its VS Code host.
  await frame.evaluate(() => {
    const element = document.querySelector(".frameseq-slide-frame.is-active [data-frameseq-move]");
    if (!(element instanceof HTMLElement)) throw new Error("The active slide needs a movable object");
    const box = element.getBoundingClientRect();
    const pointerId = 42;
    const event = (type, x, y, buttons) => new PointerEvent(type, {
      bubbles: true,
      button: type === "pointerup" ? 0 : 0,
      buttons,
      pointerId,
      clientX: x,
      clientY: y,
    });
    element.dispatchEvent(event("pointerdown", box.x + box.width / 2, box.y + box.height / 2, 1));
    dispatchEvent(event("pointermove", box.x + box.width / 2 + 20, box.y + box.height / 2 + 10, 1));
    dispatchEvent(event("pointermove", box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, 1));
    dispatchEvent(event("pointerup", box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, 0));
  });

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
  assert.equal(
    await frame.$eval('[data-action="edit-toggle"]', (button) => button.getAttribute("aria-pressed")),
    "false",
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
  console.log("VS Code preview test passed: ratio fitting, navigation, focus, direct selection, and multi-bind cross the iframe.");
} finally {
  clearTimeout(timeout);
  await browser?.close();
  child.kill();
}
