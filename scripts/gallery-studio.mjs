import { spawn } from "node:child_process";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const deck = resolve(packageRoot, "gallery", "slides", "studio.slides.ts");

async function waitFor(check, message, timeout = 60_000) {
  const started = Date.now();
  for (;;) {
    const value = await check().catch(() => undefined);
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`Studio capture timed out: ${message}`);
    await delay(150);
  }
}

function startStudio(workspace) {
  const child = spawn(process.execPath, [cli, "studio", "talk.slides.ts", "--no-open"], {
    cwd: workspace,
    env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0", NO_COLOR: "1" },
    windowsHide: true,
  });
  let output = "";
  const address = new Promise((resolveAddress, rejectAddress) => {
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
    child.on("close", (code) => rejectAddress(new Error(`The Studio exited with ${code}.\n${output}`)));
  });
  return { child, address };
}

/**
 * Photograph the Studio editing the gallery's lecture slides, for the landing page. Like the
 * recipe pictures, it is taken on every build, so the page never shows an older Studio.
 */
export async function captureStudio(imagesDirectory) {
  const workspace = resolve(packageRoot, "tmp", "gallery-studio");
  await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  await mkdir(workspace, { recursive: true });
  await mkdir(imagesDirectory, { recursive: true });
  await copyFile(deck, resolve(workspace, "talk.slides.ts"));

  const studio = startStudio(workspace);
  const browser = await puppeteer.launch(puppeteerLaunchOptions());
  try {
    const address = await studio.address;
    const page = await browser.newPage();
    await page.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 2 });
    // A dark Studio with room for the inspector, and a short problems panel since it has none.
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem("frameseq-studio-theme", "dark");
      localStorage.setItem("frameseq-studio-layout", JSON.stringify({
        "--studio-rail-width": 250,
        "--studio-inspector-height": 430,
        "--studio-preview-width": 660,
        "--studio-panel-height": 96,
      }));
    });
    await page.goto(address, { waitUntil: "networkidle2" });
    await page.waitForFunction(
      () => document.querySelector("[data-slot='check-state']")?.textContent?.includes("Layout checked"),
      { timeout: 120_000 },
    );
    const rail = page.frames().find((frame) => frame.url().includes("thumbnails=1"));
    const preview = page.frames().find((frame) => /frameseq-preview=studio(#|$)/.test(frame.url()));
    if (!rail || !preview) throw new Error("The Studio did not embed its preview and slide rail");

    // Show the diagram, then choose its source node in the inspector and open its values.
    await waitFor(async () => {
      const active = await preview.evaluate(
        () => Number(document.querySelector(".frameseq-slide-frame.is-active")?.dataset.index),
      );
      if (active === 2) return true;
      (await rail.$$(".frameseq-thumbnail"))[2]?.click();
      await delay(400);
      return false;
    }, "the diagram slide to show");
    await waitFor(
      () => page.$eval("[data-slot='inspector-meta']", (element) => element.textContent?.startsWith("3 /")),
      "the inspector to follow the diagram",
    );
    // Rows read "circle · A 0", the kind followed by the node's label.
    const nodeRow = () => page.evaluateHandle(() => [...document.querySelectorAll(".studio-tree-row[data-kind='circle']")]
      .find((row) => /·\s*A\b/.test(row.querySelector(".studio-tree-title")?.textContent ?? "")));
    await waitFor(async () => {
      const row = (await nodeRow()).asElement();
      if (!row) return false;
      await row.click();
      return true;
    }, "the source node in the inspector");
    await waitFor(async () => {
      const row = (await nodeRow()).asElement();
      if (!row) return false;
      if (await row.evaluate((element) => element.getAttribute("aria-expanded") === "true")) return true;
      await (await row.$(".studio-tree-toggle"))?.click();
      await delay(300);
      return false;
    }, "the source node to show its values");
    await page.waitForSelector("input.studio-property-input[aria-label='width']");
    // Bring the node's values into view: the connectors above it fill the inspector otherwise.
    await (await nodeRow()).asElement()?.evaluate((row) => row.scrollIntoView({ block: "start" }));
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await page.mouse.move(1, 1);
    await delay(1200);

    await page.screenshot({ path: resolve(imagesDirectory, "studio.webp"), type: "webp", quality: 88 });
    // The card a link preview shows: 1200 x 630, cut from the top of the same window.
    const { width } = page.viewport();
    await page.screenshot({
      path: resolve(imagesDirectory, "studio-card.jpg"),
      type: "jpeg",
      quality: 86,
      clip: { x: 0, y: 0, width, height: Math.round(width * 630 / 1200), scale: 1200 / (width * 2) },
    });
    console.log("Captured the Studio for the landing page");
  } finally {
    await browser.close();
    studio.child.kill();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await captureStudio(resolve(process.argv[2] ?? resolve(packageRoot, "tmp", "gallery-studio-images")));
}
