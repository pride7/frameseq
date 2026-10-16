#!/usr/bin/env node

// FrameSeq's tests, in groups that take a few minutes each, so CI can run the groups side by side.
// With no arguments every group runs, one after another, as `npm test` does; name groups to run
// only those, as `node scripts/test-suite.mjs studio exports`. A group run on its own builds the
// package first, which its tests load; the core group builds everything as its first step.

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const test = (name) => `node scripts/${name}.mjs`;

export const groups = [
  {
    name: "core",
    commands: [
      "npm run build",
      "npm run docs:check",
      test("section-layout-test"),
      "npm run vscode:check",
      test("puppeteer-options-test"),
      test("theme-test"),
      test("smoke-test"),
      test("beamer-smoke-test"),
      test("minimal-academic-smoke-test"),
      test("layout-check-test"),
      test("anchor-test"),
      test("shapes-test"),
      test("region-path-test"),
      test("notes-test"),
      test("cjk-test"),
      test("flow-layout-test"),
      test("single-file-test"),
      test("source-map-test"),
      test("source-edit-test"),
      test("remote-control-test"),
    ],
  },
  {
    name: "studio",
    commands: [
      test("studio-test"),
      test("studio-remote-test"),
      test("studio-screens-test"),
      test("studio-insert-test"),
      test("studio-typing-test"),
      test("studio-handles-test"),
      test("studio-cover-test"),
      test("studio-page-test"),
      test("studio-menu-test"),
      test("studio-files-test"),
    ],
  },
  {
    name: "app",
    commands: [
      test("studio-updates-test"),
      test("app-update-test"),
      test("template-test"),
      test("master-test"),
      test("user-template-test"),
      test("studio-desktop-test"),
      test("studio-terminal-test"),
      test("studio-assistant-test"),
      test("mcp-test"),
    ],
  },
  {
    name: "exports",
    commands: [
      test("pptx-test"),
      test("typst-export-test"),
      test("poster-test"),
      test("figure-test"),
      test("objects-test"),
      "npm run gallery:check",
    ],
  },
];

function run(command) {
  const started = Date.now();
  const result = spawnSync(command, { cwd: packageRoot, shell: true, stdio: "inherit" });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.status !== 0) {
    console.error(`\nFailed after ${seconds} s: ${command}`);
    process.exit(result.status ?? 1);
  }
  console.log(`[${seconds} s] ${command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const names = process.argv.slice(2);
  const unknown = names.filter((name) => !groups.some((group) => group.name === name));
  if (unknown.length > 0) {
    console.error(`No test group named ${unknown.join(", ")}; the groups are ${groups.map((group) => group.name).join(", ")}.`);
    process.exit(2);
  }
  const chosen = names.length === 0 ? groups : groups.filter((group) => names.includes(group.name));
  let built = false;
  for (const group of chosen) {
    console.log(`\n── ${group.name} tests ──`);
    if (group.name !== "core" && !built) run("npm run build:package");
    built = true;
    for (const command of group.commands) run(command);
  }
}
