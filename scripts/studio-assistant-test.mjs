#!/usr/bin/env node

// FrameSeq Studio's assistant, with a stand-in for Claude Code on the PATH that answers in
// Claude Code's stream-json, edits the deck, and records what it was given: the panel, the
// request with its context and attached files, the conversation carried on and started over,
// holding the editor while the agent works, Stop, and the MCP server handed to the agent.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
// The deck outside the checkout, as a presentation is, and the stand-in and its record outside
// the deck's folder: Tailwind scans that folder, and reloads the page when another file there changes.
const scratch = await mkdtemp(join(tmpdir(), "frameseq-assistant-"));
const workspace = resolve(scratch, "deck");
const bin = resolve(scratch, "bin");
const deck = resolve(workspace, "talk.slides.ts");
const record = resolve(scratch, "agent-calls.jsonl");

async function waitFor(check, message, timeout = 30_000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`Timed out: ${message}`);
    await delay(100);
  }
}

// The stand-in agent: Claude Code's flags, its stream-json events, and a real edit of the deck.
const fakeAgent = `import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("9.9.9 (Claude Code)");
  process.exit(0);
}
let prompt = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) prompt += chunk;
const mcp = JSON.parse(readFileSync(args[args.indexOf("--mcp-config") + 1], "utf8"));
appendFileSync(process.env.FAKE_AGENT_RECORD, JSON.stringify({ args, prompt, mcp, cwd: process.cwd() }) + "\\n");
const session = args.includes("--resume") ? args[args.indexOf("--resume") + 1] : "fake-session-" + Date.now();
const out = (event) => process.stdout.write(JSON.stringify(event) + "\\n");
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
out({ type: "system", subtype: "init", session_id: session });
out({ type: "rate_limit_event", rate_limit_info: { status: "allowed", unifiedWindows: { five_hour: { utilization: 0.21, resetsAt: 1792059600 }, seven_day: { utilization: 0.06, resetsAt: 1792645200 } } } });
if (prompt.includes("slowly")) await wait(60_000);
out({ type: "stream_event", api_message_id: "m1", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Changing " } } });
out({ type: "stream_event", api_message_id: "m1", event: { type: "content_block_delta", delta: { type: "text_delta", text: "the **title**." } } });
const deck = join(process.cwd(), "talk.slides.ts");
out({ type: "assistant", message: { id: "m1", content: [{ type: "text", text: "Changing the **title**." }, { type: "tool_use", id: "t1", name: "Edit", input: { file_path: deck } }] } });
await wait(1500);
writeFileSync(deck, readFileSync(deck, "utf8").replace(/text\\("[^"]*"\\)\\.hero/, 'text("Title ' + Date.now() + '").hero'));
out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] } });
out({ type: "assistant", message: { id: "m2", content: [{ type: "text", text: "Done." }] } });
out({ type: "result", subtype: "success", is_error: false, session_id: session, duration_ms: 2100, permission_denials: [] });
`;

await mkdir(bin, { recursive: true });
await mkdir(workspace, { recursive: true });
// Claude Code's own settings, whose model and effort the panel offers as the defaults.
const claudeHome = resolve(scratch, "claude");
await mkdir(claudeHome, { recursive: true });
await writeFile(join(claudeHome, "settings.json"), JSON.stringify({ model: "sonnet", effortLevel: "high" }), "utf8");
await writeFile(deck, 'presentation("Assistant");\n\nslide({ name: "Cover" }).cover();\ntext("Old title").hero();\n\nslide("Second");\ntext("More");\n', "utf8");
await writeFile(join(bin, "fake-claude.mjs"), fakeAgent, "utf8");
if (process.platform === "win32") {
  // An npm-style shim, which the Studio starts through the script it names rather than cmd.exe.
  await writeFile(join(bin, "claude.cmd"), '@ECHO off\r\nnode "%dp0%\\fake-claude.mjs" %*\r\n', "utf8");
} else {
  await writeFile(join(bin, "claude"), `#!/bin/sh\nexec "${process.execPath}" "${join(bin, "fake-claude.mjs")}" "$@"\n`, "utf8");
  await chmod(join(bin, "claude"), 0o755);
}

