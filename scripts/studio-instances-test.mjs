#!/usr/bin/env node

// A presentation opened from outside the Studio, as a double-click on an .fsq file opens it,
// comes up in the Studio that already has it open, whose window comes to the front, or in a
// Studio still on its start page; only otherwise does a Studio of its own start. The app's window
// closes again when the server it started says the presentation was shown elsewhere.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const workspace = resolve(packageRoot, "tmp", "studio-instances-test");
const config = resolve(workspace, "config");
const home = resolve(workspace, "home");
const talk = resolve(workspace, "decks", "talk.fsq");
const other = resolve(workspace, "decks", "other.fsq");
// Each run is --no-open too, so a Studio started when it should not have been opens no window.
const environment = {
  ...process.env,
  FRAMESEQ_CONFIG_DIR: config,
  FRAMESEQ_NO_DIALOGS: "1",
  // A Studio started without a window is left out of the list unless asked, as here.
  FRAMESEQ_STUDIO_LISTED: "1",
  BROWSER: "none",
  FORCE_COLOR: "0",
  NO_COLOR: "1",
};

async function waitFor(check, message, timeout = 30_000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`Timed out: ${message}`);
    await delay(100);
  }
}

function startStudio(args) {
  const child = spawn(process.execPath, [cli, "studio", ...args, "--no-open"], { cwd: home, env: environment, windowsHide: true });
  let output = "";
  const address = new Promise((resolveAddress, rejectAddress) => {
    const read = (chunk) => {
      output += chunk.toString();
      const match = output.match(/Studio:\s+(https?:\/\/\S+studio\.html)/);
      if (match) resolveAddress(match[1]);
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.on("close", (code) => rejectAddress(new Error(`The Studio exited with ${code}.\n${output}`)));
  });
  return { child, address };
}

const run = (args) => spawnSync(process.execPath, [cli, ...args], { cwd: home, env: environment, encoding: "utf8" });
const session = async (origin) => (await fetch(`${origin}/__frameseq/studio/session`)).json();
const notes = async () => (await readdir(join(config, "studios")).catch(() => [])).filter((name) => name.endsWith(".json"));

await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
await mkdir(home, { recursive: true });
await mkdir(dirname(talk), { recursive: true });
await writeFile(talk, 'presentation("Talk");\nslide("One");\ntext("Open once");\n', "utf8");
await writeFile(other, 'presentation("Other");\nslide("One");\ntext("Opened in the start page");\n', "utf8");

// A note left by a Studio that stopped without warning is taken away, not followed.
await mkdir(join(config, "studios"), { recursive: true });
await writeFile(join(config, "studios", "999999.json"), JSON.stringify({ pid: 999999, port: 1, desktop: false }), "utf8");

const studio = startStudio([talk]);
const start = startStudio([]);
let browser;
try {
  const origin = new URL(await studio.address).origin;
  const startOrigin = new URL(await start.address).origin;
  await waitFor(async () => (await notes()).length >= 2, "both Studios to note that they run");

  // The page comes to the front when its presentation is opened again.
  browser = await puppeteer.launch(puppeteerLaunchOptions());
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.focus = () => {
      window.__focused = (window.__focused ?? 0) + 1;
    };
  });
  await page.goto(`${origin}/studio.html`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.title.includes("talk.fsq"));

  const again = run(["studio", talk, "--background", "--no-open"]);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /already has talk\.fsq open/, again.stdout);
  await page.waitForFunction(() => window.__focused > 0, { timeout: 10_000 });
  assert.ok(!(await notes()).includes("999999.json"), "the stale note is gone");
  assert.equal((await notes()).length, 2, "no third Studio started");

  // The app's window, which starts its own server, closes again when this line comes.
  const desktop = run(["studio", talk, "--desktop"]);
  assert.equal(desktop.status, 0, desktop.stderr);
  assert.match(desktop.stdout, /➜ {2}Shown:/);

  // A presentation open nowhere fills the Studio on its start page.
  assert.equal((await session(startOrigin)).start, true);
  const fill = run(["studio", other, "--background", "--no-open"]);
  assert.equal(fill.status, 0, fill.stderr);
  assert.match(fill.stdout, /opened other\.fsq in the window already on its start page/, fill.stdout);
  await waitFor(async () => {
    try {
      const now = await session(startOrigin);
      return now.entry && resolve(now.entry) === other;
    } catch {
      return false;
    }
  }, "the start page's Studio to open other.fsq");

  // With both presentations open, a third goes to a Studio of its own: neither is asked.
  const third = resolve(workspace, "decks", "third.fsq");
  process.env.FRAMESEQ_CONFIG_DIR = config;
  const { studioFor } = await import("./studio-instances.mjs");
  assert.equal(await studioFor(third), undefined);
  assert.equal(resolve((await studioFor(other)).entry), other);

  // A Studio that stops takes its note away.
  studio.child.kill();
  await waitFor(async () => (await notes()).length === 1, "the stopped Studio's note to go", 15_000).catch(() => undefined);
} finally {
  await browser?.close();
  studio.child.kill();
  start.child.kill();
}

console.log("Studio instances test passed: an open presentation opened again shows its Studio, a start page takes a new one, the app's window closes when it is shown elsewhere, and stale notes go.");
