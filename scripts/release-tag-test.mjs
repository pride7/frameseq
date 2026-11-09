#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;

if (!tag) {
  throw new Error("Provide a release tag such as v0.15.0");
}

const packageJson = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
const creatorJson = JSON.parse(await readFile(
  resolve(packageRoot, "packages", "create-frameseq", "package.json"),
  "utf8",
));
const creatorSource = await readFile(
  resolve(packageRoot, "packages", "create-frameseq", "index.mjs"),
  "utf8",
);
const playgroundJson = JSON.parse(await readFile(
  resolve(packageRoot, "examples", "playground", "package.json"),
  "utf8",
));

const expectedTag = `v${packageJson.version}`;
if (tag !== expectedTag) {
  throw new Error(`Release tag ${tag} does not match package version ${packageJson.version}; expected ${expectedTag}`);
}

const frameworkRange = `^${packageJson.version}`;
if (!creatorSource.includes(`const FRAMESEQ_VERSION = "${frameworkRange}";`)) {
  throw new Error(`create-frameseq must generate projects using ${frameworkRange}`);
}
if (playgroundJson.devDependencies?.["@pride7/frameseq"] !== frameworkRange) {
  throw new Error(`The StackBlitz playground must use ${frameworkRange}`);
}
if (!/^\d+\.\d+\.\d+$/.test(creatorJson.version)) {
  throw new Error(`Invalid create-frameseq version: ${creatorJson.version}`);
}

// The release publishes the VS Code extension with --skip-duplicate, so changes listed as
// Unreleased would be skipped without a word while its version stays the published one.
const extensionJson = JSON.parse(await readFile(
  resolve(packageRoot, "packages", "vscode-frameseq", "package.json"),
  "utf8",
));
const extensionChangelog = await readFile(
  resolve(packageRoot, "packages", "vscode-frameseq", "CHANGELOG.md"),
  "utf8",
);
const unreleased = /^## Unreleased\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(extensionChangelog)?.[1] ?? "";
if (/^\s*[-*] /m.test(unreleased)) {
  throw new Error(
    `The VS Code extension lists Unreleased changes; give them a version above ${extensionJson.version} in packages/vscode-frameseq`,
  );
}
if (!new RegExp(`^## ${extensionJson.version.replace(/\./g, "\\.")} `, "m").test(extensionChangelog)) {
  throw new Error(`packages/vscode-frameseq/CHANGELOG.md has no entry for version ${extensionJson.version}`);
}

console.log(`Release tag verified: ${tag}; FrameSeq ${packageJson.version}; create-frameseq ${creatorJson.version}; VS Code extension ${extensionJson.version}.`);