const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
const environment = {
  ...process.env,
  [pathKey]: `${bin}${delimiter}${process.env[pathKey] ?? ""}`,
  FRAMESEQ_CONFIG_DIR: resolve(workspace, "config"),
  FAKE_AGENT_RECORD: record,
  CLAUDE_CONFIG_DIR: claudeHome,
  FORCE_COLOR: "0",
  NO_COLOR: "1",
};
const studio = spawn(process.execPath, [cli, "studio", deck, "--no-open"], { cwd: workspace, env: environment, windowsHide: true });
let output = "";
studio.stdout.on("data", (chunk) => { output += chunk; });
studio.stderr.on("data", (chunk) => { output += chunk; });
const address = await waitFor(() => output.match(/Studio:\s+(https?:\/\/\S+studio\.html)/)?.[1], "the Studio to start", 60_000);
const calls = async () => (await readFile(record, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));

let browser;
try {
  browser = await puppeteer.launch(puppeteerLaunchOptions());
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 900 });
  await page.evaluateOnNewDocument(() => localStorage.setItem("frameseq-studio-language", "en"));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(address, { waitUntil: "networkidle2" });
  await page.waitForSelector("[data-action='toggle-assistant']:not([hidden])");
  const text = () => page.evaluate(() => window.frameseqStudio.text);
  const locked = () => page.evaluate(() => window.frameseqStudio.view.state.readOnly);
  const users = () => page.$$eval(".studio-assistant-user p", (items) => items.map((item) => item.textContent));

  // The panel opens beside the preview and finds the agent on the PATH.
  assert.equal(await page.$eval(".studio-assistant", (panel) => getComputedStyle(panel).display), "none");
  await page.click("[data-action='toggle-assistant']");
  await page.waitForSelector(".studio-assistant-welcome");
  await waitFor(() => page.$(".studio-assistant-agent option[value='claude']"), "Claude Code in the agent list");
  assert.match(await page.$eval(".studio-assistant-agent option[value='claude']", (option) => option.textContent), /Claude Code 9\.9\.9/);
  await page.select(".studio-assistant-agent", "claude");
  assert.equal(await page.$$eval(".studio-assistant-example", (items) => items.length), 4);

  // Model, effort, and speed: Claude Code's own defaults first, and fast mode only with Opus.
  await waitFor(() => page.$("[data-setting='model'] option[value='opus']"), "the models to be offered");
  const options = (selector) => page.$$eval(`${selector} option`, (items) => items.map((item) => item.textContent));
  assert.deepEqual(await options("[data-setting='model']"), ["Default (sonnet)", "Fable", "Opus", "Sonnet", "Haiku"]);
  assert.deepEqual(await options("[data-setting='effort']"), ["Default (High)", "Low", "Medium", "High", "Extra high", "Max"]);
  const fastDisabled = () => page.$eval("[data-setting='fast']", (input) => input.disabled);
  assert.equal(await fastDisabled(), true, "the default model, Sonnet, has no fast mode");
  assert.equal(await page.$eval("[data-assistant='usage']", (button) => button.textContent), "Usage shows after a request");
  await page.select("[data-setting='model']", "opus");
  assert.equal(await fastDisabled(), false);
  await page.select("[data-setting='effort']", "max");
  await page.click("[data-setting='fast']");

  // A request carries the slide and the selected lines, and the edit reloads into the editor,
  // which takes no typing meanwhile.
  await page.evaluate(() => {
    const view = window.frameseqStudio.view;
    const line = view.state.doc.line(4);
    view.dispatch({ selection: { anchor: line.from, head: line.to } });
  });
  await page.click(".studio-assistant-composer textarea");
  await waitFor(async () => (await page.$eval(".studio-assistant-context span", (label) => label.textContent)).includes("1 selected line"), "the context to name the selection");
  await page.keyboard.type("Give the cover a new title");
  await page.keyboard.press("Enter");
  await waitFor(locked, "the editor to be held while the agent works", 10_000);
  assert.equal(await page.$eval("[data-slot='assistant-working']", (label) => label.hidden), false);
  await page.waitForSelector(".studio-assistant-done", { timeout: 30_000 });
  await waitFor(async () => /Title \d+/.test(await text()), "the edit to reload into the editor");
  assert.match(await readFile(deck, "utf8"), /text\("Title \d+"\)\.hero/);
  await waitFor(async () => !(await locked()), "the editor to take typing again");
  assert.deepEqual(await users(), ["Give the cover a new title"]);
  assert.equal(await page.$eval(".studio-assistant-tool", (row) => `${row.dataset.status} ${row.textContent}`), "done ✓Edit talk.slides.ts");
  assert.ok((await page.$$eval(".studio-assistant-message", (items) => items.map((item) => item.innerHTML))).includes("<p>Changing the <strong>title</strong>.</p>"));

  const [first] = await calls();
  assert.ok(first.args.includes("-p") && first.args.includes("stream-json"), "Claude Code runs without a terminal, in stream-json");
  assert.ok(first.args.includes("mcp__frameseq") && first.args.includes("Bash"), "FrameSeq's tools are allowed, and shell commands are not");
  assert.equal(first.args.includes("--resume"), false);
  assert.equal(resolve(first.cwd), workspace, "the agent works in the presentation's folder");
  assert.match(first.prompt, /FrameSeq Studio/, "the first request explains the task");
  assert.match(first.prompt, /slide 1, "Cover"/);
  assert.match(first.prompt, /selected lines 4-4/);
  assert.match(first.prompt, /Request:\nGive the cover a new title$/);
  const server = first.mcp.mcpServers.frameseq;
  assert.equal(server.args[1], "mcp");
  assert.equal(resolve(server.args[2]), deck);
  assert.equal(server.args[3], "--preview");
  assert.equal(server.args[4], new URL(address).origin, "the agent's FrameSeq tools render in the Studio's own server");
  const flag = (call, name) => call.args[call.args.indexOf(name) + 1];
  assert.equal(flag(first, "--model"), "opus");
  assert.equal(flag(first, "--effort"), "max");
  assert.deepEqual(JSON.parse(flag(first, "--settings")), { fastMode: true });
  // The limits Claude Code reports while it answers.
  await waitFor(async () => (await page.$eval("[data-assistant='usage']", (button) => button.textContent)) === "5 h 21% · 7 d 6%", "the usage to show");
  assert.match(await page.$eval("[data-assistant='usage']", (button) => button.title), /^5 h limit: 21% used, resets /);

  // The change is reviewed against the text before the request: the original line is shown,
  // and Reject all puts it back, in the editor and in the file.
  const reviewText = () => page.$eval("[data-slot='review']", (bar) => (bar.hidden ? "" : bar.querySelector("[data-slot='review-count']").textContent));
  await waitFor(async () => (await reviewText()) === "1 change by the assistant", "the change to be offered for review");
  assert.equal(await page.$eval(".studio-assistant-review", (bar) => bar.hidden), false, "the panel offers the review too");
  // A change within a line shows the text it replaced in the same line.
  assert.match(await page.$eval(".cm-content", (content) => content.textContent), /Old title/);
  await page.click("[data-action='review-reject']");
  await waitFor(async () => (await text()).includes('text("Old title").hero()'), "Reject all to restore the editor");
  await waitFor(async () => (await readFile(deck, "utf8")).includes('text("Old title").hero()'), "Reject all to restore the file");
  assert.equal(await reviewText(), "");
  assert.equal(await page.$eval(".studio-assistant-review", (bar) => bar.hidden), true);

  // A follow-up continues the conversation; a reload keeps it; a new one starts over.
  await page.click(".studio-assistant-composer textarea");
  await page.keyboard.type("A bit shorter");
  await page.keyboard.press("Enter");
  await waitFor(async () => (await page.$$(".studio-assistant-done")).length === 2, "the follow-up to finish");
  // One change accepted on its own ends the review and keeps it.
  await waitFor(async () => (await reviewText()) === "1 change by the assistant", "the follow-up's change to be offered");
  await page.click(".cm-review-button.is-accept");
  await waitFor(async () => (await reviewText()) === "", "accepting the only change to end the review");
  assert.match(await text(), /text\("Title \d+"\)\.hero\(\)/);
  const second = (await calls())[1];
  assert.equal(second.args[second.args.indexOf("--resume") + 1], (await page.evaluate(() => fetch("/__frameseq/studio/session").then((response) => response.json()).then((session) => fetch("/__frameseq/studio/assistant", { headers: { "X-FrameSeq-Studio": session.token } })).then((response) => response.json()))).conversation.session);
  assert.equal(second.prompt.includes("FrameSeq Studio"), false, "the task is explained once");
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForSelector(".studio-assistant-user");
  assert.deepEqual(await users(), ["Give the cover a new title", "A bit shorter"], "the panel stays open and keeps the conversation");
  await waitFor(async () => (await page.$eval("[data-setting='model']", (select) => select.value)) === "opus", "the chosen model to be remembered");
  assert.equal(await page.$eval("[data-setting='effort']", (select) => select.value), "max");
  assert.equal(await page.$eval("[data-setting='fast']", (input) => input.checked), true);
  assert.equal(await page.$eval("[data-assistant='usage']", (button) => button.textContent), "5 h 21% · 7 d 6%", "the last usage is remembered");
  await page.click("[data-assistant='new']");
  await page.waitForSelector(".studio-assistant-welcome");

  // Files attach by the button, by pasting, and by dropping them on the panel. Each goes to the
  // server at once and waits above the box until the request carries it or it is removed.
  const notes = resolve(scratch, "notes.md");
  const logo = resolve(scratch, "logo.png");
  await writeFile(notes, "# Quarterly notes\n\n- Revenue grew\n", "utf8");
  await writeFile(logo, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
  const attached = () => page.$$eval(".studio-assistant-files .studio-assistant-file:not(.is-sending) .studio-assistant-file-name", (items) => items.map((item) => item.textContent));
  // The files of a Studio whose process was ended, which had no chance to remove them, go when files are next attached.
  const leftBehind = join(tmpdir(), "frameseq-attachments-2147483646-test");
  await mkdir(join(leftBehind, "old"), { recursive: true });
  await (await page.$(".studio-assistant-composer input[type='file']")).uploadFile(notes, logo);
  await waitFor(async () => (await attached()).length === 2, "the chosen files to be attached");
  assert.equal(existsSync(leftBehind), false, "the files of a Studio that is gone are removed");
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(["picture"], "image.png", { type: "image/png" }));
    document.querySelector(".studio-assistant-composer textarea").dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(["a,b\n1,2\n"], "figures.csv", { type: "text/csv" }));
    document.querySelector(".studio-assistant").dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await waitFor(async () => (await attached()).length === 4, "the pasted and dropped files to be attached");
  const names = await attached();
  assert.deepEqual([names[0], names[1], names[3]], ["notes.md", "logo.png", "figures.csv"]);
  assert.match(names[2], /^pasted-\d{14}\.png$/, "a pasted picture gets a name of its own");
  await page.click(".studio-assistant-files .studio-assistant-file:last-child .studio-assistant-file-remove");
  assert.deepEqual(await attached(), names.slice(0, 3));

  await page.click(".studio-assistant-composer textarea");
  await page.keyboard.type("Start again");
  await page.keyboard.press("Enter");
  await waitFor(async () => (await calls()).length === 3, "the third request");
  const third = (await calls())[2];
  assert.equal(third.args.includes("--resume"), false, "a new conversation has no session to resume");
  await page.waitForSelector(".studio-assistant-done", { timeout: 30_000 });
  await waitFor(async () => (await reviewText()) === "1 change by the assistant", "the third request's change to be offered");
  // The request carried the files and left the box empty; the conversation shows their names.
  assert.equal(await page.$eval(".studio-assistant-files", (list) => list.hidden), true);
  assert.deepEqual(await page.$$eval(".studio-assistant-user", (bubbles) => [...bubbles.at(-1).querySelectorAll(".studio-assistant-sent-files .studio-assistant-file-name")].map((item) => item.textContent)), names.slice(0, 3));
  // A file is read where the Studio keeps it, outside the presentation's folder, which Claude Code is let into.
  assert.match(third.prompt, /The user attached these files/);
  const kept = third.prompt.match(/^- notes\.md: (.+)$/m)?.[1];
  assert.ok(kept, "the prompt names where the notes are");
  assert.equal(await readFile(kept, "utf8"), "# Quarterly notes\n\n- Revenue grew\n");
  const attachments = flag(third, "--add-dir");
  assert.equal(resolve(dirname(dirname(kept))), resolve(attachments));
  assert.ok(!resolve(kept).startsWith(workspace), "attached files stay out of the presentation's folder");
  // A picture is copied beside the presentation, where a slide can show it.
  assert.ok(third.prompt.includes('- logo.png: a picture, copied beside the presentation as ./images/logo.png. To show it on a slide, write image(new URL("./images/logo.png", import.meta.url).href, "what it shows").'));
  assert.ok((await readFile(join(workspace, "images", "logo.png"))).equals(await readFile(logo)));
  assert.match(third.prompt, new RegExp(`^- ${names[2].replace(".", "\\.")}: a picture, copied beside the presentation as \\./images/${names[2].replace(".", "\\.")}\\.`, "m"));
  assert.equal(third.prompt.includes("figures.csv"), false, "a removed file is not sent");
  assert.match(third.prompt, /Request:\nStart again$/);

  // Stop ends a request that takes too long, and the editor takes typing again.
  await waitFor(async () => !(await locked()), "the editor to be free before the slow request");
  await page.click(".studio-assistant-composer textarea");
  await page.keyboard.type("Do this slowly");
  await page.keyboard.press("Enter");
  await waitFor(locked, "the slow request to start");
  await waitFor(async () => (await calls()).length === 4, "the slow request to reach the agent");
  assert.equal(flag((await calls())[3], "--add-dir"), attachments, "files attached earlier in the conversation stay readable");
  await page.click(".studio-assistant-composer button[type='submit']");
  await waitFor(async () => (await page.$$eval(".studio-assistant-notice", (items) => items.map((item) => item.textContent))).includes("Stopped."), "Stop to end the request");
  await waitFor(async () => !(await locked()), "the editor to take typing after Stop");
  // The review waits while the agent works, and covers both requests since it began.
  await waitFor(async () => (await reviewText()) === "1 change by the assistant", "the unreviewed change to be offered again");
  const beforeAccept = await text();
  await page.click("[data-review='accept']");
  await waitFor(async () => (await reviewText()) === "", "Accept all in the panel to end the review");
  assert.equal(await text(), beforeAccept, "Accept all keeps the text");

  // A new conversation lets go of the files the last one was given.
  await page.click("[data-assistant='new']");
  await waitFor(() => !existsSync(attachments), "the attached files to go with their conversation");

  // An empty request is refused, as is one carrying a file the Studio does not keep; Ctrl+Alt+I folds the panel away.
  const refused = await page.evaluate(async () => {
    const session = await fetch("/__frameseq/studio/session").then((response) => response.json());
    const ask = (body) => fetch("/__frameseq/studio/assistant/send", { method: "POST", headers: { "Content-Type": "application/json", "X-FrameSeq-Studio": session.token }, body: JSON.stringify(body) }).then((response) => response.status);
    return [await ask({ agent: "claude", text: " " }), await ask({ agent: "claude", text: "Use this", attachments: ["gone"] })];
  });
  assert.deepEqual(refused, [400, 404]);
  await page.focus(".cm-content");
  await page.keyboard.down("Control");
  await page.keyboard.down("Alt");
  await page.keyboard.press("KeyI");
  await page.keyboard.up("Alt");
  await page.keyboard.up("Control");
  assert.equal(await page.$eval("#studio", (root) => root.classList.contains("is-assistant-open")), false);
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(output);
  throw error;
} finally {
  await browser?.close();
  studio.kill();
}
await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => undefined);

console.log("Studio assistant test passed: the panel and its agents, model, effort, fast mode, and usage, requests with their context and attached files, edits reloading while the editor waits, conversations carried on and started over, Stop, and the MCP server handed to the agent.");
