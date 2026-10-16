#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { delimiter, dirname, relative, resolve } from "node:path";
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
assert.ok(isSlidesPath("/work/talks/kickoff.fsq"));
assert.ok(isSlidesPath("C:\\talks\\Kickoff.FSQ"));
assert.ok(!isSlidesPath("/work/talks/.fsq"));
assert.ok(!isSlidesPath("/work/talks/slides.tsx"));
assert.ok(!isSlidesPath("/work/talks/theme.ts"));

// The search glob reaches nested directories and honours a renamed entry setting.
const glob = entrySearchGlob(["decks/kickoff/talk.ts", "slides.ts"]);
assert.ok(glob.startsWith("**/{"));
assert.ok(glob.includes("slides.ts"));
assert.ok(glob.includes("*.slides.ts"));
assert.ok(glob.includes("talk.ts"));
assert.equal(entrySearchGlob(), "**/{slides.ts,*.slides.ts,*.fsq}");
assert.ok(entrySearchGlob(["decks/review.fsq"]).includes("review.fsq"));
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

// Commands run the project's own FrameSeq, and a deck with none uses a global install, found
// from the `frameseq` command npm put on the PATH, as a terminal finds it.
const { cliIn, findCli, globalCli, runtimeFor } = require(resolve(extensionRoot, "out", "cli.js"));
const cliSandbox = resolve(packageRoot, "tmp", "vscode-cli-test");
if (!cliSandbox.startsWith(resolve(packageRoot, "tmp"))) throw new Error(`Unsafe CLI test path: ${cliSandbox}`);
await rm(cliSandbox, { recursive: true, force: true });
const project = resolve(cliSandbox, "project");
const lone = resolve(cliSandbox, "lone");
const prefix = resolve(cliSandbox, "global");
const projectCli = cliIn(resolve(project, "node_modules"));
// npm's global layout: the prefix itself on Windows, lib/ and a bin/ symlink elsewhere.
const globalModules = process.platform === "win32" ? resolve(prefix, "node_modules") : resolve(prefix, "lib", "node_modules");
const globalBin = process.platform === "win32" ? prefix : resolve(prefix, "bin");
for (const cli of [projectCli, cliIn(globalModules)]) {
  await mkdir(dirname(cli), { recursive: true });
  await writeFile(cli, "", "utf8");
}
await mkdir(lone, { recursive: true });
await mkdir(globalBin, { recursive: true });
if (process.platform === "win32") await writeFile(resolve(globalBin, "frameseq.cmd"), "", "utf8");
else await symlink(relative(globalBin, cliIn(globalModules)), resolve(globalBin, "frameseq"));
const searchPath = [resolve(cliSandbox, "elsewhere"), globalBin].join(delimiter);
// The shim on Windows names the prefix; the symlink elsewhere resolves to the script itself.
const installedGlobalCli = process.platform === "win32" ? cliIn(globalModules) : await realpath(cliIn(globalModules));

assert.equal(await globalCli(searchPath), installedGlobalCli);
assert.equal(await globalCli(resolve(cliSandbox, "elsewhere")), undefined);
assert.equal(await findCli(project, () => globalCli(searchPath)), projectCli, "the project's own FrameSeq comes first");
assert.equal(await findCli(lone, () => globalCli(searchPath)), installedGlobalCli);
assert.equal(await findCli(lone, async () => undefined), undefined, "no FrameSeq anywhere must be reported, not guessed");
assert.equal(await runtimeFor(installedGlobalCli), "node", "an npm install runs with the Node.js on the PATH");

// The FrameSeq app puts its command on the PATH beside the app, and brings its own Node.js,
// which the extension uses so a computer with only the app needs nothing else.
const appRoot = resolve(cliSandbox, "FrameSeq");
const appScript = resolve(appRoot, "app", "scripts", "frameseq.mjs");
const appNode = process.platform === "win32" ? resolve(appRoot, "node", "node.exe") : resolve(appRoot, "node", "bin", "node");
await mkdir(dirname(appScript), { recursive: true });
await mkdir(dirname(appNode), { recursive: true });
await mkdir(resolve(appRoot, "bin"), { recursive: true });
await writeFile(appScript, "", "utf8");
await writeFile(appNode, "", "utf8");
await writeFile(resolve(appRoot, "app", "frameseq-bundle.json"), "{}", "utf8");
if (process.platform === "win32") await writeFile(resolve(appRoot, "bin", "frameseq.cmd"), "", "utf8");
else {
  await writeFile(resolve(appRoot, "bin", "frameseq"), "", "utf8");
  await mkdir(resolve(cliSandbox, "local-bin"), { recursive: true });
  await symlink(resolve(appRoot, "bin", "frameseq"), resolve(cliSandbox, "local-bin", "frameseq"));
}
const appPath = process.platform === "win32" ? resolve(appRoot, "bin") : resolve(cliSandbox, "local-bin");
const foundAppCli = await globalCli(appPath);
assert.equal(foundAppCli && await realpath(foundAppCli), await realpath(appScript), "the app's command must lead to the app's CLI");
assert.equal(await runtimeFor(appScript), appNode, "the app's CLI must run with the app's own Node.js");
// An app that updates itself starts through its entry, which runs the newest update.
const appEntry = resolve(appRoot, "app", "scripts", "app-launch.mjs");
await writeFile(appEntry, "", "utf8");
const foundAppEntry = await globalCli(appPath);
assert.equal(foundAppEntry && await realpath(foundAppEntry), await realpath(appEntry), "the app's command must lead to the app's entry");
assert.equal(await runtimeFor(appEntry), appNode, "the app's entry must run with the app's own Node.js");
await rm(cliSandbox, { recursive: true, force: true });

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
