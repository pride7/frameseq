#!/usr/bin/env node
// Run against an explicitly supplied host Electron executable. This checks the real preload
// and IPC boundary; it does not assert compatibility with HarmonyOS's Electron fork.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import puppeteer from "puppeteer";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executable = process.env.FRAMESEQ_ELECTRON;
if (!executable) throw new Error("Set FRAMESEQ_ELECTRON to a host Electron executable, then run npm run harmony:shell-test.");
const appDirectory = resolve(root, "output/harmony/FrameSeq");
const workspace = await mkdtemp(join(tmpdir(), "frameseq-harmony-shell-"));
let browser;
let child;
let stopped;
let output = "";

async function waitFor(check, label, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await check();
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}\n${output}`);
}

try {
  const deck = join(workspace, "本地文稿.slides.ts");
  await copyFile(join(appDirectory, "examples/welcome.slides.ts"), deck);
  const selected = join(workspace, "选择的文稿.slides.ts");
  await writeFile(selected, 'presentation("Selected"); slide("File dialog"); text("Opened from the host");\n');
  const config = join(workspace, "config");
  await mkdir(config);
  const launcher = join(workspace, "test-main.cjs");
  await writeFile(launcher, `const { app, BrowserWindow, dialog } = require("electron");\n`
    + `app.setPath("userData", ${JSON.stringify(config)});\n`
    + `BrowserWindow.prototype.show = function () {};\n`
    + `dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [${JSON.stringify(selected)}] });\n`
    + `dialog.showErrorBox = (title, detail) => { console.error(title, detail); app.exit(1); };\n`
    + `require(${JSON.stringify(join(appDirectory, "main.cjs"))});\n`);
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  child = spawn(executable, ["--remote-debugging-port=0", launcher, deck], {
    cwd: workspace, env: environment, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  stopped = new Promise((done) => child.once("exit", done));
  child.on("error", (error) => { output += error.stack; });
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  const endpoint = await waitFor(() => output.match(/DevTools listening on (ws:\/\/\S+)/)?.[1], "Electron's debugging endpoint");
  browser = await puppeteer.connect({ browserWSEndpoint: endpoint, defaultViewport: null });
  const page = await waitFor(async () => (await browser.pages()).find((page) => /studio\.html/.test(page.url())), "the native Studio window");
  await page.waitForSelector(".studio-preview-frame");
  const preview = await waitFor(() => page.frames().find((frame) => /frameseq-preview=studio(?:#|$)/.test(frame.url())), "the native preview");
  await preview.waitForSelector(".frameseq-slide").catch(async (error) => {
    throw new Error(`${error.message}\n${JSON.stringify(await preview.evaluate(() => ({ body: document.body.textContent, error: window.__frameseqError })))}\n${output}`);
  });
  assert.equal(await page.evaluate(() => window.frameseqShell.platform), "harmonyos");
  assert.equal(await preview.evaluate(() => typeof window.frameseqShell), "undefined");
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  const screens = await page.evaluate(() => window.frameseqShell.screens());
  assert.ok(screens.length > 0 && screens.some((screen) => screen.current));
  const picked = await page.evaluate(async () => {
    const session = await (await fetch("/__frameseq/studio/session")).json();
    return (await fetch("/__frameseq/studio/files/choose", { method: "POST", headers: { "Content-Type": "application/json", "x-frameseq-studio": session.token }, body: JSON.stringify({ kind: "open" }) })).json();
  });
  assert.equal(picked.path, selected);
  const rejected = await page.evaluate(async () => {
    try { await window.frameseqShell.openExternal("file:///should-not-open"); return false; } catch { return true; }
  });
  assert.equal(rejected, true);
  await page.evaluate(async () => {
    await window.frameseqShell.startShow({ slides: null, presenter: null });
    await window.frameseqShell.endShow();
  });
  console.log("✓ Real Electron preload, isolated frames, native dialogs, screen discovery and show controls");
  await page.evaluate(async () => {
    window.__guardCalled = false;
    await window.frameseqShell.onCloseRequested(async () => { window.__guardCalled = true; return false; });
    await window.frameseqShell.close();
  });
  await waitFor(() => page.evaluate(() => window.__guardCalled), "the close guard");
  assert.equal(page.isClosed(), false);
  await page.evaluate(async () => {
    await window.frameseqShell.onCloseRequested(async () => true);
    void window.frameseqShell.close();
  }).catch((error) => { if (!/closed|destroyed|Target/i.test(error.message)) throw error; });
  assert.equal(await Promise.race([stopped, delay(10000).then(() => "timeout")]), 0, output);
  console.log("✓ Rejecting a close keeps the window open; accepting it shuts down the service cleanly");
} finally {
  if (browser?.connected) await browser.disconnect();
  if (child && child.exitCode === null) { child.kill(); await stopped; }
  if (dirname(workspace) !== resolve(tmpdir()) || !workspace.startsWith(join(resolve(tmpdir()), "frameseq-harmony-shell-"))) throw new Error("Test cleanup is outside its temporary directory.");
  await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
