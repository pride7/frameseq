#!/usr/bin/env node

// `frameseq mcp` over standard input and output: the handshake, the tools and their read-only
// annotations, the outline, the check with each kind of finding, screenshots, the guide, an
// unknown method, and stopping when the input closes.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");
const folder = await mkdtemp(join(tmpdir(), "frameseq-mcp-"));
const deck = join(folder, "talk.slides.ts");
await writeFile(deck, [
  'presentation("MCP test");',
  "",
  'slide("Overflow");',
  'text("Wide").position({ x: 1200, y: 100 }).width(400);',
  'const count: number = "one";',
  "",
  'slide("Quiet").notes("Say little.");',
  'text("Hello");',
  "",
].join("\n"), "utf8");

const child = spawn(process.execPath, [cli, "mcp", deck], { cwd: folder, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
let stderr = "";
child.stderr.on("data", (chunk) => { stderr += chunk; });
const exited = new Promise((resolveExit) => child.on("close", resolveExit));
const answers = new Map();
const stray = [];
createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  if (answers.has(message.id)) answers.get(message.id)(message);
  else stray.push(message);
});
let next = 1;
const request = (method, params) => new Promise((resolveAnswer) => {
  const id = next++;
  answers.set(id, resolveAnswer);
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
});
const call = async (name, args = {}) => (await request("tools/call", { name, arguments: args })).result;
const text = (result) => result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");

try {
  const init = await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.equal(init.result.serverInfo.name, "frameseq");
  assert.ok(init.result.capabilities.tools);
  assert.match(init.result.instructions, /talk\.slides\.ts/);
  const older = await request("initialize", { protocolVersion: "1999-01-01" });
  assert.equal(older.result.protocolVersion, "2025-06-18", "an unknown version is answered with the newest");
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

  const { tools } = (await request("tools/list", {})).result;
  assert.deepEqual(tools.map((tool) => tool.name), ["outline", "check", "screenshot", "guide"]);
  // Read-only tools are what lets Codex call them without asking.
  assert.ok(tools.every((tool) => tool.annotations?.readOnlyHint === true && tool.inputSchema.type === "object"));

  const outline = text(await call("outline"));
  assert.match(outline, /MCP test: 2 slides/);
  assert.match(outline, /1\. Overflow \[default\] lines 3-6, 1 object/);
  assert.match(outline, /2\. Quiet \[default\] lines 7-9, 1 object, speaker notes/);

  const check = text(await call("check"));
  assert.match(check, /TypeScript: \d+ problems?\n {2}line 5 \(error\): Type 'string' is not assignable to type 'number'\./);
  assert.match(check, /slide 1 "Overflow", line 4 \(error, canvas-overflow\): Text exceeds the slide canvas by \d+px on the right/);
  assert.match(check, /suggestion: /);

  const shots = await call("screenshot", { slides: [2, 1, 9] });
  const images = shots.content.filter((item) => item.type === "image");
  assert.equal(images.length, 2);
  for (const image of images) {
    assert.equal(image.mimeType, "image/png");
    assert.deepEqual([...Buffer.from(image.data, "base64").subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  }
  assert.match(text(shots), /Slide 2 of 2: Quiet[\s\S]*Slide 1 of 2: Overflow[\s\S]*There is no slide 9; the presentation has 2\./);
  const none = await call("screenshot", {});
  assert.equal(none.isError, true);

  // A document that throws is reported with its line, and nothing is shown.
  await writeFile(deck, 'presentation("Broken");\n\nslide("One");\ntext("A").below("nowhere").gap(10);\n', "utf8");
  const broken = text(await call("check"));
  assert.match(broken, /The document throws while it runs[\s\S]*talk\.slides\.ts:4/);
  assert.equal((await call("screenshot", { slide: 1 })).isError, true);

  assert.match(text(await call("guide")), /^# FrameSeq/);
  assert.equal((await call("nothing")).isError, true);
  const unknown = await request("resources/list", {});
  assert.equal(unknown.error.code, -32601);
  assert.deepEqual(stray, [], "a notification gets no answer, and nothing else reaches standard output");
} catch (error) {
  console.error(stderr);
  throw error;
} finally {
  child.stdin.end();
}
assert.equal(await Promise.race([exited, new Promise((resolveWait) => setTimeout(() => resolveWait("still running"), 20_000))]), 0, "the server stops when its input closes");
await rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => undefined);

console.log("MCP test passed: the handshake, read-only tools, the outline, TypeScript and layout findings, screenshots, document errors, the guide, and stopping with its input.");
