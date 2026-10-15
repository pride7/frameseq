#!/usr/bin/env node

// Templates of one's own: any presentation, masters and theme included, kept in a folder to start
// new ones from. FrameSeq Studio saves them, lists them beside its own, and makes presentations
// from them; `frameseq new --template` finds them too.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";
import {
  createFromTemplate,
  findUserTemplate,
  localFiles,
  retitle,
  saveTemplate,
  templateDirectory,
  templateNameProblem,
  userTemplates,
} from "./user-templates.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const root = resolve(packageRoot, "tmp", "user-template-test");
const templates = resolve(root, "templates");
const work = resolve(root, "work");
const screenshots = process.env.FRAMESEQ_TEST_SCREENSHOTS;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function waitFor(check, message, timeout = 20_000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`Timed out: ${message}`);
    await delay(100);
  }
}

await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
await mkdir(work, { recursive: true });
const environment = { ...process.env, FRAMESEQ_TEMPLATES: templates };

// ── Where templates are kept, and what a template's name may be ───────────────────────────────
assert.equal(templateDirectory(environment), templates);
assert.match(templateDirectory({}), /FrameSeq[\\/]Templates$/);
assert.equal(templateNameProblem("组会"), undefined);
assert.equal(templateNameProblem("Lab talk (2026)"), undefined);
assert.equal(templateNameProblem("a/b"), "characters");
assert.equal(templateNameProblem(" padded"), "edges");
assert.equal(templateNameProblem("con"), "reserved");
assert.deepEqual(await userTemplates(templates), [], "a folder not made yet holds no templates");

// ── A new presentation takes its title from where it is made ────────────────────────────────────
const source = [
  "presentation({",
  '  title: "Group meeting",',
  '  author: "Ada",',
  "});",
  "",
  'master("cover").background("#0f172a");',
  'image(new URL("./images/logo.png", import.meta.url).href).position({ x: 1100, y: 40 }).width(120);',
  'placeholder("title").position({ x: 96, y: 260 }).width(1000).height(160).color("#ffffff");',
  "",
  "slide().cover();",
  'text("Group meeting").hero();',
  'text(\'Group meeting\').caption();',
  "",
  'slide("Progress");',
  'text("Group meeting notes stay as they are.");',
  "",
].join("\n");
const retitled = retitle(source, "Weekly sync");
assert.match(retitled, /title: "Weekly sync",/);
assert.match(retitled, /text\("Weekly sync"\)\.hero\(\);/);
assert.match(retitled, /text\('Weekly sync'\)\.caption\(\);/, "a literal keeps the quote it was written with");
assert.match(retitled, /text\("Group meeting notes stay as they are\."\);/, "only strings that are the title change");
assert.equal(retitle('presentation("Talk");\n', 'A "quoted" title'), 'presentation("A \\"quoted\\" title");\n');
assert.equal(retitle("presentation({ theme: \"paper\" });\n", "New"), 'presentation({ title: "New", theme: "paper" });\n');
assert.equal(retitle("poster({ title: 'Old' }).grid(3);\n", "New"), "poster({ title: 'New' }).grid(3);\n");

// ── Saving a presentation keeps the files it uses beside it ─────────────────────────────────────
const talk = resolve(work, "group-meeting.slides.ts");
await mkdir(resolve(work, "images"), { recursive: true });
await writeFile(resolve(work, "images", "logo.png"), png);
await writeFile(resolve(work, "notes.txt"), "not named by the slides");
await writeFile(talk, source, "utf8");
assert.deepEqual(localFiles(source, work, talk), ["images/logo.png"]);
const saved = await saveTemplate({ entry: talk, name: "Group meeting", directory: templates });
assert.equal(saved.path, join(templates, "Group meeting", "Group meeting.slides.ts"));
assert.deepEqual(saved.assets, ["images/logo.png"]);
assert.ok(existsSync(join(templates, "Group meeting", "images", "logo.png")));
assert.ok(!existsSync(join(templates, "Group meeting", "notes.txt")), "files the slides do not name stay behind");
assert.deepEqual(await saveTemplate({ entry: talk, name: "Group meeting", directory: templates }), {
  exists: true,
  path: join(templates, "Group meeting"),
});
await writeFile(resolve(work, "plain.slides.ts"), 'presentation("Plain");\n\nslide("One");\n', "utf8");
const plain = await saveTemplate({ entry: resolve(work, "plain.slides.ts"), name: "Plain", directory: templates });
assert.equal(plain.path, join(templates, "Plain.slides.ts"), "a presentation that names no files is kept as one file");
assert.deepEqual((await userTemplates(templates)).map((template) => template.name), ["Group meeting", "Plain"]);

// ── Making a presentation from it copies those files, never over one already there ─────────────
const made = resolve(work, "made", "weekly-sync.slides.ts");
await mkdir(dirname(made), { recursive: true });
const template = await findUserTemplate("group meeting", templates);
assert.equal(template?.name, "Group meeting", "a template is found whatever the case of its name");
assert.deepEqual(await createFromTemplate(template, made, "Weekly sync"), { copied: ["images/logo.png"] });
assert.match(await readFile(made, "utf8"), /title: "Weekly sync"[\s\S]*master\("cover"\)/);
await assert.rejects(createFromTemplate(template, made, "Again"), { code: "EEXIST" });

