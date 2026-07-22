#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = resolve(packageRoot, "packages", "vscode-frameseq");
const manifest = JSON.parse(await readFile(resolve(extensionRoot, "package.json"), "utf8"));
const source = await readFile(resolve(extensionRoot, "src", "extension.ts"), "utf8");
const rootPackage = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));

assert.equal(manifest.publisher, "pride7");
assert.equal(manifest.main, "./out/extension.js");
assert.equal(manifest.extensionKind[0], "workspace");
assert.ok(manifest.contributes.views.frameseq.some((view) => view.id === "frameseq.slides"));

const commandIds = new Set(manifest.contributes.commands.map((command) => command.command));
for (const command of [
  "frameseq.refresh",
  "frameseq.openSlide",
  "frameseq.preview",
  "frameseq.previewCurrentSlide",
  "frameseq.previousSlide",
  "frameseq.nextSlide",
  "frameseq.insertSlide",
  "frameseq.stopPreview",
  "frameseq.check",
  "frameseq.export",
  "frameseq.exportHtml",
  "frameseq.exportPdf",
  "frameseq.exportPptx",
]) {
  assert.ok(commandIds.has(command), `Missing VS Code command: ${command}`);
  assert.ok(source.includes(`"${command}"`), `VS Code command is not registered: ${command}`);
}

assert.equal(manifest.contributes.configuration.properties["frameseq.entry"].default, "slides.ts");
assert.equal(manifest.contributes.configuration.properties["frameseq.previewBeside"].default, true);
assert.equal(manifest.contributes.configuration.properties["frameseq.followOutline"].default, true);
assert.ok(manifest.contributes.snippets.some((snippet) => snippet.language === "typescript"));
assert.ok(source.includes('["inspect", relativeEntry, "--json"]'));
assert.ok(source.includes('["check", relativeEntry, "--json"]'));
assert.ok(source.includes('["dev", relativeEntry, "--no-open"]'));
assert.ok(source.includes('BROWSER: "none"'));
assert.ok(source.includes('searchParams.set("frameseq-preview"'));
assert.ok(source.includes("vscode.window.createWebviewPanel"));
assert.ok(source.includes('"frameseq.preview"'));
assert.ok(source.includes('type: "frameseq.navigate"'));
assert.ok(source.includes('message.type !== "frameseq.navigate"'));
assert.ok(source.includes("vscode.ViewColumn.Beside"));
assert.ok(source.includes('format === "html" ? "build" : format'));
assert.ok(rootPackage.files.includes("scripts/frameseq-inspect.mjs"));
assert.ok(rootPackage.scripts["vscode:package"].includes("packages/vscode-frameseq"));
assert.ok(rootPackage.scripts["vscode:check"].includes("vscode-preview-test.mjs"));

console.log("VS Code extension test passed: outline, preview, diagnostics, export commands, and packaging metadata are present.");
