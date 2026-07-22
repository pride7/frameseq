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

console.log(`Release tag verified: ${tag}; FrameSeq ${packageJson.version}; create-frameseq ${creatorJson.version}.`);
