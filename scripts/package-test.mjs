#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
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
const cliSource = await readFile(resolve(packageRoot, "scripts", "frameseq.mjs"), "utf8");
const viteConfig = await readFile(resolve(packageRoot, "vite.config.ts"), "utf8");
const creatorJson = JSON.parse(await readFile(
  resolve(packageRoot, "packages", "create-frameseq", "package.json"),
  "utf8",
));
const publishWorkflow = await readFile(
  resolve(packageRoot, ".github", "workflows", "publish.yml"),
  "utf8",
);
const playgroundJson = JSON.parse(await readFile(
  resolve(packageRoot, "examples", "playground", "package.json"),
  "utf8",
));
const playgroundSlides = await readFile(
  resolve(packageRoot, "examples", "playground", "slides.ts"),
  "utf8",
);

if (!packageJson.files?.includes("llms.txt")) {
  throw new Error("The npm package must include the FrameSeq AI authoring contract");
}
if (playgroundJson.devDependencies?.["@pride7/frameseq"] !== `^${packageJson.version}`
  || playgroundJson.scripts?.dev !== "frameseq dev slides.ts --host"
  || playgroundJson.stackblitz?.startCommand !== "npm run dev"
  || !playgroundSlides.includes("presentation({")
  || !playgroundSlides.includes("slide(")) {
  throw new Error("The standalone StackBlitz playground is incomplete or uses the wrong FrameSeq version");
}
if (!cliSource.includes('const hostEnabled = process.argv.includes("--host") || remoteEnabled;')
  || !cliSource.includes("server: hostEnabled ? { host: true } : undefined")) {
  throw new Error("FrameSeq dev must expose container previews with --host while preserving --remote behavior");
}
if (!publishWorkflow.includes("tags:")
  || !publishWorkflow.includes('"v*"')
  || !publishWorkflow.includes("id-token: write")
  || !publishWorkflow.includes("npm run release:check")
  || !publishWorkflow.includes("npm publish --access=public")
  || !publishWorkflow.includes("working-directory: packages/create-frameseq")
  || publishWorkflow.includes("NODE_AUTH_TOKEN")) {
  throw new Error("Trusted Publishing workflow is missing a required tag, OIDC, check, or package publish setting");
}

if (!packageJson.scripts?.["build:gallery"]?.startsWith("npm run build:package &&")) {
  throw new Error("Gallery build must create the package entry before building examples");
}
if (packageJson.scripts?.preview !== "vite preview --open"
  || !/preview:\s*\{\s*open:\s*false\s*,?\s*\}/.test(viteConfig)) {
  throw new Error("Automated Vite previews must stay headless while npm run preview remains interactive");
}

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
const generatedPackageJson = JSON.parse(await readFile(
  resolve(appDirectory, "package.json"),
  "utf8",
));
if (generatedPackageJson.scripts?.present !== "frameseq dev slides.ts --remote") {
  throw new Error("Generated project did not include the local phone-remote script");
}
if (generatedPackageJson.scripts?.pptx !== "frameseq pptx slides.ts") {
  throw new Error("Generated project did not include the PPTX export script");
}
runNpm(["install", "--save-dev", frameSeqTarball], appDirectory);
const installedLlms = await readFile(
  resolve(appDirectory, "node_modules", "@pride7", "frameseq", "llms.txt"),
  "utf8",
);
if (!installedLlms.includes("## Authoring model") || !installedLlms.includes("frameseq check slides.ts --json")) {
  throw new Error("Packed FrameSeq package did not include a complete llms.txt contract");
}
runNpm(["run", "check"], appDirectory);
run(
  process.execPath,
  [
    "--input-type=module",
    "--eval",
    "import { circle, defineTheme, line, presentation, rect, slide, text } from '@pride7/frameseq'; const theme = defineTheme({ name: 'test', colors: { accent: '#123456' } }); const slides = presentation({ title: 'Import test', theme }); slide({ name: 'Ready' }).canvas().notes('Package speaker note'); text('Works'); rect('Input').position({ x: 40, y: 40 }).fill('#fff'); circle('Output').position({ x: 400, y: 40 }); const connector = line({ x1: 200, y1: 100, x2: 400, y2: 100 }).arrow(); if (slides.theme.colors.accent !== '#123456') throw new Error('Custom theme was not applied'); if (connector.node.props.arrow !== 'end') throw new Error('Shape APIs were not exported correctly'); if (slides.slides[0].props.notes !== 'Package speaker note') throw new Error('Speaker notes were not exported correctly');",
  ],
  appDirectory,
);
runNpm(["run", "build"], appDirectory);

