#!/usr/bin/env node

// Updates in FrameSeq Studio: how versions compare, where each kind of install looks for a newer
// one, how often the server asks, and what the page says about what it found.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";
import { compareVersions, createUpdates, updateSource } from "./studio-updates.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const workspace = resolve(packageRoot, "tmp", "studio-updates-test");
const config = resolve(workspace, "config");

async function waitFor(check, message, timeout = 20_000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`Timed out: ${message}`);
    await delay(100);
  }
}

await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
await mkdir(workspace, { recursive: true });

// ── Versions compare as Semantic Versioning orders them ─────────────────────────────────────
const older = (left, right) => assert.ok(compareVersions(left, right) < 0, `${left} comes before ${right}`);
older("0.38.0", "0.39.0");
older("0.39.0", "0.39.1");
older("0.99.9", "1.0.0");
older("1.0.0-rc.1", "1.0.0");
// A hyphen marks a pre-release, which comes before the version it leads to, whatever it is called.
older("1.2.3-ota2", "1.2.3");
older("1.2.3-beta.2", "1.2.3-beta.10");
older("1.2.3-alpha", "1.2.3-alpha.1");
older("1.2.3-alpha.1", "1.2.3-alpha.beta");
assert.equal(compareVersions("v1.2.3", "1.2.3"), 0);
assert.equal(compareVersions("1.2.3+build.7", "1.2.3"), 0, "build metadata does not order versions");
assert.throws(() => compareVersions("1.2", "1.2.0"));

// ── Each kind of install updates from its own place ─────────────────────────────────────────
const appRoot = resolve(workspace, "FrameSeq", "app");
await mkdir(appRoot, { recursive: true });
await writeFile(join(appRoot, "frameseq-bundle.json"), JSON.stringify({ platform: "win32", arch: "x64" }));
assert.deepEqual(updateSource(appRoot), { kind: "app", target: "win-x64", app: appRoot, updates: false });

const project = resolve(workspace, "project");
const local = resolve(project, "node_modules", "@pride7", "frameseq");
await mkdir(local, { recursive: true });
await writeFile(join(project, "package.json"), "{}");
assert.deepEqual(updateSource(local), { kind: "npm", command: "npm install @pride7/frameseq@latest" });

const global = resolve(workspace, "npm-global", "node_modules", "@pride7", "frameseq");
await mkdir(global, { recursive: true });
assert.deepEqual(updateSource(global), { kind: "npm", command: "npm install --global @pride7/frameseq@latest" });

assert.equal(updateSource(packageRoot), undefined, "a checkout of the repository has nothing to update from");

