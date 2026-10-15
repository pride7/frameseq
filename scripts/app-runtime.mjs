#!/usr/bin/env node

/**
 * The FrameSeq app's runtime: what the app ships besides the FrameSeq package and its
 * dependencies, and an update therefore cannot replace. That is Node.js, the Studio's window
 * built from desktop/, the launchers, installer, and layout app-bundle.mjs makes, and the entry
 * app-launch.mjs. Its fingerprint goes into the app, as `runtime` in frameseq-bundle.json, and
 * into the package published to npm, as `appRuntime`; an app takes a version as an update only
 * when the two agree.
 *
 *   node scripts/app-runtime.mjs            print the fingerprint
 *   node scripts/app-runtime.mjs --stamp    write it into package.json, as publishing does
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The Node.js the app ships: an LTS release, the same line the CLI is tested on. */
export const appNodeVersion = "24.14.0";

const inputs = [
  "desktop/Cargo.toml",
  "desktop/Cargo.lock",
  "desktop/build.rs",
  "desktop/tauri.conf.json",
  "desktop/capabilities",
  "desktop/splash",
  "desktop/src",
  "scripts/app-bundle.mjs",
  "scripts/app-launch.mjs",
];

function files(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).sort().flatMap((name) => files(join(path, name)));
}

export function appRuntime(root = packageRoot) {
  const hash = createHash("sha256").update(`node ${appNodeVersion}\n`);
  for (const file of inputs.flatMap((input) => files(join(root, input)))) {
    // Git hands Windows a CRLF checkout and Linux an LF one; both must agree.
    const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    hash.update(`${relative(root, file).replaceAll("\\", "/")}\0${text}\0`);
  }
  return hash.digest("hex").slice(0, 16);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runtime = appRuntime();
  if (process.argv.includes("--stamp")) {
    const file = join(packageRoot, "package.json");
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    manifest.appRuntime = runtime;
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`package.json: appRuntime ${runtime}`);
  } else {
    console.log(runtime);
  }
}
