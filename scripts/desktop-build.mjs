#!/usr/bin/env node

/**
 * Build the FrameSeq app's own window for the Studio, the Tauri program in desktop/, and print
 * where the binary is. It needs Rust, and on Linux WebKitGTK's development files.
 *
 *   node scripts/desktop-build.mjs [--arch x64|arm64] [--debug] [--check]
 *
 * scripts/app-bundle.mjs runs it for the app; on its own it builds a window to try the Studio in:
 *   FRAMESEQ_DESKTOP_CLI=scripts/frameseq.mjs desktop/target/release/frameseq-studio
 */
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { iconIco, iconPng } from "./app-icon.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktop = resolve(packageRoot, "desktop");

/** The Rust target for another processor than this computer's, as a Mac builds for both kinds. */
function rustTarget(platform, arch) {
  if (arch === process.arch) return undefined;
  const cpu = arch === "arm64" ? "aarch64" : "x86_64";
  if (platform === "darwin") return `${cpu}-apple-darwin`;
  if (platform === "win32") return `${cpu}-pc-windows-msvc`;
  return `${cpu}-unknown-linux-gnu`;
}

/**
 * Build the window for this computer's system, and resolve to the binary's path. With `check`,
 * only compile it, with the lock file as it is, as CI does.
 */
export async function buildDesktopWindow({ arch = process.arch, debug = false, check = false } = {}) {
  const icons = join(desktop, "icons");
  await mkdir(icons, { recursive: true });
  await writeFile(join(icons, "icon.ico"), iconIco());
  await writeFile(join(icons, "icon.png"), iconPng(256));

  const target = rustTarget(process.platform, arch);
  const args = check
    ? ["check", "--features", "custom-protocol", "--locked"]
    : ["build", "--features", "custom-protocol", ...(debug ? [] : ["--release"]), ...(target ? ["--target", target] : [])];
  const result = spawnSync("cargo", args, { cwd: desktop, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`cargo ${args.join(" ")} exited with ${result.status}`);
  const binary = `frameseq-studio${process.platform === "win32" ? ".exe" : ""}`;
  return join(desktop, "target", ...(target ? [target] : []), debug ? "debug" : "release", binary);
}

/** Whether this computer can build the window: Rust is installed. */
export function canBuildDesktopWindow() {
  const result = spawnSync("cargo", ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const index = process.argv.indexOf("--arch");
  const check = process.argv.includes("--check");
  const binary = await buildDesktopWindow({
    arch: index >= 0 ? process.argv[index + 1] : process.arch,
    debug: process.argv.includes("--debug"),
    check,
  });
  if (!check) console.log(`\nFrameSeq Studio's window: ${binary}`);
}
