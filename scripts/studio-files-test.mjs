#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { presentationFileName, starterDeck } from "./presentation-file.mjs";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const workspace = resolve(packageRoot, "tmp", "studio-files-test");
const home = resolve(workspace, "home");
const config = resolve(workspace, "config");
const decks = resolve(workspace, "decks");
const templates = resolve(workspace, "templates");
const existing = resolve(decks, "existing.slides.ts");
const existingSource = 'presentation("Existing");\n\nslide("One");\ntext("Already here");\n';
// No native dialog may open during a test, so every path is typed, as on a computer without one.
const environment = {
  ...process.env,
  FRAMESEQ_CONFIG_DIR: config,
  FRAMESEQ_TEMPLATES: templates,
  FRAMESEQ_NO_DIALOGS: "1",
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

function startStudio(args, extra = {}) {
  const child = spawn(process.execPath, [cli, "studio", ...args, "--no-open"], {
    cwd: home,
    env: { ...environment, ...extra },
    windowsHide: true,
  });
  let output = "";
  const exited = new Promise((resolveExit) => child.on("close", resolveExit));
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
  return { child, address, exited, log: () => output };
}

async function api(origin, path, { method = "GET", body, token } = {}) {
  const response = await fetch(`${origin}/__frameseq/studio/${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { "X-FrameSeq-Studio": token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
await mkdir(home, { recursive: true });
await mkdir(decks, { recursive: true });
await writeFile(existing, existingSource, "utf8");
// A file where the Studio starts and a template of one's own, each using a utility no other file uses.
await writeFile(resolve(home, "stray.ts"), 'text("Stray").style("bg-[#123457]");\n', "utf8");
await mkdir(templates, { recursive: true });
await writeFile(resolve(templates, "Mine.slides.ts"), 'presentation("Mine");\n\nslide("One");\ntext("Mine").style("bg-[#765432]");\n', "utf8");

// `frameseq new` still writes the starter it always has, now shared with the Studio.
spawnSync(process.execPath, [cli, "new", "plain.slides.ts"], { cwd: workspace, env: environment });
assert.equal(await readFile(resolve(workspace, "plain.slides.ts"), "utf8"), starterDeck());
assert.equal(presentationFileName("Quarterly review"), "quarterly-review.slides.ts");
assert.equal(presentationFileName("季度回顾 2026"), "季度回顾-2026.slides.ts");
assert.equal(presentationFileName("CON"), "con-slides.slides.ts");
assert.equal(presentationFileName("?!"), "presentation.slides.ts");

let studio = startStudio([]);
let browser;
try {
  const origin = new URL(await studio.address).origin;

  // Without a file, and with no slides.ts where it starts, the Studio opens on its start page.
  const session = (await api(origin, "session")).data;
  assert.equal(session.start, true);
  assert.equal(session.entry, null);
  assert.equal(session.dialogs, false, "FRAMESEQ_NO_DIALOGS must turn the native dialogs off");
  const token = session.token;
  assert.equal((await api(origin, "source", { token })).status, 409, "no document routes answer on the start page");
  assert.equal((await api(origin, "files/open", { method: "POST", token, body: { path: "existing.slides.ts" } })).status, 400);
  assert.equal((await api(origin, "files/open", { method: "POST", token, body: { path: resolve(decks, "notes.txt") } })).status, 400);
  assert.equal((await api(origin, "files/open", { method: "POST", token, body: { path: resolve(decks, "missing.slides.ts") } })).status, 404);
  assert.equal((await api(origin, "files/create", { method: "POST", token, body: { title: "x", folder: resolve(workspace, "nowhere") } })).status, 404);
  assert.equal((await api(origin, "files/create", { method: "POST", token: "wrong", body: { title: "x", folder: decks } })).status, 403);
  // The new-presentation dialog offers one's own templates on the start page too.
  const listed = await api(origin, "templates", { token });
  assert.equal(listed.status, 200, "the start page lists one's own templates");
  assert.deepEqual(listed.data.templates.map((template) => template.name), ["Mine"]);
  // Their covers take their utilities from the templates folder alone. The folder the Studio
  // started in may be a whole Documents folder, and scanning it kept the covers blank.
  const styles = await (await fetch(`${origin}/src/index.css?direct`)).text();
  assert.match(styles, /765432/, "the start page has the utilities one's own templates use");
  assert.doesNotMatch(styles, /123457/, "the start page does not scan the folder it started in");

  browser = await puppeteer.launch(puppeteerLaunchOptions());
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950 });
  // The Studio follows the browser's language; the assertions read English.
  await page.evaluateOnNewDocument(() => {
    if (!localStorage.getItem("frameseq-studio-language")) localStorage.setItem("frameseq-studio-language", "en");
  });

  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(await studio.address, { waitUntil: "networkidle2" });
  await page.waitForSelector(".studio-start");
  assert.equal(await page.title(), "FrameSeq Studio");
  assert.match(await page.$eval(".studio-start-recent", (list) => list.textContent), /Presentations you open appear here/);
  assert.match(await page.$eval(".studio-start-note", (note) => note.textContent), /terminal/);

  const editorText = () => page.evaluate(() => window.frameseqStudio?.text).catch(() => undefined);
  const fileName = () => page.$eval("[data-slot='file']", (name) => name.textContent).catch(() => undefined);
  const fill = async (selector, value) => {
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type(selector, value);
  };
  const openNewDialog = async (trigger) => {
    await trigger();
    await page.waitForSelector("dialog.studio-new-dialog[open]");
  };
  /** Wait for the page to reload into a document, and for its preview and rail to draw it. */
  const opened = async (name, contains) => {
    await waitFor(async () => (await fileName()) === name && (await editorText())?.includes(contains), `${name} to open`, 60_000);
    await page.waitForFunction(
      () => document.querySelector("[data-slot='check-state']")?.textContent?.includes("Layout checked"),
      { timeout: 120_000 },
    );
  };
  const typedOpen = async (path) => {
    await page.keyboard.down("Control");
    await page.keyboard.press("o");
    await page.keyboard.up("Control");
    await page.waitForSelector("dialog.studio-dialog[open] input");
    await fill("dialog.studio-dialog[open] input", path);
    await page.click("dialog.studio-dialog[open] .is-primary");
  };

  // A new presentation is named after its title, written into the chosen folder, and opened.
  await openNewDialog(() => page.click("[data-start='new']"));
  assert.equal(await page.$("[data-action='browse-folder']"), null, "Browse… needs a native dialog");
  // Every cover draws, one's own template among them.
  await page.waitForSelector(".studio-template[data-template='user:Mine']");
  await page.waitForFunction(() => {
    const covers = [...document.querySelectorAll(".studio-new-dialog .studio-template-cover")];
    return covers.length > 1 && covers.every((cover) => cover.classList.contains("is-ready"));
  }, { timeout: 30_000 });
  await page.type("dialog.studio-new-dialog input[name='title']", "Quarterly review");
  assert.equal(await page.$eval(".studio-new-file code", (code) => code.textContent), "quarterly-review.slides.ts");
  await fill("dialog.studio-new-dialog input[name='folder']", decks);
  await page.click("dialog.studio-new-dialog .is-primary");
  const quarterly = resolve(decks, "quarterly-review.slides.ts");
  await opened("quarterly-review.slides.ts", 'presentation("Quarterly review")');
  assert.equal(await readFile(quarterly, "utf8"), starterDeck("Quarterly review"));
  assert.deepEqual((await readdir(decks)).sort(), ["existing.slides.ts", "quarterly-review.slides.ts"], "only the deck is written");

  // The same title again names a file that exists, which is reported, never overwritten.
  await openNewDialog(() => page.click("[data-action='file-menu']").then(() => page.waitForSelector(".studio-menu"))
    .then(() => page.evaluate(() => [...document.querySelectorAll(".studio-menu-item")].find((item) => item.textContent.includes("New presentation")).click())));
  await page.type("dialog.studio-new-dialog input[name='title']", "Quarterly review");
  await fill("dialog.studio-new-dialog input[name='folder']", decks);
  await page.click("dialog.studio-new-dialog .is-primary");
  await page.waitForFunction(() => document.querySelector(".studio-dialog-problem")?.textContent?.includes("already exists"));
  assert.ok(await page.$(".studio-dialog-problem .studio-link-button"), "an existing file can be opened instead");
  await page.click("dialog.studio-new-dialog .studio-button:not(.is-primary)");
  assert.equal(await readFile(quarterly, "utf8"), starterDeck("Quarterly review"));

  // Unsaved edits are not dropped silently: cancelling keeps the document, saving writes it.
  // File › Auto-save, which the menu shows checked while it is on.
  await page.click("[data-menu='file']");
  await page.waitForSelector("[data-command='autosave'][aria-checked='true']");
  await page.click("[data-command='autosave']");
  await page.evaluate(() => {
    const { view } = window.frameseqStudio;
    view.dispatch({ changes: { from: view.state.doc.length, insert: '\nslide("Added");\n' } });
  });
  await typedOpen(existing);
  await page.waitForSelector("dialog.studio-dialog[open] button[value='save']");
  await page.click("dialog.studio-dialog[open] .studio-button:not([value])");
  await delay(500);
  assert.equal(await fileName(), "quarterly-review.slides.ts", "cancelling keeps the document open");
  assert.equal(await readFile(quarterly, "utf8"), starterDeck("Quarterly review"));
  await typedOpen(existing);
  await page.waitForSelector("dialog.studio-dialog[open] button[value='save']");
  await page.click("dialog.studio-dialog[open] button[value='save']");
  await opened("existing.slides.ts", 'text("Already here")');
  assert.match(await readFile(quarterly, "utf8"), /slide\("Added"\);/, "Save writes the edits before switching");
  await page.click("[data-menu='file']");
  await page.waitForSelector("[data-command='autosave'][aria-checked='false']");
  await page.click("[data-command='autosave']");

  // A presentation opened from the Studio works from its own folder, so exports land beside it.
  const current = (await api(origin, "session")).data;
  assert.equal(current.entry, existing);
  const exported = (await api(origin, "export", { method: "POST", token: current.token, body: { format: "html-single" } })).data;
  assert.equal(exported.ok, true, exported.log);
  assert.equal(exported.path, resolve(decks, "dist", "index.html"));
  assert.ok(existsSync(exported.path));

  // The file menu lists the other recent presentations and opens them.
  await page.click("[data-action='file-menu']");
  await page.waitForSelector(".studio-menu");
  const labels = await page.$$eval(".studio-menu-label", (items) => items.map((item) => item.textContent));
  assert.ok(labels.includes("quarterly-review.slides.ts"), `recent presentations are listed: ${labels}`);
  assert.ok(!labels.includes("existing.slides.ts"), "the open presentation is not listed again");
  await page.evaluate(() => [...document.querySelectorAll(".studio-menu-item")].find((item) => item.textContent.includes("quarterly-review")).click());
  await opened("quarterly-review.slides.ts", 'presentation("Quarterly review")');
  assert.deepEqual(errors, [], "no page errors");
  await browser.close();
  browser = undefined;
} finally {
  await browser?.close();
  studio.child.kill();
  await studio.exited;
}

// The start page remembers both, newest first, and can forget one.
studio = startStudio([]);
try {
  const origin = new URL(await studio.address).origin;
  browser = await puppeteer.launch(puppeteerLaunchOptions());
  const page = await browser.newPage();
  await page.goto(await studio.address, { waitUntil: "networkidle2" });
  await page.waitForSelector(".studio-start-recent-item");
  const recent = () => page.$$eval(".studio-start-recent-item", (items) => items.map((item) => item.dataset.path));
  assert.deepEqual(await recent(), [resolve(decks, "quarterly-review.slides.ts"), existing]);
  await page.hover(".studio-start-recent-row:last-child");
  await page.click(".studio-start-recent-row:last-child .studio-icon-button");
  await waitFor(async () => (await recent()).length === 1, "a presentation to be forgotten");
  const settings = JSON.parse(await readFile(join(config, "studio.json"), "utf8"));
  assert.deepEqual(settings.recent.map((item) => item.path), [resolve(decks, "quarterly-review.slides.ts")]);
  assert.equal(settings.folder, decks);
  assert.equal((await api(origin, "files", { token: (await api(origin, "session")).data.token })).data.folder, decks);
  // The start page chooses the language too, before any presentation is open.
  await page.evaluate(() => localStorage.setItem("frameseq-studio-language", "en"));
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForSelector(".studio-start-recent h2");
  assert.equal(await page.$eval(".studio-start-recent h2", (heading) => heading.textContent), "Recent");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }),
    page.click("[data-language='zh']"),
  ]);
  await page.waitForSelector(".studio-start-recent h2");
  assert.equal(await page.$eval(".studio-start-recent h2", (heading) => heading.textContent), "最近");
  assert.equal(await page.$eval("[data-language='zh']", (button) => button.getAttribute("aria-pressed")), "true");
  await browser.close();
  browser = undefined;
} finally {
  await browser?.close();
  studio.child.kill();
  await studio.exited;
}

// A Studio started to quit on close stops once its last window has gone.
studio = startStudio([existing], { FRAMESEQ_STUDIO_QUIT_ON_CLOSE: "1" });
try {
  browser = await puppeteer.launch(puppeteerLaunchOptions());
  const page = await browser.newPage();
  await page.goto(await studio.address, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => window.frameseqStudio?.text?.includes("Already here"), { timeout: 60_000 });
  await page.close();
  const closedAt = Date.now();
  const code = await Promise.race([studio.exited, delay(45_000).then(() => "still running")]);
  assert.equal(code, 0, `the Studio must stop after its window closes:\n${studio.log()}`);
  assert.ok(Date.now() - closedAt > 5_000, "a reload must not stop it, so it waits a moment first");
  // Started without a window, as scripts and tests start it, it leaves the recent list alone.
  const settings = JSON.parse(await readFile(join(config, "studio.json"), "utf8"));
  assert.deepEqual(settings.recent.map((item) => item.path), [resolve(decks, "quarterly-review.slides.ts")]);
  await browser.close();
  browser = undefined;
} finally {
  await browser?.close();
  studio.child.kill();
}

// The shortcut runs this CLI's Studio in the background; FRAMESEQ_SHORTCUT_DIR keeps it here.
const shortcuts = resolve(workspace, "shortcuts");
const shortcutEnvironment = { ...environment, FRAMESEQ_SHORTCUT_DIR: shortcuts };
const added = spawnSync(process.execPath, [cli, "shortcut"], { cwd: workspace, env: shortcutEnvironment, encoding: "utf8" });
assert.equal(added.status, 0, added.stderr);
if (process.platform === "win32") {
  const link = join(shortcuts, "FrameSeq Studio.lnk");
  assert.ok(existsSync(link));
  const read = spawnSync("powershell.exe", ["-NoProfile", "-Command",
    `$l = (New-Object -ComObject WScript.Shell).CreateShortcut('${link.replaceAll("'", "''")}'); $l.TargetPath; $l.Arguments; $l.IconLocation`,
  ], { encoding: "utf8" });
  const [target, args, icon] = read.stdout.trim().split(/\r?\n/);
  assert.equal(target.toLowerCase(), process.execPath.toLowerCase());
  assert.equal(args, `"${cli}" studio --background`);
  assert.equal(icon.toLowerCase(), `${join(config, "FrameSeq.ico")},0`.toLowerCase());
  assert.ok((await stat(join(config, "FrameSeq.ico"))).size > 1000);
} else if (process.platform === "darwin") {
  const bundle = join(shortcuts, "FrameSeq Studio.app", "Contents");
  assert.match(await readFile(join(bundle, "Info.plist"), "utf8"), /<string>FrameSeq Studio<\/string>/);
  assert.match(await readFile(join(bundle, "MacOS", "FrameSeq Studio"), "utf8"), /studio --background/);
  assert.ok((await stat(join(bundle, "Resources", "FrameSeq.icns"))).size > 1000);
} else {
  const entry = await readFile(join(shortcuts, "frameseq-studio.desktop"), "utf8");
  assert.match(entry, /^Name=FrameSeq Studio$/m);
  assert.ok(entry.includes(`Exec="${process.execPath}" "${cli}" studio --background`), entry);
  assert.match(entry, /^Terminal=false$/m);
  assert.ok((await stat(join(config, "frameseq.png"))).size > 1000);
}
const removed = spawnSync(process.execPath, [cli, "shortcut", "--remove"], { cwd: workspace, env: shortcutEnvironment, encoding: "utf8" });
assert.equal(removed.status, 0, removed.stderr);
assert.deepEqual(await readdir(shortcuts), [], "--remove takes the shortcut away");

console.log("Studio files test passed: the start page, new and existing presentations, unsaved edits, recent presentations, the start page in Chinese, exports beside the deck, quitting on close, and shortcuts.");
