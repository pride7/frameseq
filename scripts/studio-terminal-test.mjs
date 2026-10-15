#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import WebSocket from "ws";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const workspace = resolve(packageRoot, "tmp", "studio-terminal-test");
const deck = resolve(workspace, "talk.slides.ts");

async function waitFor(check, message, timeout = 20_000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`Timed out: ${message}`);
    await delay(100);
  }
}

/** How a WebSocket handshake ends: the first message, or the HTTP status that refused it. */
function handshake(url, headers) {
  return new Promise((resolveResult) => {
    const socket = new WebSocket(url, { headers });
    socket.on("unexpected-response", (_request, response) => resolveResult({ status: response.statusCode }));
    socket.on("error", (error) => resolveResult({ error: error.message }));
    socket.on("message", (data) => {
      const message = JSON.parse(String(data));
      if (message.type === "ready") socket.send(JSON.stringify({ type: "kill" }));
      resolveResult({ message });
    });
  });
}

await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
await mkdir(workspace, { recursive: true });
await writeFile(deck, 'presentation({ title: "Terminal test" });\n\nslide("Intro");\ntext("Hello");\n', "utf8");

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

let browser;
let page;
try {
  const studioUrl = await address;
  const origin = new URL(studioUrl).origin;
  const socketUrl = `${origin.replace(/^http/, "ws")}/__frameseq/studio/terminal`;

  // A shell runs anything, so only the Studio's own page, holding the session's token, gets one.
  const session = await (await fetch(`${origin}/__frameseq/studio/session`)).json();
  assert.equal(session.terminal, true, "the computer running the Studio may open a terminal");
  assert.equal((await handshake(socketUrl, { Origin: origin })).status, 403, "a terminal without the token must be refused");
  assert.equal(
    (await handshake(`${socketUrl}?token=${session.token}`, { Origin: "https://example.com" })).status,
    403,
    "another site must not open a terminal",
  );
  const opened = await handshake(`${socketUrl}?token=${session.token}`, { Origin: origin });
  assert.ok(opened.message, `the Studio's own token opens a terminal: ${JSON.stringify(opened)}`);
  assert.equal(opened.message.type, "ready", `the terminal must start a shell: ${JSON.stringify(opened.message)}`);

  browser = await puppeteer.launch(puppeteerLaunchOptions());
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    if (!localStorage.getItem("frameseq-studio-language")) localStorage.setItem("frameseq-studio-language", "en");
  });
  await page.goto(studioUrl, { waitUntil: "networkidle2" });
  await page.waitForSelector(".cm-content");
  const terminalText = () => page.evaluate(() => window.frameseqStudio.terminal.text);
  const terminalState = () => page.evaluate(() => window.frameseqStudio.terminal.status);
  const collapsed = () => page.$eval("#studio", (studio) => studio.classList.contains("is-panel-collapsed"));
  const typeCommand = async (command) => {
    await page.keyboard.type(command, { delay: 5 });
    await page.keyboard.press("Enter");
  };
  // `o""k` prints as `ok` in PowerShell and in a POSIX shell, so the line typed never matches.
  const printed = (text, marker) => text.split("\n").some((line) => line.trim() === marker);

  // Ctrl+` opens the folded panel on the terminal and focuses a shell in the deck's folder.
  await page.focus(".cm-content");
  await page.keyboard.down("Control");
  await page.keyboard.press("Backquote");
  await page.keyboard.up("Control");
  await waitFor(async () => (await terminalState()) === "open", "Ctrl+` to start a shell", 30_000);
  assert.equal(await collapsed(), false, "Ctrl+` opens the panel");
  assert.equal(await page.$eval("[data-tab='terminal']", (tab) => tab.getAttribute("aria-selected")), "true");
  assert.ok(await page.evaluate(() => document.activeElement?.closest(".studio-terminal") !== null), "the terminal takes the focus");
  await delay(1500);
  await typeCommand('echo terminal-o""k');
  await waitFor(async () => printed(await terminalText(), "terminal-ok"), "the shell to run a command", 30_000);
  await typeCommand("echo made > made-by-terminal.txt");
  await waitFor(() => existsSync(resolve(workspace, "made-by-terminal.txt")), "the shell to work in the deck's folder");

  // Ctrl+C copies a selection instead of interrupting, and Ctrl+V pastes it into the shell.
  await browser.defaultBrowserContext().overridePermissions(origin, ["clipboard-read", "clipboard-write"]);
  const word = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".studio-terminal .xterm-rows > div")]
      .find((line) => line.textContent?.trim() === "terminal-ok");
    const box = row?.firstElementChild?.getBoundingClientRect();
    return box && { x: box.x + 10, y: box.y + box.height / 2 };
  });
  assert.ok(word, "the printed line must be on screen");
  await page.mouse.click(word.x, word.y, { clickCount: 2 });
  await page.keyboard.down("Control");
  await page.keyboard.press("c");
  await page.keyboard.up("Control");
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "terminal-ok", "Ctrl+C copies the selection");
  await page.keyboard.type("echo pasted-", { delay: 5 });
  await page.keyboard.down("Control");
  await page.keyboard.press("v");
  await page.keyboard.up("Control");
  await page.keyboard.press("Enter");
  await waitFor(async () => printed(await terminalText(), "pasted-terminal-ok"), "Ctrl+V to paste into the shell", 30_000);

  // Alt+F belongs to the shell inside the terminal, not to the menu bar.
  await page.keyboard.down("Alt");
  await page.keyboard.press("f");
  await page.keyboard.up("Alt");
  await delay(200);
  assert.equal(await page.$(".studio-menubar-menu"), null, "Alt+F in the terminal must not open the File menu");
  // Ctrl+C with nothing selected reaches the shell, which drops whatever Alt+F left on the line.
  await page.keyboard.down("Control");
  await page.keyboard.press("c");
  await page.keyboard.up("Control");

  // Ctrl+J still folds the panel from the terminal, and hands the focus to the editor.
  await page.keyboard.down("Control");
  await page.keyboard.press("j");
  await page.keyboard.up("Control");
  assert.equal(await collapsed(), true, "Ctrl+J folds the panel from the terminal");
  assert.ok(await page.evaluate(() => document.activeElement?.closest(".cm-editor") !== null), "the editor takes the focus back");
  await page.keyboard.down("Control");
  await page.keyboard.press("Backquote");
  await page.keyboard.up("Control");
  assert.equal(await collapsed(), false, "Ctrl+` opens it again");

  // A reload, as a change of language makes, finds the same shell with what it printed.
  const id = await page.evaluate(() => sessionStorage.getItem("frameseq-studio-terminal"));
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForSelector(".cm-content");
  await waitFor(async () => (await terminalState()) === "open", "the shell to be picked up after a reload", 30_000);
  assert.equal(await page.evaluate(() => sessionStorage.getItem("frameseq-studio-terminal")), id, "the reload keeps the same shell");
  assert.ok(printed(await terminalText(), "terminal-ok"), "the reload replays what the shell printed");
  await page.click(".studio-terminal");
  await typeCommand('echo after-relo""ad');
  await waitFor(async () => printed(await terminalText(), "after-reload"), "the shell to answer after the reload", 30_000);

  // Killing the shell says so, and the next key starts a new one.
  await page.click("[data-action='kill-terminal']");
  await waitFor(async () => (await terminalText()).includes("The shell exited"), "the shell to end");
  assert.equal(await page.evaluate(() => sessionStorage.getItem("frameseq-studio-terminal")), null, "an ended shell is forgotten");
  await page.keyboard.press("Enter");
  await waitFor(async () => (await terminalState()) === "open", "a key to start a new shell", 30_000);
  assert.notEqual(await page.evaluate(() => sessionStorage.getItem("frameseq-studio-terminal")), id, "the new shell is another one");

  // A reload that finds its shell gone starts another in the terminal on show.
  await page.evaluate(() => {
    const stored = JSON.parse(sessionStorage.getItem("frameseq-studio-terminal"));
    sessionStorage.setItem("frameseq-studio-terminal", JSON.stringify({ ...stored, id: "ended-long-ago" }));
  });
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForSelector(".cm-content");
  await waitFor(async () => (await terminalState()) === "open", "a new shell in place of one that has gone", 30_000);
  assert.ok(!(await page.evaluate(() => sessionStorage.getItem("frameseq-studio-terminal"))).includes("ended-long-ago"));

  assert.deepEqual(errors, [], "the Studio must not throw");
} catch (error) {
  console.error(`Studio server output:\n${output}`);
  const text = await page?.evaluate(() => window.frameseqStudio?.terminal?.text).catch((reason) => String(reason));
  console.error(`Terminal:\n${text}`);
  throw error;
} finally {
  await browser?.close();
  child.kill();
}

console.log("Studio terminal test passed: token and origin checks, a shell in the deck's folder, copy and paste, keys kept by the terminal and the Studio, a reload that finds the same shell, and killing and restarting it.");
