#!/usr/bin/env node
// Exercise the built application from outside the repository so missing runtime dependencies
// cannot accidentally resolve to the development computer's node_modules.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import puppeteer from "puppeteer";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = await mkdtemp(join(tmpdir(), "frameseq-harmony-"));
const app = join(workspace, "application");
const documents = join(workspace, "documents");
const deck = join(documents, "中文演示.slides.ts");
const second = join(documents, "另一份.slides.ts");
let child;
let browser;
let output = "";
let stopped;

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
  await cp(join(root, "output/harmony/FrameSeq"), app, { recursive: true });
  await mkdir(documents);
  await writeFile(join(documents, "标题.ts"), 'export const heading: string = "来自本地模块";\n');
  await writeFile(join(documents, "图片.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#7c3aed"/></svg>');
  await writeFile(join(documents, "引用.bib"), '@article{test, title={中文文献}, author={Author}, year={2026}}');
  const source = 'import { heading } from "./标题";\n'
    + 'presentation({ title: "鸿蒙原型", theme: "minimal-academic" });\n'
    + 'slide("编辑与保存").canvas();\n'
    + 'text("双击编辑").position({ x: 60, y: 80 }).width(400);\n'
    + 'text(heading).position({ x: 60, y: 160 }).width(400);\n'
    + 'image("./图片.svg").position({ x: 600, y: 80 }).width(120).height(60);\n'
    + 'chart("bar", { "甲": 2, "乙": 4 }).position({ x: 600, y: 220 }).width(400).height(220);\n'
    + 'math("E=mc^2").position({ x: 60, y: 260 });\n'
    + 'slide("第二页"); text("继续放映");\n';
  await writeFile(deck, source);
  await writeFile(second, 'presentation("另一份"); slide("已切换文稿"); text("切换成功");\n');
  child = spawn(process.execPath, [join(app, "scripts/harmony-server.mjs"), deck], {
    cwd: documents, env: { ...process.env, FRAMESEQ_CONFIG_DIR: join(workspace, "config"), FRAMESEQ_NO_UPDATE_CHECK: "1" },
    stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
  });
  stopped = new Promise((done) => child.once("exit", done));
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  const address = await waitFor(() => output.match(/Studio: (http:\/\/\S+\/studio.html)/)?.[1], "the packaged server to start");
  const origin = new URL(address).origin;
  let session = await (await fetch(`${origin}/__frameseq/studio/session`)).json();
  const call = async (method, route, body) => {
    const response = await fetch(`${origin}/__frameseq/studio/${route}`, {
      method, headers: { "x-frameseq-studio": session.token, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  };
  assert.equal(session.terminal, false);
  assert.equal(session.assistant, false);
  assert.equal(session.updates, false);
  assert.deepEqual(session.exportFormats, []);
  assert.equal((await call("POST", "export", { format: "pdf" })).status, 501);
  assert.equal((await call("GET", "assistant")).status, 501);
  assert.equal((await fetch(`${origin}/__frameseq/studio/source`)).status, 403);
  assert.equal((await fetch(`${origin}/__frameseq/studio/session`, { headers: { Origin: "https://example.org" } })).status, 403);
  const completions = await call("POST", "language/completions", { text: source, offset: 0, prefix: "sl" });
  assert.equal(completions.status, 200);
  const bib = await (await fetch(`${origin}/__frameseq/module?file=${encodeURIComponent(join(documents, "引用.bib"))}`)).text();
  assert.ok(bib.includes("中文文献"));
  const typeOnly = join(documents, "type-only.ts");
  await writeFile(typeOnly, 'import type { Missing } from "not-installed"; export const ok: number = 42;');
  const erased = await (await fetch(`${origin}/__frameseq/module?file=${encodeURIComponent(typeOnly)}`)).text();
  assert.ok(erased.includes("export const ok = 42"));
  assert.ok(!erased.includes("not-installed"));
  const invalid = join(documents, "invalid.ts");
  await writeFile(invalid, 'import "./missing"; const path = "./标题"; import(path);');
  const diagnosed = await (await fetch(`${origin}/__frameseq/module?file=${encodeURIComponent(invalid)}`)).text();
  assert.ok(diagnosed.includes("literal path"));
  assert.equal((await fetch(`${origin}/__frameseq/studio/session`)).status, 200);
  const secretFolder = join(workspace, "private");
  await mkdir(secretFolder);
  await writeFile(join(secretFolder, "secret.ts"), 'export const secret = "DO_NOT_EXPOSE";');
  await symlink(secretFolder, join(documents, "linked"), process.platform === "win32" ? "junction" : "dir");
  const refused = await (await fetch(`${origin}/__frameseq/module?file=${encodeURIComponent(join(documents, "linked/secret.ts"))}`)).text();
  assert.ok(refused.includes("outside"));
  assert.ok(!refused.includes("DO_NOT_EXPOSE"));
  console.log("✓ Packaged service, language requests, capability gates and file boundaries");

  browser = await puppeteer.launch(puppeteerLaunchOptions());
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("frameseq-studio-language", "en");
    window.__harmonyCalls = [];
    window.frameseqShell = {
      chrome: "native", platform: "harmonyos",
      minimize: async () => {}, toggleMaximize: async () => {}, isMaximized: async () => false,
      startDragging: async () => {}, close: async () => {}, onResized: async () => {},
      onCloseRequested: async (callback) => { window.__harmonyClose = callback; },
      openExternal: async () => {},
      startShow: async () => { window.__harmonyCalls.push("show"); },
      endShow: async () => { window.__harmonyCalls.push("end"); },
    };
  });
  await page.goto(address);
  const preview = await waitFor(() => page.frames().find((frame) => /frameseq-preview=studio(?:#|$)/.test(frame.url())), "the preview frame");
  const shows = (words) => waitFor(() => preview.evaluate((value) => document.querySelector("#app")?.textContent.includes(value), words).catch(() => false), `the preview to show ${words}`);
  await shows("双击编辑");
  await shows("来自本地模块");
  await preview.waitForSelector(".katex");
  assert.ok(await preview.$(".frameseq-chart"));
  await waitFor(() => preview.evaluate(() => [...document.querySelectorAll("img")].some((image) => image.src.includes(encodeURIComponent("图片")) && image.complete && image.naturalWidth > 0)), "the local SVG image");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("is-desktop-harmonyos")), true);
  const box = await page.$eval(".studio-preview-frame", (element) => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y }; });
  const words = await preview.evaluate(() => {
    const element = [...document.querySelectorAll("[data-frameseq-node='text']")].find((node) => node.textContent === "双击编辑");
    const box = element.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  await page.mouse.click(box.x + words.x, box.y + words.y, { clickCount: 2 });
  await waitFor(() => preview.$(".is-frameseq-typing"), "in-place editing");
  await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
  await page.keyboard.type("已在画布编辑");
  await page.keyboard.press("Enter");
  await waitFor(async () => (await readFile(deck, "utf8")).includes('text("已在画布编辑")'), "the canvas edit to be saved");
  await shows("已在画布编辑");
  console.log("✓ Chinese text, relative TypeScript import, image, chart, math and canvas editing");
  await page.screenshot({ path: join(root, "output/harmony/studio.png") });
  const afterCanvas = await readFile(deck, "utf8");
  await page.click(".cm-content");
  await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
  await page.keyboard.sendCharacter(`// 从代码区输入\n${afterCanvas}`);
  await page.keyboard.down("Control"); await page.keyboard.press("s"); await page.keyboard.up("Control");
  await waitFor(async () => (await readFile(deck, "utf8")).includes("// 从代码区输入"), "saving a code editor change");
  await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control");
  await page.keyboard.down("Control"); await page.keyboard.press("s"); await page.keyboard.up("Control");
  await waitFor(async () => !(await readFile(deck, "utf8")).includes("// 从代码区输入"), "undoing the code editor change");

  await writeFile(join(documents, "标题.ts"), 'export const heading: string = "模块已更新";\n');
  await shows("模块已更新");
  const current = await readFile(deck, "utf8");
  await writeFile(deck, current.replace("已在画布编辑", "快速保存一"));
  await delay(15);
  await writeFile(deck, current.replace("已在画布编辑", "快速保存二"));
  await shows("快速保存二");
  const disk = await call("GET", "source");
  const conflict = await call("PUT", "source", { text: current, base: "outdated" });
  assert.equal(conflict.data.conflict, true);
  assert.equal((await readFile(deck, "utf8")), disk.data.text);
  await page.reload();
  await waitFor(async () => {
    const frame = page.frames().find((frame) => /frameseq-preview=studio(?:#|$)/.test(frame.url()));
    return frame?.evaluate(() => document.body.textContent.includes("快速保存二")).catch(() => false);
  }, "saved changes after reopening");
  await page.keyboard.press("F5");
  await page.waitForSelector(".studio-show");
  await waitFor(() => page.evaluate(() => window.__harmonyCalls.includes("show")), "the native show request");
  const showFrame = await waitFor(() => page.frames().find((frame) => /[?&]show=1/.test(frame.url())), "the show frame");
  await showFrame.waitForSelector(".frameseq-slides");
  await page.keyboard.press("ArrowRight");
  await waitFor(() => showFrame.evaluate(() => document.querySelector(".frameseq-slide-frame.is-active")?.textContent.includes("继续放映")).catch(() => false), "stepping through the show");
  await page.keyboard.press("Escape");
  await waitFor(() => page.evaluate(() => !document.querySelector(".studio-show") && window.__harmonyCalls.includes("end")), "returning from the show");
  console.log("✓ Code editing and undo, live updates, successive saves, conflicts, reopening and slide show");

  const cover = await browser.newPage();
  await cover.goto(`${origin}/__frameseq/studio/template-preview?template=blank&language=zh`);
  await cover.waitForSelector(".frameseq-slide");
  await cover.close();
  const open = await call("POST", "files/open", { path: second });
  assert.equal(open.data.ok, true);
  await waitFor(() => page.frames().some((frame) => /frameseq-preview=studio(?:#|$)/.test(frame.url())) && page.evaluate(() => document.body.textContent.includes("另一份")).catch(() => false), "switching to another presentation");
  session = await (await fetch(`${origin}/__frameseq/studio/session`)).json();
  assert.equal(session.entry, second);
  const created = await call("POST", "files/create", { title: "新建文稿", folder: documents, template: "blank", language: "zh" });
  assert.equal(created.data.ok, true);
  await waitFor(async () => (await (await fetch(`${origin}/__frameseq/studio/session`)).json()).name === "新建文稿.fsq", "creating another presentation");
  // A new presentation is an .fsq file, which this edition compiles as TypeScript too.
  await waitFor(async () => {
    const frame = page.frames().find((item) => /frameseq-preview=studio(?:#|$)/.test(item.url()));
    return frame?.evaluate(() => document.querySelector(".frameseq-slide")?.textContent.includes("新建文稿")).catch(() => false);
  }, "the new .fsq presentation to render");
  const fatal = failures.filter((message) => !/Execution context|detached Frame/.test(message));
  assert.deepEqual(fatal, [], `Browser errors: ${fatal.join("\n")}`);
  console.log("✓ Template cover, opening another file and creating a presentation");
  console.log("Harmony prototype tests passed (host browser; HarmonyOS device validation still required).");
} finally {
  if (browser) await browser.close();
  if (child) {
    child.stdin.end();
    await Promise.race([stopped, delay(5000).then(() => child.kill())]);
  }
  if (dirname(workspace) !== resolve(tmpdir()) || !workspace.startsWith(join(resolve(tmpdir()), "frameseq-harmony-"))) throw new Error("Test cleanup is outside its temporary directory.");
  if (process.env.FRAMESEQ_KEEP_TEST_FILES !== "1") await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  else console.log(`Test files: ${workspace}`);
}