const builtHtml = await readFile(resolve(appDirectory, "dist", "index.html"), "utf8");
if (!/["']\.\/assets\//.test(builtHtml) || /["']\/assets\//.test(builtHtml)) {
  throw new Error("Static HTML build did not use portable relative asset paths");
}

const builtAssetDirectory = resolve(appDirectory, "dist", "assets");
const builtCssFiles = (await readdir(builtAssetDirectory))
  .filter((file) => file.endsWith(".css"));
const builtCss = (await Promise.all(
  builtCssFiles.map((file) => readFile(resolve(builtAssetDirectory, file), "utf8")),
)).join("\n");
if (!builtCss.includes("font-size:30px") || !builtCss.includes("#0ea5e9")) {
  throw new Error("Tailwind utilities from the generated slides were not included in the build");
}

runNpm(
  ["run", "build:single", "--", "--output", "single-file"],
  appDirectory,
);
const singleFileEntries = await readdir(resolve(appDirectory, "single-file"));
if (singleFileEntries.length !== 1 || singleFileEntries[0] !== "index.html") {
  throw new Error("Single-file build contained files other than index.html");
}
const singleFileHtml = await readFile(
  resolve(appDirectory, "single-file", "index.html"),
  "utf8",
);
if (!singleFileHtml.includes("<style>")
  || !singleFileHtml.includes("data:font/woff2;base64,")
  || /<script\b[^>]*\bsrc=|<link\b[^>]*\brel=["']stylesheet["']/i.test(singleFileHtml)) {
  throw new Error("Single-file HTML did not inline its scripts, styles, and fonts");
}

const pagesWorkflow = await readFile(
  resolve(appDirectory, ".github", "workflows", "pages.yml"),
  "utf8",
);
if (!pagesWorkflow.includes("actions/checkout@v6")
  || !pagesWorkflow.includes("actions/setup-node@v7")
  || !pagesWorkflow.includes("cache: npm")
  || !pagesWorkflow.includes("npm ci")
  || !pagesWorkflow.includes("actions/configure-pages@v6")
  || !pagesWorkflow.includes("actions/upload-pages-artifact@v5")
  || !pagesWorkflow.includes("actions/deploy-pages@v5")
  || !pagesWorkflow.includes("path: dist")) {
  throw new Error("Generated project did not include the GitHub Pages workflow");
}

runNpm(["run", "pdf", "--", "--output", "output/installed-package.pdf"], appDirectory);
runNpm(["run", "pptx", "--", "--output", "output/installed-package.pptx"], appDirectory);
runNpm(["exec", "--", "frameseq", "new", "extra.slides.ts"], appDirectory);

for (const expected of [
  resolve(appDirectory, "dist", "index.html"),
  resolve(appDirectory, "single-file", "index.html"),
  resolve(appDirectory, ".github", "workflows", "pages.yml"),
  resolve(appDirectory, "output", "installed-package.pdf"),
  resolve(appDirectory, "output", "installed-package.pptx"),
  resolve(appDirectory, "extra.slides.ts"),
]) {
  if (!existsSync(expected)) throw new Error(`Expected package test output is missing: ${expected}`);
}

console.log("Package test passed: packed install, project creation, types, layout checks, imports, portable and single-file HTML, GitHub Pages, PDF, and PPTX.");
