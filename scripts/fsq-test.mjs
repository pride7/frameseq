#!/usr/bin/env node

// An .fsq presentation is TypeScript under FrameSeq's own extension. It builds and checks as a
// .slides.ts file does, with its types compiled away and its icons kept; the Studio's language
// service reads it as TypeScript; and a folder's slides.fsq is the presentation when none is named.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isPresentationFile, presentationExtension, presentationFileName, presentationStem } from "./presentation-file.mjs";
import { createStudioLanguage } from "./studio-language.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const folder = resolve(packageRoot, "tmp", "fsq-test");
const cli = resolve(packageRoot, "scripts", "frameseq.mjs");

if (!folder.startsWith(resolve(packageRoot, "tmp"))) throw new Error(`Unsafe .fsq test path: ${folder}`);
await rm(folder, { recursive: true, force: true });
await mkdir(folder, { recursive: true });

// ── The names ───────────────────────────────────────────────────────────────────────────────────
assert.equal(presentationExtension, ".fsq");
assert.equal(presentationFileName("Quarterly review"), "quarterly-review.fsq");
for (const name of ["talk.fsq", "Talk.FSQ", "talk.slides.ts", "slides.ts", "C:\\talks\\talk.fsq"]) {
  assert.ok(isPresentationFile(name), name);
}
for (const name of ["talk.txt", "talk.fsq.bak", "talk.tsx", "picture.png"]) assert.ok(!isPresentationFile(name), name);
assert.equal(presentationStem("talk.fsq"), "talk");
assert.equal(presentationStem("talk.slides.ts"), "talk");
assert.equal(presentationStem("talk.ts"), "talk");
assert.equal(presentationStem("talk.slides.fsq"), "talk.slides");

// ── Building and checking ───────────────────────────────────────────────────────────────────────
const talk = resolve(folder, "talk.fsq");
await writeFile(talk, [
  'presentation({ title: "FSQ" });',
  "",
  "interface Point { label: string; size: number }",
  'const points: Point[] = [{ label: "Typed in an .fsq file", size: 40 }];',
  "",
  'slide("Types");',
  "for (const point of points) text(point.label).size(point.size as number);",
  'icon("rocket");',
  "",
].join("\n"), "utf8");

const run = (args, cwd = folder) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });

const output = resolve(folder, "dist");
const built = run(["build", "talk.fsq", "--output", output]);
assert.equal(built.status, 0, built.stderr || built.stdout);
const scripts = (await readdir(resolve(output, "assets"))).filter((name) => name.endsWith(".js"));
const bundle = (await Promise.all(scripts.map((name) => readFile(resolve(output, "assets", name), "utf8")))).join("\n");
assert.match(bundle, /Typed in an \.fsq file/);
assert.doesNotMatch(bundle, /interface Point/, "the types are compiled away");
assert.match(bundle, /"rocket"/, "the icons an .fsq file names are in the build");

const checked = run(["check", "talk.fsq", "--json"]);
assert.equal(checked.status, 0, checked.stderr || checked.stdout);
const report = JSON.parse(checked.stdout);
assert.equal(report.summary.slides, 1);
assert.equal(report.summary.errors, 0);
assert.match(report.file, /talk\.fsq$/);

// A folder's slides.fsq is the presentation when the command names none.
const lone = resolve(folder, "lone");
await mkdir(lone);
await writeFile(resolve(lone, "slides.fsq"), 'presentation("Lone");\nslide("Only");\ntext("Found without a name");\n', "utf8");
const found = run(["check", "--json"], lone);
assert.equal(found.status, 0, found.stderr || found.stdout);
assert.match(JSON.parse(found.stdout).file, /slides\.fsq$/);

// ── The Studio's language service ───────────────────────────────────────────────────────────────
const language = createStudioLanguage({ entry: talk, packageRoot });
const broken = 'presentation("FSQ");\nslide("One");\nconst count: number = "three";\ntext(count);\n';
const problems = language.diagnostics(broken);
assert.ok(problems.some((problem) => problem.message.includes("not assignable to type 'number'")), JSON.stringify(problems));
assert.ok(problems.every((problem) => !/Cannot find name 'slide'/.test(problem.message)), "the FrameSeq globals are known");
assert.deepEqual(language.syntax('slide("One");\n'), []);
const typed = 'presentation("FSQ");\nsli';
const completions = language.completions(typed, typed.length);
assert.ok(completions.entries.some((entry) => entry.name === "slide"), "commands complete in an .fsq file");

// A project's tsconfig that includes *.fsq takes the file in once, as it would a .ts file.
const project = resolve(folder, "project");
await mkdir(project);
await writeFile(resolve(project, "tsconfig.json"), JSON.stringify({
  compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler" },
  include: ["*.fsq"],
}), "utf8");
const deck = resolve(project, "deck.fsq");
await writeFile(deck, 'presentation("Project");\nslide("One");\n', "utf8");
const projectLanguage = createStudioLanguage({ entry: deck, packageRoot });
assert.deepEqual(projectLanguage.diagnostics('presentation("Project");\nslide("One");\n'), []);
assert.ok(projectLanguage.diagnostics('slide(1);\n').some((problem) => problem.severity === "error"));

await rm(folder, { recursive: true, force: true });
console.log("FSQ test passed: names, a typed .fsq file built and checked with its icons, a folder's slides.fsq, and the Studio's language service in and out of a project.");
