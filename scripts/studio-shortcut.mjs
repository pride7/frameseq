import { spawn } from "node:child_process";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { iconIcns, iconIco, iconPng } from "./app-icon.mjs";
import { bundledStudioWindow } from "./browsers.mjs";
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

const consoleHost = () => join(process.env.SystemRoot ?? "C:\\Windows", "System32", "conhost.exe");

/**
 * Open .fsq files in the Studio when they are double-clicked, with FrameSeq's icon, or with
 * `remove` stop doing so. The keys are the person's own, under HKEY_CURRENT_USER, as the app's
 * setup writes them. FRAMESEQ_FILE_CLASSES names another key to write them under, for testing;
 * a test that keeps its shortcut in FRAMESEQ_SHORTCUT_DIR leaves the registry alone otherwise.
 */
async function windowsFileAssociation({ open, icon, remove }) {
  const classes = process.env.FRAMESEQ_FILE_CLASSES ?? (process.env.FRAMESEQ_SHORTCUT_DIR ? undefined : "Software\\Classes");
  if (!classes) return;
  await powershell([
    "$ErrorActionPreference = 'Stop'",
    "$user = [Microsoft.Win32.Registry]::CurrentUser",
    "$classes = $env:FRAMESEQ_CLASSES",
    "$kind = 'FrameSeq.Presentation'",
    "if ($env:FRAMESEQ_REMOVE -eq '1') {",
    "  $extension = $user.OpenSubKey(\"$classes\\.fsq\", $true)",
    "  if ($extension) {",
    // .fsq may have been handed to another program since; it is left with it.
    "    if ($extension.GetValue('') -eq $kind) { $extension.DeleteValue('', $false) }",
    "    $with = $extension.OpenSubKey('OpenWithProgids', $true)",
    "    if ($with) { $with.DeleteValue($kind, $false); $with.Close() }",
    "    $extension.Close()",
    "  }",
    "  $user.DeleteSubKeyTree(\"$classes\\$kind\", $false)",
    "} else {",
    "  $extension = $user.CreateSubKey(\"$classes\\.fsq\")",
    "  $extension.SetValue('', $kind)",
    "  $extension.CreateSubKey('OpenWithProgids').SetValue($kind, '')",
    "  $type = $user.CreateSubKey(\"$classes\\$kind\")",
    "  $type.SetValue('', 'FrameSeq presentation')",
    "  $type.CreateSubKey('DefaultIcon').SetValue('', $env:FRAMESEQ_ICON)",
    "  $type.CreateSubKey('shell\\open\\command').SetValue('', $env:FRAMESEQ_OPEN)",
    "}",
    // Explorer shows the new icon at once when told the associations changed.
    "try {",
    "  Add-Type -Namespace FrameSeq -Name Shell -MemberDefinition '[DllImport(\"shell32.dll\")] public static extern void SHChangeNotify(int e, uint f, System.IntPtr a, System.IntPtr b);'",
    "  [FrameSeq.Shell]::SHChangeNotify(0x08000000, 0, [System.IntPtr]::Zero, [System.IntPtr]::Zero)",
    "} catch {}",
  ].join("\n"), {
    FRAMESEQ_CLASSES: classes,
    FRAMESEQ_REMOVE: remove ? "1" : "0",
    FRAMESEQ_ICON: icon,
    FRAMESEQ_OPEN: open,
  });
}

async function windowsShortcut({ node, cli, window, remove }) {
  const links = (await windowsFolders()).map((folder) => join(folder, `${title}.lnk`));
  const icon = join(configDirectory(), "FrameSeq.ico");
  const open = window
    ? `"${window}" "%1"`
    : `"${consoleHost()}" --headless "${node}" "${cli}" studio "%1" --background`;
  if (remove) {
    await windowsFileAssociation({ open, icon, remove });
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
    "  $link.Save()",
    "}",
  ].join("\n"), {
    FRAMESEQ_LINKS: links.join("\n"),
    // Node.js only starts the Studio in the background, so Windows' own console host runs it
    // with no console. Windows 11 shows a console in Windows Terminal, which ignores a
    // shortcut's "Run: Minimised", so a shortcut straight to node.exe opened a black window.
    FRAMESEQ_TARGET: window ?? consoleHost(),
    FRAMESEQ_ARGUMENTS: window ? "" : `--headless "${node}" "${cli}" studio --background`,
    FRAMESEQ_ICON: icon,
    FRAMESEQ_DESCRIPTION: description,
  });
  await windowsFileAssociation({ open, icon, remove });
  return links;
}

const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

const xmlEscape = (value) => value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character]);

async function macShortcut({ node, cli, window, remove }) {
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
  const command = window ? shellQuote(window) : `${shellQuote(node)} ${shellQuote(cli)} studio --background`;
  await writeFile(launcher, `#!/bin/sh\ncd "$HOME" || exit 1\nexec ${command}\n`, "utf8");
  await chmod(launcher, 0o755);
  await writeFile(join(contents, "Resources", "FrameSeq.icns"), iconIcns());
  return [bundle];
}

/** One argument of a desktop entry's Exec line: quoted, then escaped once more as a string value. */
const desktopArgument = (value) => `"${value.replace(/[\\"`$]/g, (character) => `\\${character}`)}"`
  .replace(/\\/g, "\\\\")
  .replace(/%/g, "%%");

async function linuxShortcut({ node, cli, window, remove }) {
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
    window ? `Exec=${desktopArgument(window)}` : `Exec=${[node, cli].map(desktopArgument).join(" ")} studio --background`,
    `Icon=${icon}`,
    "Terminal=false",
    "Categories=Office;Presentation;",
    "",
  ].join("\n"), "utf8");
  await chmod(entry, 0o755);
  return [entry];
}

/**
 * Write, or with `remove` delete, the Studio's shortcut; resolves to the paths it touched. In
 * the FrameSeq app on macOS and Linux it opens the app's own window, which starts the Studio
 * itself. On Windows it runs Node.js, which is signed, and opens the window from there, since
 * Smart App Control may refuse the window, which is not.
 */
export function studioShortcut({ cli, remove = false }) {
  const window = process.platform === "win32" ? undefined : bundledStudioWindow();
  const options = { node: process.execPath, cli, window, remove };
  if (process.platform === "win32") return windowsShortcut(options);
  if (process.platform === "darwin") return macShortcut(options);
  return linuxShortcut(options);
}