// ── The server asks at most once a day by itself, and whenever the person asks ──────────────
const release = (tag, assets) => ({
  tag_name: tag,
  html_url: `https://github.com/pride7/frameseq/releases/tag/${tag}`,
  assets: assets.map((name) => ({ name })),
});
let answer = release("v0.39.0", ["FrameSeq-Setup-0.39.0-win-x64.exe", "FrameSeq-0.39.0-mac-arm64.dmg"]);
const asked = [];
const fakeFetch = async (url, init) => {
  asked.push(url);
  assert.match(init.headers["User-Agent"], /^FrameSeq\//);
  if (answer instanceof Error) throw answer;
  return { ok: true, status: 200, json: async () => answer };
};
let clock = Date.UTC(2026, 9, 15);
const environment = { FRAMESEQ_CONFIG_DIR: config };
const app = createUpdates({ packageRoot: appRoot, current: "0.38.0", fetch: fakeFetch, now: () => clock, environment });

let status = await app.status();
assert.deepEqual(status, {
  source: "app",
  current: "0.38.0",
  automatic: true,
  locked: false,
  newer: true,
  latest: "0.39.0",
  url: "https://github.com/pride7/frameseq/releases/tag/v0.39.0",
  skipped: false,
});
assert.deepEqual(asked, ["https://api.github.com/repos/pride7/frameseq/releases/latest"]);

clock += 60 * 60 * 1000;
assert.equal((await app.status()).latest, "0.39.0", "the last check is remembered");
assert.equal(asked.length, 1, "a check an hour later asks nobody");

// A release whose downloads for this system are not attached yet has nothing to update to.
clock += 2 * 24 * 60 * 60 * 1000;
answer = release("v0.40.0", ["FrameSeq-0.40.0-mac-arm64.dmg"]);
status = await app.status();
assert.equal(asked.length, 2, "a day later the server asks again");
assert.equal(status.newer, false);
assert.equal(status.latest, undefined);

answer = release("v0.40.0", ["FrameSeq-Setup-0.40.0-win-x64.exe"]);
status = await app.status({ force: true });
assert.equal(asked.length, 3, "a check the person asks for always asks");
assert.equal(status.latest, "0.40.0");

await app.remember({ skip: "0.40.0" });
assert.equal((await app.status()).skipped, true, "a skipped version is not mentioned again");

// A failed daily check stays quiet; a failed check the person asked for says why.
clock += 2 * 24 * 60 * 60 * 1000;
answer = new Error("fetch failed");
status = await app.status();
assert.equal(status.error, undefined);
assert.equal(status.latest, "0.40.0", "the last version found still counts");
status = await app.status({ force: true });
assert.equal(status.error, "fetch failed");

// With the daily check off, only the person's own checks ask.
answer = release("v0.41.0", ["FrameSeq-Setup-0.41.0-win-x64.exe"]);
await app.remember({ automatic: false });
const before = asked.length;
status = await app.status();
assert.equal(status.automatic, false);
assert.equal(asked.length, before);
assert.equal((await app.status({ force: true })).latest, "0.41.0");
assert.equal(asked.length, before + 1);
assert.deepEqual(
  JSON.parse(await readFile(join(config, "updates.json"), "utf8")),
  { checked: clock, latest: { version: "0.41.0", url: "https://github.com/pride7/frameseq/releases/tag/v0.41.0" }, skipped: "0.40.0", automatic: false },
);
await app.remember({ automatic: true });

// A Studio started with --no-open, as scripts and tests start it, never asks by itself.
clock += 2 * 24 * 60 * 60 * 1000;
const quiet = createUpdates({ packageRoot: appRoot, current: "0.38.0", daily: false, fetch: fakeFetch, now: () => clock, environment });
const asking = asked.length;
assert.equal((await quiet.status()).latest, "0.41.0", "it still says what the last check found");
assert.equal(asked.length, asking);
await quiet.status({ force: true });
assert.equal(asked.length, asking + 1);

const locked = createUpdates({
  packageRoot: appRoot,
  current: "0.38.0",
  fetch: fakeFetch,
  now: () => clock,
  environment: { ...environment, FRAMESEQ_NO_UPDATE_CHECK: "1" },
});
status = await locked.status();
assert.equal(status.locked, true);
assert.equal(status.automatic, false, "FRAMESEQ_NO_UPDATE_CHECK keeps the daily check off");

// An npm install asks the registry, and says which command updates it.
const registry = [];
const npm = createUpdates({
  packageRoot: global,
  current: "0.38.0",
  fetch: async (url) => {
    registry.push(url);
    return { ok: true, status: 200, json: async () => ({ version: "0.38.1" }) };
  },
  now: () => clock,
  environment: { FRAMESEQ_CONFIG_DIR: resolve(workspace, "npm-config") },
});
status = await npm.status();
assert.deepEqual(registry, ["https://registry.npmjs.org/@pride7/frameseq/latest"]);
assert.equal(status.newer, true);
assert.equal(status.url, undefined);
assert.equal(status.command, "npm install --global @pride7/frameseq@latest");

const checkout = createUpdates({
  packageRoot,
  current: "0.38.0",
  fetch: () => assert.fail("a checkout asks nobody"),
  environment,
});
assert.deepEqual(await checkout.status({ force: true }), { current: "0.38.0", newer: false });

// ── The page says what the server found ─────────────────────────────────────────────────────
const deck = resolve(workspace, "talk.slides.ts");
await writeFile(deck, 'presentation({ title: "Updates" });\n\nslide("One");\ntext("Hello");\n', "utf8");
const child = spawn(process.execPath, [cli, "studio", "talk.slides.ts", "--no-open"], {
  cwd: workspace,
  env: { ...process.env, FRAMESEQ_CONFIG_DIR: config, BROWSER: "none", FORCE_COLOR: "0", NO_COLOR: "1", FRAMESEQ_NO_DIALOGS: "1" },
  windowsHide: true,
});
let output = "";
const studioUrl = await new Promise((resolveAddress, rejectAddress) => {
  const timer = setTimeout(() => rejectAddress(new Error(`The Studio did not start.\n${output}`)), 60_000);
  const listen = (chunk) => {
    output += chunk.toString();
    const match = output.match(/Studio:\s+(https?:\/\/\S+studio\.html)/);
    if (match) {
      clearTimeout(timer);
      resolveAddress(match[1]);
    }
  };
  child.stdout.on("data", listen);
  child.stderr.on("data", listen);
  child.on("close", (code) => rejectAddress(new Error(`The Studio exited with ${code}.\n${output}`)));
});

let browser;
try {
  browser = await puppeteer.launch(puppeteerLaunchOptions());
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.evaluateOnNewDocument(() => localStorage.setItem("frameseq-studio-language", "en"));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const helpCommands = async () => {
    await page.click("[data-menu='help']");
    await page.waitForSelector("[data-command='about']");
    const commands = await page.$$eval(".studio-menubar-menu [data-command]", (items) => items.map((item) => (
      `${item.getAttribute("aria-checked") === "true" ? "✓ " : ""}${item.dataset.command}`
    )));
    await page.keyboard.press("Escape");
    return commands;
  };

  // From a checkout, the server has nowhere to look, so Help offers no update commands.
  await page.goto(studioUrl, { waitUntil: "networkidle2" });
  await page.waitForSelector(".studio-topbar");
  assert.deepEqual(await helpCommands(), ["documentation", "language-tour", "shortcuts", "report-issue", "about"]);
  assert.equal(await page.$(".studio-toast"), null, "a checkout says nothing about updates");

  // The app's answers, as the server would give them.
  const app = { source: "app", current: "0.38.0", automatic: true, locked: false, skipped: false };
  let found = { ...app, newer: true, latest: "9.9.9", url: "https://github.com/pride7/frameseq/releases/tag/v9.9.9" };
  let onCheck = () => ({ ...app, automatic: found.automatic, newer: false, latest: "0.38.0" });
  const posted = [];
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (!request.url().includes("/__frameseq/studio/update")) {
      void request.continue();
      return;
    }
    let answer = found;
    if (request.method() === "POST") {
      const body = JSON.parse(request.postData() ?? "{}");
      posted.push(body);
      if (typeof body.automatic === "boolean") found = { ...found, automatic: body.automatic };
      if (body.check) found = onCheck();
      if (body.install) found = { ...found, ready: found.latest };
      answer = found;
      // The server starts again on the version installed, and answers as that version.
      if (body.restart) {
        answer = { ok: true, version: found.ready };
        found = { ...app, current: found.ready, newer: false, restarts: true };
      }
    } else if (found.installing) {
      // The server says it is installing once, and has installed it when asked again.
      found = { ...found, installing: false, ready: found.latest };
    }
    void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(answer) });
  });
  await page.evaluateOnNewDocument(() => {
    window.__opened = [];
    window.open = (url) => {
      window.__opened.push(String(url));
      return null;
    };
  });

  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForSelector(".studio-topbar");
  const notice = await page.waitForSelector(".studio-toast");
  assert.equal(await notice.$eval(".studio-toast-text", (text) => text.textContent), "FrameSeq 9.9.9 is available. This is 0.38.0.");
  assert.deepEqual(await notice.$$eval(".studio-toast-actions button", (buttons) => buttons.map((button) => button.textContent)), ["Skip this version", "Download"]);
  await notice.$eval(".studio-toast-actions .is-primary", (button) => button.click());
  assert.deepEqual(await page.evaluate(() => window.__opened), ["https://github.com/pride7/frameseq/releases/tag/v9.9.9"]);

  assert.deepEqual(await helpCommands(), [
    "documentation", "language-tour", "shortcuts", "check-updates", "✓ automatic-updates", "report-issue", "about",
  ]);

  // The notice shows once per version in a window, not on each reload.
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForSelector(".studio-topbar");
  await delay(500);
  assert.equal(await page.$(".studio-toast"), null);

  // Help › Check for updates asks now and says what it found.
  await page.click("[data-menu='help']");
  await page.click("[data-command='check-updates']");
  await waitFor(
    () => page.$$eval(".studio-toast-text", (texts) => texts.some((text) => text.textContent === "FrameSeq 0.38.0 is the latest version.")),
    "the Studio to say it is up to date",
  );
  assert.deepEqual(posted.at(-1), { check: true });

  // The daily check can be turned off from the same menu.
  await page.click("[data-menu='help']");
  await page.click("[data-command='automatic-updates']");
  await waitFor(() => posted.some((body) => body.automatic === false), "the setting to reach the server");
  assert.ok((await helpCommands()).includes("automatic-updates"), "the item stays, unticked");

  // A page that is reloading has nothing to say yet.
  const toastSays = (message) => page.$$eval(".studio-toast-text", (texts, wanted) => texts.some((text) => text.textContent === wanted), message)
    .catch(() => false);

  // The app installs a version it can take by itself, and says it starts next time.
  found = { ...app, newer: true, latest: "9.9.10", ota: true, installing: true };
  await page.reload({ waitUntil: "networkidle2" });
  await waitFor(() => toastSays("FrameSeq 9.9.10 is installed. It starts the next time FrameSeq Studio opens."), "the Studio to say the update is installed");

  // With automatic updates off, Help › Check for updates offers to install one.
  onCheck = () => ({ ...app, automatic: false, newer: true, latest: "9.9.11", ota: true });
  await page.click("[data-menu='help']");
  await page.click("[data-command='check-updates']");
  const dialog = await page.waitForSelector("dialog[open]");
  assert.equal(await dialog.$eval("h2", (heading) => heading.textContent), "FrameSeq 9.9.11 is available");
  assert.match(await dialog.$eval("p", (text) => text.textContent), /installs now and starts the next time FrameSeq Studio opens/);
  assert.deepEqual(await dialog.$$eval("button", (buttons) => buttons.map((button) => button.textContent)), ["Cancel", "Skip this version", "Update"]);
  await dialog.$eval(".studio-button.is-primary", (button) => button.click());
  await waitFor(() => toastSays("FrameSeq 9.9.11 is installed. It starts the next time FrameSeq Studio opens."), "the update to install");
  assert.deepEqual(posted.at(-1), { install: true });

  // The app's Studio starts again on the update, at once when the person asked for it; the page
  // reloads into the new server and says so.
  const restarts = () => posted.filter((body) => body.restart === true).length;
  onCheck = () => ({ ...app, automatic: false, newer: true, latest: "9.9.12", ota: true, restarts: true });
  await page.click("[data-menu='help']");
  await page.click("[data-command='check-updates']");
  const restartDialog = await page.waitForSelector("dialog[open]");
  assert.match(await restartDialog.$eval("p", (text) => text.textContent), /starts again on it once you are not busy/);
  await restartDialog.$eval(".studio-button.is-primary", (button) => button.click());
  await waitFor(() => restarts() === 1, "the Studio to start again on the update");
  await waitFor(() => toastSays("FrameSeq is updated to 9.9.12."), "the page to reload into the update and say so");

  // By itself, it waits until the person has left the Studio, then starts again.
  await page.evaluateOnNewDocument(() => {
    Document.prototype.hasFocus = () => !window.__away;
  });
  found = { ...app, newer: true, latest: "9.9.13", ota: true, ready: "9.9.13", restarts: true };
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForSelector(".studio-topbar");
  await delay(7000);
  assert.equal(restarts(), 1, "not while the person works in the Studio");
  await page.evaluate(() => {
    window.__away = true;
  });
  await waitFor(() => restarts() === 2, "the Studio to start again once the person is away");
  await waitFor(() => toastSays("FrameSeq is updated to 9.9.13."), "the page to say it was updated");

  assert.deepEqual(errors, []);
  console.log("Studio update checks passed.");
} finally {
  await browser?.close();
  child.kill();
}
