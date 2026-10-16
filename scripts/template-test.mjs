#!/usr/bin/env node

/**
 * Every template a new presentation can start from, and every layout a new slide can start as,
 * in both languages, passes the strict layout check as written. `frameseq new --template` writes
 * the template it names and refuses one it does not know, and the Studio offers both.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { presentationTemplates, starterDeck, templateDeck } from "./presentation-file.mjs";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";
import { slideLayoutSources } from "./slide-layouts.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const workspace = resolve(packageRoot, "tmp", "template-test");
const languages = ["en", "zh"];
/** Themes that place a slide's title and regions differently, for the layouts to be tried in. */
const layoutThemes = ["blank", "midnight", "paper", "beamer-madrid", "minimal-academic"];

function run(args, cwd) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("close", (code) => resolveRun({ code, output }));
  });
}

/** Check documents a few at a time, each in a folder of its own, since a check builds in its folder. */
async function checkAll(documents) {
  const queue = [...documents];
  const failures = [];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const folder = join(workspace, next.name);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, "deck.fsq"), next.text, "utf8");
      const result = await run(["check", "deck.fsq", "--strict"], folder);
      if (result.code !== 0) failures.push(`${next.name}:\n${result.output}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  assert.deepEqual(failures, [], failures.join("\n\n"));
}

await rm(workspace, { recursive: true, force: true });
await mkdir(workspace, { recursive: true });

// The blank template is the starter `frameseq new` has always written.
assert.equal(templateDeck("blank"), starterDeck());
assert.equal(templateDeck("blank", "Quarterly review", "zh"), starterDeck("Quarterly review", "zh"));
assert.throws(() => templateDeck("nope"), /Unknown template "nope"/);

// A title replaces the placeholder heading everywhere the template shows one.
for (const template of presentationTemplates) {
  for (const language of languages) {
    const text = templateDeck(template.id, "Spectral Methods", language);
    assert.match(text, /"Spectral Methods"/, `${template.id} in ${language} ignores its title`);
    assert.ok(template.names[language] && template.summaries[language], `${template.id} has no ${language} name`);
  }
}

// Each layout's placeholder is a string in its own lines, so the Studio can select it.
for (const language of languages) {
  const layouts = slideLayoutSources(language);
  assert.equal(new Set(layouts.map((layout) => layout.id)).size, layouts.length);
  for (const layout of layouts) {
    assert.ok(layout.source.includes(JSON.stringify(layout.select)), `${layout.id} cannot select its placeholder`);
  }
}

await checkAll([
  ...presentationTemplates.flatMap((template) => languages.map((language) => ({
    name: `template-${template.id}-${language}`,
    text: templateDeck(template.id, "", language),
  }))),
  ...layoutThemes.flatMap((theme) => languages.map((language) => ({
    name: `layouts-${theme}-${language}`,
    text: `presentation({ title: "Layouts", theme: ${JSON.stringify(theme)} });\n\n${slideLayoutSources(language)
      .map((layout) => layout.source)
      .join("\n")}`,
  }))),
]);

// `frameseq new` writes the named template, and refuses one it does not know without writing.
const cliFolder = join(workspace, "cli");
await mkdir(cliFolder, { recursive: true });
const made = await run(["new", "lecture.slides.ts", "--template", "beamer-madrid"], cliFolder);
assert.equal(made.code, 0, made.output);
assert.equal(await readFile(join(cliFolder, "lecture.slides.ts"), "utf8"), templateDeck("beamer-madrid"));
const refused = await run(["new", "other.slides.ts", "--template", "nope"], cliFolder);
assert.notEqual(refused.code, 0);
assert.match(refused.output, /There is no template named "nope"[\s\S]*poster/);
assert.equal(existsSync(join(cliFolder, "other.slides.ts")), false);

// In the Studio: the rail's + and Slide › New slide insert a layout after the current slide, and
// the new-presentation dialog shows each template's real cover and writes the chosen one.
const studioHome = join(workspace, "studio");
await mkdir(studioHome, { recursive: true });
await writeFile(join(studioHome, "talk.slides.ts"), templateDeck("blank", "Talk"), "utf8");
const studio = spawn(process.execPath, [cli, "studio", "talk.slides.ts", "--no-open"], {
  cwd: studioHome,
  env: {
    ...process.env,
    FRAMESEQ_CONFIG_DIR: join(workspace, "config"),
    FRAMESEQ_NO_DIALOGS: "1",
    BROWSER: "none",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
  },
  windowsHide: true,
});
const exited = new Promise((resolveExit) => studio.on("close", resolveExit));
let browser;
try {
  const address = await new Promise((resolveAddress, rejectAddress) => {
    let output = "";
    const timer = setTimeout(() => rejectAddress(new Error(`The Studio did not start.\n${output}`)), 60_000);
    const read = (chunk) => {
      output += chunk;
      const match = output.match(/Studio:\s+(https?:\/\/\S+studio\.html)/);
      if (match) {
        clearTimeout(timer);
        resolveAddress(match[1]);
      }
    };
    studio.stdout.on("data", read);
    studio.stderr.on("data", read);
  });
  const origin = new URL(address).origin;
  const { token } = await (await fetch(`${origin}/__frameseq/studio/session`)).json();
  const refusedTemplate = await fetch(`${origin}/__frameseq/studio/files/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-FrameSeq-Studio": token },
    body: JSON.stringify({ title: "Odd", folder: studioHome, template: "nope" }),
  });
  assert.equal(refusedTemplate.status, 400);
  assert.equal(existsSync(join(studioHome, "odd.fsq")), false);

  browser = await puppeteer.launch(puppeteerLaunchOptions());
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950 });
  await page.evaluateOnNewDocument(() => localStorage.setItem("frameseq-studio-language", "en"));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(address, { waitUntil: "networkidle2" });
  const editorText = () => page.evaluate(() => window.frameseqStudio?.text ?? "");
  const selected = () => page.evaluate(() => {
    const { view } = window.frameseqStudio;
    const { from, to } = view.state.selection.main;
    return view.state.sliceDoc(from, to);
  });
  await page.waitForFunction(() => window.frameseqStudio?.text?.includes('presentation("Talk")'), { timeout: 60_000 });

  await page.click("[data-action='new-slide']");
  await page.waitForSelector(".studio-layouts .studio-layout");
  assert.deepEqual(
    await page.$$eval(".studio-layout", (buttons) => buttons.map((button) => button.dataset.layout)),
    slideLayoutSources().map((layout) => layout.id),
  );
  await page.click(".studio-layout[data-layout='two-columns']");
  await page.waitForFunction(() => window.frameseqStudio.text.includes('slide("New slide").split("50:50");'));
  assert.equal(await page.$(".studio-layouts"), null, "the picker closes once a layout is chosen");
  assert.equal(await selected(), "New slide", "the new slide's title is selected");

  await page.click("[data-menu='slide']");
  await page.click("[data-command='new-slide']");
  await page.waitForSelector("[data-command='new-slide-closing']");
  await page.click("[data-command='new-slide-closing']");
  await page.waitForFunction(() => window.frameseqStudio.text.includes('slide({ name: "Close" }).center();'));
  assert.equal(await selected(), "End on the one sentence you want remembered.");
  assert.equal((await editorText()).match(/slide\(/g).length, 4, "each layout adds one slide");

  await page.click("[data-menu='file']");
  await page.click("[data-command='new-presentation']");
  await page.waitForSelector("dialog.studio-new-dialog[open] .studio-template");
  assert.deepEqual(
    await page.$$eval(".studio-template", (options) => options.map((option) => option.dataset.template)),
    presentationTemplates.map((template) => template.id),
  );
  assert.equal(await page.$eval(".studio-template input:checked", (input) => input.value), "blank");
  // Each cover is the template itself, rendered: the paper one shows its own title page.
  await page.waitForFunction(() => {
    const frame = document.querySelector(".studio-template[data-template='paper'] iframe");
    return frame?.contentDocument?.querySelector(".frameseq-slide-frame")?.textContent?.includes("A story told in a few quiet pages");
  }, { timeout: 60_000 }).catch(async (error) => {
    const state = await page.evaluate(() => {
      const frame = document.querySelector(".studio-template[data-template='paper'] iframe");
      const inner = frame?.contentDocument;
      return { src: frame?.src, ready: inner?.readyState, body: inner?.body?.innerHTML.slice(0, 300) };
    });
    throw new Error(`The paper template's cover did not render: ${JSON.stringify(state)}\n${errors.join("\n")}`, { cause: error });
  });
  await page.click(".studio-template[data-template='paper']");
  assert.equal(
    await page.$eval(".studio-template-summary", (summary) => summary.textContent),
    presentationTemplates.find((template) => template.id === "paper").summaries.en,
  );
  await page.type("dialog.studio-new-dialog input[name='title']", "Field notes");
  await page.click("dialog.studio-new-dialog input[name='folder']", { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type("dialog.studio-new-dialog input[name='folder']", studioHome);
  await page.click("dialog.studio-new-dialog .is-primary");
  const notes = join(studioHome, "field-notes.fsq");
  await page.waitForFunction(() => window.frameseqStudio?.text?.includes('theme: "paper"'), { timeout: 60_000 });
  assert.equal(await readFile(notes, "utf8"), templateDeck("paper", "Field notes", "en"));
  assert.equal(await page.evaluate(() => localStorage.getItem("frameseq-studio-template")), "paper", "the next dialog starts on it");
  assert.deepEqual(errors, [], "no page errors");
} finally {
  await browser?.close();
  studio.kill();
  await exited;
}

await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
console.log(`Template test passed: ${presentationTemplates.length} templates and ${slideLayoutSources().length} slide layouts, in English and Chinese.`);
