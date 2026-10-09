import { spawn } from "node:child_process";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { iconIcns, iconIco, iconPng } from "./app-icon.mjs";
import { configDirectory } from "./studio-files.mjs";

/**
 * A shortcut that opens FrameSeq Studio like any other program: from the Start menu and the
 * desktop on Windows, from Applications on macOS, and from the applications menu on Linux. It
 * starts the Studio in the background, on its start page, and the Studio stops when its window
 * closes. FRAMESEQ_SHORTCUT_DIR puts the shortcut in one folder instead, for testing.
 */

const title = "FrameSeq Studio";
const description = "Write and present slides with FrameSeq";

function powershell(script, environment) {
  return new Promise((resolveRun, rejectRun) => {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
      env: { ...process.env, ...environment },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) resolveRun(stdout);
      else rejectRun(new Error(`PowerShell could not write the shortcut:\n${stderr.replace(/#< CLIXML\s*/, "").trim()}`));
    });
  });
}

/** The folders a Windows shortcut goes in, asked of Windows, since Desktop may live in OneDrive. */
async function windowsFolders() {
  if (process.env.FRAMESEQ_SHORTCUT_DIR) return [process.env.FRAMESEQ_SHORTCUT_DIR];
  const output = await powershell([
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "[Console]::Out.Write([Environment]::GetFolderPath('Programs') + \"`n\" + [Environment]::GetFolderPath('Desktop'))",
  ].join("\n"));
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

async function windowsShortcut({ node, cli, remove }) {
  const links = (await windowsFolders()).map((folder) => join(folder, `${title}.lnk`));
  const icon = join(configDirectory(), "FrameSeq.ico");
  if (remove) {
    await Promise.all([...links, icon].map((path) => rm(path, { force: true })));
    return links;
  }
  await mkdir(configDirectory(), { recursive: true });
  await writeFile(icon, iconIco());
  await powershell([
    "$ErrorActionPreference = 'Stop'",
    "$shell = New-Object -ComObject WScript.Shell",
    "foreach ($path in ($env:FRAMESEQ_LINKS -split \"`n\")) {",
    "  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $path) | Out-Null",
    "  $link = $shell.CreateShortcut($path)",
    "  $link.TargetPath = $env:FRAMESEQ_TARGET",
    "  $link.Arguments = $env:FRAMESEQ_ARGUMENTS",
    "  $link.WorkingDirectory = $env:USERPROFILE",
    "  $link.IconLocation = $env:FRAMESEQ_ICON + ',0'",
    "  $link.Description = $env:FRAMESEQ_DESCRIPTION",
    // Minimised: the console only starts the Studio in the background, then closes.
    "  $link.WindowStyle = 7",
    "  $link.Save()",
    "}",
  ].join("\n"), {
    FRAMESEQ_LINKS: links.join("\n"),
    FRAMESEQ_TARGET: node,
    FRAMESEQ_ARGUMENTS: `"${cli}" studio --background`,
    FRAMESEQ_ICON: icon,
    FRAMESEQ_DESCRIPTION: description,
  });
  return links;
}

const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

const xmlEscape = (value) => value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character]);

async function macShortcut({ node, cli, remove }) {
  const bundle = join(process.env.FRAMESEQ_SHORTCUT_DIR ?? join(homedir(), "Applications"), `${title}.app`);
  await rm(bundle, { recursive: true, force: true });
  if (remove) return [bundle];
  const contents = join(bundle, "Contents");
  await mkdir(join(contents, "MacOS"), { recursive: true });
  await mkdir(join(contents, "Resources"), { recursive: true });
  await writeFile(join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${xmlEscape(title)}</string>
  <key>CFBundleDisplayName</key><string>${xmlEscape(title)}</string>
  <key>CFBundleIdentifier</key><string>io.github.pride7.frameseq.studio</string>
  <key>CFBundleExecutable</key><string>${xmlEscape(title)}</string>
  <key>CFBundleIconFile</key><string>FrameSeq</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
`, "utf8");
  const launcher = join(contents, "MacOS", title);
  await writeFile(launcher, `#!/bin/sh\ncd "$HOME" || exit 1\nexec ${shellQuote(node)} ${shellQuote(cli)} studio --background\n`, "utf8");
  await chmod(launcher, 0o755);
  await writeFile(join(contents, "Resources", "FrameSeq.icns"), iconIcns());
  return [bundle];
}

/** One argument of a desktop entry's Exec line: quoted, then escaped once more as a string value. */
const desktopArgument = (value) => `"${value.replace(/[\\"`$]/g, (character) => `\\${character}`)}"`
  .replace(/\\/g, "\\\\")
  .replace(/%/g, "%%");

async function linuxShortcut({ node, cli, remove }) {
  const folder = process.env.FRAMESEQ_SHORTCUT_DIR
    ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "applications");
  const entry = join(folder, "frameseq-studio.desktop");
  const icon = join(configDirectory(), "frameseq.png");
  if (remove) {
    await Promise.all([entry, icon].map((path) => rm(path, { force: true })));
    return [entry];
  }
  await mkdir(folder, { recursive: true });
  await mkdir(configDirectory(), { recursive: true });
  await writeFile(icon, iconPng(256));
  await writeFile(entry, [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${title}`,
    `Comment=${description}`,
    `Exec=${[node, cli].map(desktopArgument).join(" ")} studio --background`,
    `Icon=${icon}`,
    "Terminal=false",
    "Categories=Office;Presentation;",
    "",
  ].join("\n"), "utf8");
  await chmod(entry, 0o755);
  return [entry];
}

/** Write, or with `remove` delete, the Studio's shortcut; resolves to the paths it touched. */
export function studioShortcut({ cli, remove = false }) {
  const options = { node: process.execPath, cli, remove };
  if (process.platform === "win32") return windowsShortcut(options);
  if (process.platform === "darwin") return macShortcut(options);
  return linuxShortcut(options);
}
