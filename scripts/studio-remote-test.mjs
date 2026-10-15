#!/usr/bin/env node

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
// Outside FrameSeq's own folder, which the network may always read, as a presentation in
// Documents is. The folder holds a file the slides do not import, which must stay private.
const workspace = await mkdtemp(join(tmpdir(), "frameseq-studio-remote-"));
const secret = resolve(workspace, "private.txt");
await writeFile(secret, "Not for the network.\n");
// A 2 × 2 PNG the slides import, which the phone's copy of the slides must load.
await writeFile(resolve(workspace, "photo.png"), Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==",
  "base64",
));
await writeFile(resolve(workspace, "talk.slides.ts"), [
  'import photo from "./photo.png";',
  'presentation({ title: "Remote test", theme: "midnight" });',
  'slide("Photo"); image(photo, "Photo");',
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

// Started without --remote: the Studio turns the remote on itself, by starting again.
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

const browser = await puppeteer.launch(puppeteerLaunchOptions({ defaultViewport: { width: 1400, height: 860 } }));
// The phone is a browser of its own, so the Studio going full screen never hides it.
const phoneBrowser = await puppeteer.launch(puppeteerLaunchOptions({ defaultViewport: { width: 390, height: 844 } }));
const errors = [];
let skipped = "";
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(`Studio: ${error.message}`));
  await page.evaluateOnNewDocument(() => localStorage.setItem("frameseq-studio-language", "en"));
  await page.goto(studioUrl, { waitUntil: "load" });
  const previewFrame = () => page.frames().find((frame) => /frameseq-preview=studio(#|$)/.test(frame.url()));
  await waitFor(
    () => previewFrame()?.evaluate(() => document.documentElement.dataset.ready === "true"),
    "the preview to render",
    120_000,
  );
  const session = () => page.evaluate(() => fetch("/__frameseq/studio/session").then((response) => response.json()));
  assert.equal((await session()).phoneRemote, false, "the phone remote starts off");

  // Present › Phone remote… asks first; the Studio then starts again on the network and reloads
  // into the code to scan.
  await page.click("[data-menu='present']");
  await page.click("[data-command='phone-remote']");
  await page.waitForSelector("dialog.studio-dialog[open] .studio-button.is-primary");
  await page.click("dialog.studio-dialog[open] .studio-button.is-primary");
  await waitFor(
    () => page.evaluate(() => Boolean(document.querySelector("dialog[open] .studio-remote-code svg, dialog[open].studio-info-dialog p"))),
    "the pairing to show after the Studio started again",
    90_000,
  );
  assert.equal((await session()).phoneRemote, true, "the Studio started again with the phone remote on");
  const link = await page.$eval("dialog[open] .studio-remote-link", (element) => element.textContent).catch(() => "");
  if (!link) {
    skipped = "this computer has no local network address";
  } else {
    const remote = new URL(link);
    assert.equal(remote.searchParams.get("remote"), "1");
    assert.match(remote.searchParams.get("session") ?? "", /^[0-9a-f]{32,}$/);
    await page.keyboard.press("Escape");

    // The phone opens the link at this computer's network address, so the server sees another
    // computer: it gets the slides and the files they import, and nothing else.
    const phone = await phoneBrowser.newPage();
    phone.on("pageerror", (error) => errors.push(`Phone: ${error.message}`));
    await phone.goto(link, { waitUntil: "load" });
    await waitFor(() => phone.evaluate(() => document.documentElement.dataset.ready === "true"), "the phone to render the slides");
    await waitFor(
      () => phone.$eval(".frameseq-remote-current img", (image) => image.complete && image.naturalWidth === 2),
      "the phone to load the image the slides import",
    );
    const status = (path) => phone.evaluate((target) => fetch(target).then((response) => response.status), `${remote.origin}${path}`);
    assert.equal(await status(`/@fs/${secret.replaceAll("\\", "/")}`), 403, "a file the slides do not import stays private");
    assert.equal(await status("/__frameseq/source-info"), 403);
    assert.equal(await status("/__frameseq/studio/session"), 403);

    // Only this computer may write the slides, even over the connection hot reload uses.
    const undoOver = async (origin) => {
      const client = await (await fetch(`${origin}/@vite/client`)).text();
      const token = client.match(/const wsToken = "([^"]+)"/)?.[1];
      return new Promise((resolveResult, rejectResult) => {
        const socket = new WebSocket(`${origin.replace(/^http/, "ws")}/?token=${token}`, "vite-hmr");
        const timer = setTimeout(() => rejectResult(new Error("No answer to the undo")), 10_000);
        socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "custom", event: "frameseq:undo-edit", data: {} })));
        socket.addEventListener("message", (event) => {
          const message = JSON.parse(String(event.data));
          if (message.event !== "frameseq:apply-edit-result") return;
          clearTimeout(timer);
          socket.close();
          resolveResult(message.data);
        });
      });
    };
    assert.match((await undoOver(remote.origin)).reason, /Only the computer running FrameSeq Studio/);
    assert.doesNotMatch((await undoOver(new URL(studioUrl).origin)).reason ?? "", /Only the computer running FrameSeq Studio/);

    // F5 starts the show, which carries the pairing; the phone follows it and steps it on.
    await page.bringToFront();
    await page.focus(".cm-content");
    await page.keyboard.press("F5");
    const showFrame = () => page.frames().find((frame) => /[?&]show=1/.test(frame.url()));
    const shown = () => showFrame()?.evaluate(() => (document.documentElement.dataset.ready === "true"
      ? Number(document.querySelector(".frameseq-slide-frame.is-active")?.dataset.index)
      : undefined));
    await waitFor(async () => (await shown()) === 0, "the show to start");
    assert.equal(new URL(showFrame().url()).searchParams.get("session"), remote.searchParams.get("session"));
    await waitFor(() => phone.$eval(".frameseq-remote-status", (element) => element.textContent === "Connected"), "the phone to find the show");
    await phone.click("[data-action='next']");
    await waitFor(async () => (await shown()) === 1, "the phone's Next to move the show");
    await phone.click("[data-action='laser-toggle']");
    const middle = await phone.$eval(".frameseq-remote-current .frameseq-slide-frame.is-active", (element) => {
      const box = element.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    await phone.mouse.move(middle.x, middle.y);
    await phone.mouse.move(middle.x + 4, middle.y + 4);
    await waitFor(
      () => showFrame().evaluate(() => Boolean(document.querySelector(".frameseq-slide-frame.is-active .frameseq-laser-pointer.is-visible"))),
      "the phone's laser to show on the screen",
    );

    // After the last slide the screen goes black, and one more step ends the show.
    const endShowing = () => showFrame().evaluate(() => !document.querySelector(".frameseq-show-end").hidden);
    await page.keyboard.press("End");
    await waitFor(async () => (await shown()) === 2, "End to show the last slide");
    await page.keyboard.press("ArrowRight");
    await waitFor(endShowing, "the end of the show");
    assert.equal(await showFrame().$eval(".frameseq-show-end", (element) => element.textContent), "End of slide show. Click to exit.");
    await page.keyboard.press("ArrowLeft");
    await waitFor(async () => !(await endShowing()), "going back from the end of the show");
    await page.keyboard.press("ArrowRight");
    await waitFor(endShowing, "the end of the show again");
    await page.keyboard.press("ArrowRight");
    await waitFor(() => page.evaluate(() => !document.querySelector(".studio-show")), "the step after the end to close the show");
  }
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(output.slice(-3000));
  throw error;
} finally {
  await browser.close();
  await phoneBrowser.close();
  server.kill();
  await delay(500);
  await rm(workspace, { recursive: true, force: true }).catch(() => undefined);
}

console.log(skipped
  ? `Studio phone remote test passed without a phone: ${skipped}.`
  : "Studio phone remote test passed: turning the remote on, pairing, the network sharing only the slides and refusing writes, the phone stepping the show and its laser, and the end of the show.");
