#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { spawnSync } from "node:child_process";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = resolve(packageRoot, "tmp", "package-test");
const packDirectory = resolve(testRoot, "packs");
const harnessDirectory = resolve(testRoot, "harness");
const appDirectory = resolve(harnessDirectory, "app");
const npmCli = process.env.npm_execpath;

const packageJson = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
const creatorJson = JSON.parse(await readFile(
  resolve(packageRoot, "packages", "create-frameseq", "package.json"),
  "utf8",
));

function tarballName(name, version) {
  return `${name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function runNpm(args, cwd) {
  if (npmCli) {
    run(process.execPath, [npmCli, ...args], cwd);
    return;
  }
  run("npm", args, cwd);
}

if (!testRoot.startsWith(resolve(packageRoot, "tmp"))) {
  throw new Error(`Unsafe package test path: ${testRoot}`);
}

await rm(testRoot, { recursive: true, force: true });
await mkdir(packDirectory, { recursive: true });
await mkdir(harnessDirectory, { recursive: true });

runNpm(["pack", "--pack-destination", packDirectory], packageRoot);
runNpm(
  ["pack", resolve(packageRoot, "packages", "create-frameseq"), "--pack-destination", packDirectory],
  packageRoot,
);

const frameSeqTarball = resolve(
  packDirectory,
  tarballName(packageJson.name, packageJson.version),
);
const creatorTarball = resolve(
  packDirectory,
  tarballName(creatorJson.name, creatorJson.version),
);
if (!existsSync(frameSeqTarball) || !existsSync(creatorTarball)) {
  throw new Error("Expected npm package tarballs were not created");
}

runNpm(["init", "-y"], harnessDirectory);
runNpm(["install", "--ignore-scripts", creatorTarball], harnessDirectory);
run(
  process.execPath,
  [resolve(harnessDirectory, "node_modules", "create-frameseq", "index.mjs"), "app"],
  harnessDirectory,
);
runNpm(["install", "--save-dev", frameSeqTarball], appDirectory);
runNpm(["run", "check"], appDirectory);
run(
  process.execPath,
  [
    "--input-type=module",
    "--eval",
    "import { defineTheme, presentation, slide, text } from '@pride7/frameseq'; const theme = defineTheme({ name: 'test', colors: { accent: '#123456' } }); const deck = presentation({ title: 'Import test', theme }); slide('Ready'); text('Works'); if (deck.theme.colors.accent !== '#123456') throw new Error('Custom theme was not applied');",
  ],
  appDirectory,
);
runNpm(["run", "build"], appDirectory);
runNpm(["run", "pdf", "--", "--output", "output/installed-package.pdf"], appDirectory);
runNpm(["exec", "--", "frameseq", "new", "extra.slides.ts"], appDirectory);

for (const expected of [
  resolve(appDirectory, "dist", "index.html"),
  resolve(appDirectory, "output", "installed-package.pdf"),
  resolve(appDirectory, "extra.slides.ts"),
]) {
  if (!existsSync(expected)) throw new Error(`Expected package test output is missing: ${expected}`);
}

console.log("Package test passed: packed install, project creation, types, imports, CLI, HTML, and PDF.");
