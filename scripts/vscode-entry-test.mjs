#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = resolve(packageRoot, "packages", "vscode-frameseq");
const require = createRequire(import.meta.url);
const {
  ancestorDirectories,
  entryExcludeGlob,
  entrySearchGlob,
  isSlidesPath,
  rankEntryCandidates,
} = require(resolve(packageRoot, "packages", "vscode-frameseq", "out", "entry.js"));

// A deck below the workspace root is a slides document just like a root one.
assert.ok(isSlidesPath("/work/deck/slides.ts"));
assert.ok(isSlidesPath("/work/talks/2026/kickoff/slides.ts"));
assert.ok(isSlidesPath("/work/talks/kickoff.slides.ts"));
assert.ok(!isSlidesPath("/work/talks/slides.tsx"));
assert.ok(!isSlidesPath("/work/talks/theme.ts"));

// The search glob reaches nested directories and honours a renamed entry setting.
const glob = entrySearchGlob(["decks/kickoff/talk.ts", "slides.ts"]);
assert.ok(glob.startsWith("**/{"));
assert.ok(glob.includes("slides.ts"));
assert.ok(glob.includes("*.slides.ts"));
assert.ok(glob.includes("talk.ts"));
assert.equal(entrySearchGlob(), "**/{slides.ts,*.slides.ts}");
assert.ok(entryExcludeGlob.includes("node_modules"));
assert.ok(entryExcludeGlob.includes("output"));

// Roots are walked outward and stop at the workspace folder.
assert.deepEqual(
  ancestorDirectories("/work/site/decks/kickoff", "/work/site"),
  ["/work/site/decks/kickoff", "/work/site/decks", "/work/site"],
);
assert.equal(ancestorDirectories("/work/site/decks").at(-1), "/");

// Without an open document the shallowest deck wins, alphabetically for ties.
assert.deepEqual(
  rankEntryCandidates([
    "/work/decks/kickoff/slides.ts",
    "/work/slides.ts",
    "/work/decks/annual/slides.ts",
  ]),
  ["/work/slides.ts", "/work/decks/annual/slides.ts", "/work/decks/kickoff/slides.ts"],
);

// The deck next to the file being edited wins over a shallower one elsewhere.
assert.deepEqual(
  rankEntryCandidates(
    ["/work/slides.ts", "/work/decks/kickoff/slides.ts", "/work/decks/annual/slides.ts"],
    "/work/decks/kickoff/theme.ts",
  )[0],
  "/work/decks/kickoff/slides.ts",
);

// A nested deck is still discovered when nothing else points at one.
assert.deepEqual(
  rankEntryCandidates(["/work/talks/2026/kickoff/slides.ts"], "/work"),
  ["/work/talks/2026/kickoff/slides.ts"],
);

// These assertions describe the source, not its line endings, and Git hands Windows a
// CRLF checkout, so normalise before matching or every multi-line claim fails there.
const extensionSource = (await readFile(resolve(extensionRoot, "src", "extension.ts"), "utf8"))
  .replace(/\r\n/g, "\n");
assert.ok(extensionSource.includes("async function resolveRoot"));
assert.ok(extensionSource.includes("async function discoverEntry"));
assert.ok(extensionSource.includes("lastResolvedEntry"));
assert.ok(
  extensionSource.includes("vscode.window.visibleTextEditors) {"),
  "Entry resolution must consider visible slides editors",
);

// The manual picker is remembered per workspace and outranks the active editor.
assert.ok(extensionSource.includes("async function selectEntry"));
assert.ok(extensionSource.includes("async function entryCandidates"));
assert.ok(extensionSource.includes("entryStore = context.workspaceState"));
assert.ok(extensionSource.includes("vscode.window.showQuickPick"));
const resolveSource = extensionSource.slice(
  extensionSource.indexOf("async function resolveEntry"),
  extensionSource.indexOf("function entryLabel"),
);
assert.ok(
  resolveSource.indexOf("pinnedEntryPath()") < resolveSource.indexOf("activeTextEditor"),
  "A selected entry must win over the active editor",
);
assert.ok(
  resolveSource.includes("await pinEntry(undefined)"),
  "A selected entry that no longer exists must be forgotten",
);
assert.ok(extensionSource.includes("await stopPreview();\n        await startPreview(provider, output);"));

const manifest = JSON.parse(await readFile(resolve(extensionRoot, "package.json"), "utf8"));
const selectEntryCommand = manifest.contributes.commands
  .find((command) => command.command === "frameseq.selectEntry");
assert.ok(selectEntryCommand, "FrameSeq: Select Entry must be a palette command");
assert.equal(selectEntryCommand.title, "FrameSeq: Select Entry");
assert.ok(manifest.contributes.menus["view/title"]
  .some((item) => item.command === "frameseq.selectEntry" && item.when.includes("frameseq.slides")));
assert.ok(manifest.contributes.viewsWelcome
  .some((welcome) => welcome.contents.includes("command:frameseq.selectEntry")));

console.log("VS Code entry test passed: nested decks, renamed entries, and command roots resolve.");