// ── frameseq new --template finds one's own templates by name ───────────────────────────────────
const cliMade = spawnSync(process.execPath, [cli, "new", "lab-update.slides.ts", "--template", "Group meeting"], {
  cwd: resolve(work, "made"),
  encoding: "utf8",
  env: environment,
});
assert.equal(cliMade.status, 0, cliMade.stderr);
assert.match(await readFile(resolve(work, "made", "lab-update.slides.ts"), "utf8"), /title: "lab update"/);
const unknown = spawnSync(process.execPath, [cli, "new", "x.slides.ts", "--template", "missing"], {
  cwd: resolve(work, "made"),
  encoding: "utf8",
  env: environment,
});
assert.notEqual(unknown.status, 0);
assert.match(unknown.stderr, /There is no template named "missing"[\s\S]*Your own, in [\s\S]*Group meeting\n {2}Plain/);

// ── FrameSeq Studio: save as a template, then start a new presentation from it ──────────────────
const studioFolder = resolve(work, "studio");
await mkdir(studioFolder, { recursive: true });
await writeFile(resolve(studioFolder, "talk.slides.ts"), [
  'presentation({ title: "Studio talk", theme: "paper" });',
  "",
  'master("content");',
  'text("{page}").position({ x: 1180, y: 670 }).caption();',
  "",
  'slide("Intro");',
  'text("Hello");',
  "",
].join("\n"), "utf8");
await rm(templates, { recursive: true, force: true });

const child = spawn(process.execPath, [cli, "studio", "talk.slides.ts", "--no-open"], {
  cwd: studioFolder,
  env: {
    ...environment,
    BROWSER: "none",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    FRAMESEQ_NO_DIALOGS: "1",
    FRAMESEQ_CONFIG_DIR: resolve(root, "config"),
  },
  windowsHide: true,
});
let log = "";
const studioUrl = await new Promise((resolveAddress, rejectAddress) => {
  const timer = setTimeout(() => rejectAddress(new Error(`The Studio did not start.\n${log}`)), 60_000);
  const listen = (chunk) => {
    log += chunk.toString();
    const match = log.match(/Studio:\s+(https?:\/\/\S+studio\.html)/);
    if (match) {
      clearTimeout(timer);
      resolveAddress(match[1]);
    }
  };
  child.stdout.on("data", listen);
  child.stderr.on("data", listen);
  child.on("close", (code) => rejectAddress(new Error(`The Studio exited with ${code}.\n${log}`)));
});

let browser;
try {
  browser = await puppeteer.launch(puppeteerLaunchOptions());
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("frameseq-studio-language", "en");
  });
  await page.goto(studioUrl, { waitUntil: "networkidle2" });
  await page.waitForFunction(
    () => document.querySelector("[data-slot='check-state']")?.textContent?.includes("Layout checked"),
    { timeout: 120_000 },
  );

  // File › Save as template… names it after the presentation's title.
  await page.click("[data-menu='file']");
  await page.click("[data-command='save-template']");
  await page.waitForSelector("dialog.studio-dialog input");
  assert.equal(await page.$eval("dialog.studio-dialog input", (input) => input.value), "Studio talk");
  await page.click("dialog.studio-dialog button.is-primary");
  await waitFor(() => existsSync(join(templates, "Studio talk.slides.ts")), "the template to be written");
  await waitFor(() => page.evaluate(() => [...document.querySelectorAll(".studio-toast")].some((toast) => toast.textContent.includes("Saved as the template"))), "the saved message");

  // The new-presentation dialog lists it among the person's own, with its real cover.
  await page.click("[data-menu='file']");
  await page.click("[data-command='new-presentation']");
  await page.waitForSelector(".studio-new-dialog .studio-template[data-template='user:Studio talk']");
  const headings = await page.$$eval(".studio-template-heading", (nodes) => nodes.map((node) => node.textContent));
  assert.deepEqual(headings, ["From FrameSeq", "My templates"]);
  assert.match(await page.$eval(".studio-template-folder code", (node) => node.textContent), /templates$/);
  const cover = page.frames().find((frame) => frame.url().includes("template-preview?file="));
  assert.ok(cover, "the template's cover is drawn from its file");
  await waitFor(() => cover.evaluate(() => document.documentElement.dataset.ready === "true").catch(() => false), "the cover to render");
  if (screenshots) await page.screenshot({ path: resolve(screenshots, "user-templates-dialog.png") });

  // A right click keeps a copy of one FrameSeq ships among the person's own.
  await page.click(".studio-template[data-template='paper']", { button: "right" });
  await page.waitForSelector(".studio-menu");
  await page.evaluate(() => [...document.querySelectorAll(".studio-menu button")].find((button) => button.textContent.includes("Keep a copy")).click());
  await page.waitForSelector("dialog.studio-dialog:not(.studio-new-dialog) input");
  assert.equal(await page.$eval("dialog.studio-dialog:not(.studio-new-dialog) input", (input) => input.value), "Paper");
  await page.click("dialog.studio-dialog:not(.studio-new-dialog) button.is-primary");
  await page.waitForSelector(".studio-template[data-template='user:Paper'] input:checked");
  assert.match(await readFile(join(templates, "Paper.slides.ts"), "utf8"), /theme: "paper"/);

  // Choosing the saved template makes a presentation from it, titled as the dialog says.
  await page.click(".studio-template[data-template='user:Studio talk']");
  await page.type(".studio-new-dialog input[name='title']", "Second talk");
  await page.evaluate((folder) => {
    const input = document.querySelector(".studio-new-dialog input[name='folder']");
    input.value = folder;
    input.dispatchEvent(new Event("input"));
  }, studioFolder);
  await page.click(".studio-new-dialog button[type='submit']");
  const second = resolve(studioFolder, "second-talk.slides.ts");
  await waitFor(() => existsSync(second), "the presentation to be made from the template");
  const text = await readFile(second, "utf8");
  assert.match(text, /presentation\(\{ title: "Second talk", theme: "paper" \}\);/);
  assert.match(text, /master\("content"\);/, "the template's master comes with it");

  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  child.kill();
}

console.log("User template test passed.");
