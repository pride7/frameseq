#!/usr/bin/env node

/**
 * Build FrameSeq as an application that needs nothing installed first: a Node.js runtime, the
 * FrameSeq package with its dependencies and the Typst compiler, a browser for exports where
 * the system may lack one, and the launchers and installer each operating system expects.
 *
 *   node scripts/app-bundle.mjs [--platform win32|darwin|linux] [--arch x64|arm64]
 *                               [--node <version>] [--out <dir>] [--with-browser] [--no-window]
 *
 * Windows gets an installer (when Inno Setup is installed) and a portable zip, macOS an app in a
 * disk image, and Linux an archive with an install script. Each runs `frameseq shortcut` with
 * its own runtime, so the Studio opens from the Start menu, Applications, or the app menu.
 *
 * The Studio opens in the app's own window, built from desktop/ with Rust, whose top bar is the
 * title bar. Without Rust, or with --no-window, the app opens it in a browser's app window as
 * `frameseq studio` does. Another platform or processor than this computer's can be targeted:
 * npm and the downloads choose their binaries by the target, but the window, the installer, and
 * the disk image need their own OS.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, cp, mkdir, readdir, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { iconIcns, iconIco, iconPng } from "./app-icon.mjs";
import { appNodeVersion, appRuntime } from "./app-runtime.mjs";
import { buildDesktopWindow, canBuildDesktopWindow } from "./desktop-build.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const platform = option("--platform", process.platform);
const arch = option("--arch", process.arch);
const nodeVersion = option("--node", appNodeVersion).replace(/^v/, "");
const withBrowser = process.argv.includes("--with-browser") || platform !== "win32";
const withWindow = !process.argv.includes("--no-window");
const outRoot = resolve(option("--out", resolve(packageRoot, "output", "app")));
const target = `${platform === "win32" ? "win" : platform === "darwin" ? "mac" : "linux"}-${arch}`;
const work = resolve(outRoot, target);
const stage = resolve(work, "FrameSeq");
const version = manifest.version;

if (!["win32", "darwin", "linux"].includes(platform) || !["x64", "arm64"].includes(arch)) {
  throw new Error(`The app is built for win32, darwin, or linux on x64 or arm64, not ${platform}-${arch}`);
}

// Windows has its own tar, which reads zip files and drive letters; another tar on the PATH,
// such as Git's, may do neither.
const tar = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32" && /^(npm|npx)$/.test(command),
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  return result;
}

function step(message) {
  console.log(`\n▸ ${message}`);
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function folderSize(path) {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) total += await folderSize(child);
    else if (entry.isFile()) total += (await stat(child)).size;
  }
  return total;
}

const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Move a folder just unpacked. Windows refuses to rename one that a virus scanner or a file
 * watcher holds, such as a development server's, so it is copied instead.
 */
async function moveFolder(from, to) {
  try {
    await rename(from, to);
  } catch (error) {
    if (!["EPERM", "EBUSY", "EACCES"].includes(error?.code)) throw error;
    await cp(from, to, { recursive: true, verbatimSymlinks: true });
  }
}

await rm(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
await mkdir(stage, { recursive: true });

// ── FrameSeq and its dependencies ────────────────────────────────────────────────────────
step(`Packing @pride7/frameseq ${version}`);
const packDirectory = resolve(work, "pack");
await mkdir(packDirectory, { recursive: true });
run("npm", ["pack", "--pack-destination", packDirectory], { cwd: packageRoot });
const tarball = (await readdir(packDirectory)).find((name) => name.endsWith(".tgz"));
run(tar, ["-xzf", join(packDirectory, tarball), "-C", packDirectory]);
const app = resolve(stage, "app");
await moveFolder(join(packDirectory, "package"), app);

step(`Installing dependencies for ${platform}-${arch}`);
// npm picks the native packages (esbuild, Rollup, Lightning CSS, Typst) by the target, so an app
// for another platform can be assembled here. Puppeteer's own browser is not downloaded.
// Install scripts run for this machine rather than the target: esbuild's checks the binary of the
// machine building the app, and fails when that is another version, so none of them run.
const npmTarget = ["--os", platform, "--cpu", arch, "--ignore-scripts"];
// The optional typesetters come along, since nobody using the app can npm install them later:
// Typst works offline, and Tectonic fetches the TeX files a LaTeX fragment needs on first use.
const typesetters = ["@myriaddreamin/typst-ts-node-compiler", "node-tectonic"]
  .map((name) => `${name}@${manifest.devDependencies[name]}`);
run("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--no-package-lock", ...npmTarget], {
  cwd: app,
  env: { PUPPETEER_SKIP_DOWNLOAD: "1" },
});
run("npm", ["install", "--no-save", "--no-audit", "--no-fund", "--no-package-lock", ...npmTarget, ...typesetters], {
  cwd: app,
  env: { PUPPETEER_SKIP_DOWNLOAD: "1" },
});

// ── The Node.js runtime ──────────────────────────────────────────────────────────────────
step(`Adding Node.js ${nodeVersion}`);
const nodePlatform = platform === "win32" ? "win" : platform;
const archive = `node-v${nodeVersion}-${nodePlatform}-${arch}.${platform === "win32" ? "zip" : platform === "darwin" ? "tar.gz" : "tar.xz"}`;
const base = `https://nodejs.org/dist/v${nodeVersion}`;
const sums = (await download(`${base}/SHASUMS256.txt`)).toString("utf8");
const expected = sums.split("\n").find((line) => line.trim().endsWith(` ${archive}`))?.split(/\s+/)[0];
if (!expected) throw new Error(`Node.js ${nodeVersion} has no ${archive}`);
const nodeArchive = await download(`${base}/${archive}`);
const actual = createHash("sha256").update(nodeArchive).digest("hex");
if (actual !== expected) throw new Error(`${archive} does not match its published checksum`);
const nodeDownload = resolve(work, archive);
await writeFile(nodeDownload, nodeArchive);
const nodeExtract = resolve(work, "node-download");
await mkdir(nodeExtract, { recursive: true });
run(tar, ["-xf", nodeDownload, "-C", nodeExtract]);
const nodeFolder = join(nodeExtract, archive.replace(/\.(zip|tar\.gz|tar\.xz)$/, ""));
const runtime = resolve(stage, "node");
await mkdir(platform === "win32" ? runtime : join(runtime, "bin"), { recursive: true });
if (platform === "win32") {
  await cp(join(nodeFolder, "node.exe"), join(runtime, "node.exe"));
} else {
  await cp(join(nodeFolder, "bin", "node"), join(runtime, "bin", "node"));
  await chmod(join(runtime, "bin", "node"), 0o755);
}
await cp(join(nodeFolder, "LICENSE"), join(runtime, "LICENSE"));

// ── The Studio's window ──────────────────────────────────────────────────────────────────
// The runtime says which published versions the app can take as updates; an app built on
// another Node.js than the one published versions expect takes none.
const runtimeId = nodeVersion === appNodeVersion ? appRuntime() : `${appRuntime()}+node${nodeVersion}`;
const bundle = { version, node: nodeVersion, platform, arch, runtime: runtimeId };
// Where the window goes: beside the app's folders, or as the macOS app's executable.
const windowName = platform === "win32" ? "FrameSeq Studio.exe" : platform === "darwin" ? "FrameSeq Studio" : "frameseq-studio";
let windowBinary;
if (withWindow && platform === process.platform && canBuildDesktopWindow()) {
  step("Building the Studio's window");
  windowBinary = await buildDesktopWindow({ arch });
  // frameseq-bundle.json names it from app/, so `frameseq studio` opens it too.
  bundle.window = platform === "darwin" ? `../../../MacOS/${windowName}` : `../${windowName}`;
  if (platform !== "darwin") {
    await cp(windowBinary, join(stage, windowName));
    if (platform === "linux") await chmod(join(stage, windowName), 0o755);
  }
} else if (withWindow) {
  console.log(platform === process.platform
    ? "\nRust was not found, so the Studio will open in a browser's app window."
    : `\nThe Studio's window is built on ${platform} itself; this app opens the Studio in a browser's app window.`);
}

// ── A browser for exports and checks ─────────────────────────────────────────────────────
if (withBrowser) {
  step("Adding a headless browser for exports");
  const browsers = await import(pathToFileURL(join(app, "node_modules", "@puppeteer", "browsers", "lib", "esm", "main.js")).href);
  const revisions = await import(pathToFileURL(join(app, "node_modules", "puppeteer-core", "lib", "esm", "puppeteer", "revisions.js")).href);
  const browserPlatform = platform === "win32"
    ? (arch === "x64" ? browsers.BrowserPlatform.WIN64 : browsers.BrowserPlatform.WIN32)
    : platform === "darwin"
      ? (arch === "arm64" ? browsers.BrowserPlatform.MAC_ARM : browsers.BrowserPlatform.MAC)
      : (arch === "arm64" ? browsers.BrowserPlatform.LINUX_ARM : browsers.BrowserPlatform.LINUX);
  const installed = await browsers.install({
    browser: browsers.Browser.CHROMEHEADLESSSHELL,
    buildId: revisions.PUPPETEER_REVISIONS["chrome-headless-shell"],
    platform: browserPlatform,
    cacheDir: resolve(stage, "browser"),
  });
  bundle.browser = relative(app, installed.executablePath).replaceAll("\\", "/");
}
// Its presence tells FrameSeq it runs from the app: where its browser is, and where to cache.
await writeFile(join(app, "frameseq-bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`);

// ── Launchers ────────────────────────────────────────────────────────────────────────────
step("Writing launchers");
const bin = resolve(stage, "bin");
await mkdir(bin, { recursive: true });
if (platform === "win32") {
  await writeFile(join(bin, "frameseq.cmd"), '@echo off\r\n"%~dp0..\\node\\node.exe" "%~dp0..\\app\\scripts\\app-launch.mjs" %*\r\n');
  await writeFile(join(stage, "FrameSeq.ico"), iconIco());
} else {
  const launcher = join(bin, "frameseq");
  await writeFile(launcher, [
    "#!/bin/sh",
    "# Follow a symlink such as ~/.local/bin/frameseq back to the app it belongs to.",
    "SELF=\"$0\"",
    "while [ -L \"$SELF\" ]; do",
    "  LINK=\"$(readlink \"$SELF\")\"",
    "  case \"$LINK\" in /*) SELF=\"$LINK\" ;; *) SELF=\"$(dirname \"$SELF\")/$LINK\" ;; esac",
    "done",
    "ROOT=\"$(cd \"$(dirname \"$SELF\")/..\" && pwd)\"",
    "exec \"$ROOT/node/bin/node\" \"$ROOT/app/scripts/app-launch.mjs\" \"$@\"",
    "",
  ].join("\n"));
  await chmod(launcher, 0o755);
  await writeFile(join(stage, "frameseq.png"), iconPng(256));
}
await writeFile(join(stage, "README.txt"), [
  `FrameSeq ${version}`,
  "",
  "FrameSeq Studio: open it from the Start menu, Applications, or the applications menu.",
  ...(windowBinary ? [`It opens in a window of its own, ${windowName}, or in a browser's app window where the system refuses that.`] : []),
  "The frameseq command: bin/frameseq, the same command an npm install provides.",
  "",
  "Exports render with the browser in browser/ when there is one, and otherwise with Chrome or",
  "Edge on this computer. Set FRAMESEQ_BROWSER to the path of another Chromium browser to use it.",
  "",
  "Licences: FrameSeq (MIT) in app/LICENSE, Node.js in node/LICENSE, and each dependency in its",
  "folder under app/node_modules.",
  "",
].join(platform === "win32" ? "\r\n" : "\n"));

const appSize = await folderSize(stage);
console.log(`\nThe app takes ${megabytes(appSize)} in ${stage}`);

// ── Packages ─────────────────────────────────────────────────────────────────────────────
const artifacts = [];

if (platform === "win32") {
  step("Packing the portable zip");
  const zip = resolve(outRoot, `FrameSeq-${version}-${target}.zip`);
  await rm(zip, { force: true });
  run(tar, ["-a", "-c", "-f", zip, "-C", work, "FrameSeq"]);
  artifacts.push(zip);

  const compiler = [
    process.env.INNO_SETUP_COMPILER,
    join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Inno Setup 6", "ISCC.exe"),
    join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Inno Setup 6", "ISCC.exe"),
    join(process.env.LOCALAPPDATA ?? "", "Programs", "Inno Setup 6", "ISCC.exe"),
    // Package managers such as Scoop and Chocolatey put it on the PATH instead.
    ...(process.env.PATH ?? "").split(delimiter).filter(Boolean).map((directory) => join(directory, "ISCC.exe")),
  ].find((candidate) => candidate && existsSync(candidate));
  const script = resolve(work, "frameseq.iss");
  await writeFile(script, innoSetupScript());
  if (compiler && process.platform === "win32") {
    step("Compiling the installer");
    run(compiler, ["/Q", script]);
    artifacts.push(resolve(outRoot, `FrameSeq-Setup-${version}-${target}.exe`));
  } else {
    console.log(`\nInno Setup was not found, so no installer was made; ${script} compiles to one with ISCC.`);
  }
}

if (platform === "darwin") {
  step("Making the macOS app");
  const dmgRoot = resolve(work, "dmg");
  const bundleRoot = resolve(dmgRoot, "FrameSeq Studio.app", "Contents");
  await mkdir(join(bundleRoot, "MacOS"), { recursive: true });
  await mkdir(join(bundleRoot, "Resources"), { recursive: true });
  await cp(stage, join(bundleRoot, "Resources", "frameseq"), { recursive: true, verbatimSymlinks: true });
  await writeFile(join(bundleRoot, "Resources", "FrameSeq.icns"), iconIcns());
  await writeFile(join(bundleRoot, "Info.plist"), macInfoPlist());
  const executable = join(bundleRoot, "MacOS", "FrameSeq Studio");
  if (windowBinary) {
    // The window finds Node.js and FrameSeq in ../Resources/frameseq by itself.
    await cp(windowBinary, executable);
  } else {
    await writeFile(executable, [
      "#!/bin/sh",
      "ROOT=\"$(cd \"$(dirname \"$0\")/../Resources/frameseq\" && pwd)\"",
      "cd \"$HOME\"",
      "exec \"$ROOT/node/bin/node\" \"$ROOT/app/scripts/app-launch.mjs\" studio --background",
      "",
    ].join("\n"));
  }
  await chmod(executable, 0o755);
  await symlink("/Applications", join(dmgRoot, "Applications")).catch(() => undefined);
  if (process.platform === "darwin") {
    const dmg = resolve(outRoot, `FrameSeq-${version}-${target}.dmg`);
    await rm(dmg, { force: true });
    run("hdiutil", ["create", "-volname", "FrameSeq", "-srcfolder", dmgRoot, "-ov", "-format", "UDZO", dmg]);
    artifacts.push(dmg);
  } else {
    const zip = resolve(outRoot, `FrameSeq-${version}-${target}.zip`);
    run(tar, ["-a", "-c", "-f", zip, "-C", dmgRoot, "FrameSeq Studio.app"]);
    artifacts.push(zip);
    console.log("\nA disk image is made on macOS; this computer packed the app in a zip instead.");
  }
}

if (platform === "linux") {
  step("Packing the Linux archive");
  const installer = join(stage, "install.sh");
  await writeFile(installer, [
    "#!/bin/sh",
    "# Install FrameSeq for this user: the app under ~/.local/share, the frameseq command in",
    "# ~/.local/bin, and FrameSeq Studio in the applications menu. Run it again to update.",
    "set -e",
    "SOURCE=\"$(cd \"$(dirname \"$0\")\" && pwd)\"",
    "TARGET=\"${XDG_DATA_HOME:-$HOME/.local/share}/frameseq\"",
    "if [ \"$SOURCE\" != \"$TARGET\" ]; then",
    "  rm -rf \"$TARGET\"",
    "  mkdir -p \"$(dirname \"$TARGET\")\"",
    "  cp -R \"$SOURCE\" \"$TARGET\"",
    "fi",
    "mkdir -p \"$HOME/.local/bin\"",
    "ln -sf \"$TARGET/bin/frameseq\" \"$HOME/.local/bin/frameseq\"",
    "\"$TARGET/bin/frameseq\" shortcut",
    "echo \"FrameSeq is installed. Open FrameSeq Studio from the applications menu, or run: frameseq studio\"",
    "",
  ].join("\n"));
  await chmod(installer, 0o755);
  const archivePath = resolve(outRoot, `FrameSeq-${version}-${target}.tar.gz`);
  run(tar, ["-czf", archivePath, "-C", work, "FrameSeq"]);
  artifacts.push(archivePath);
}

await rm(packDirectory, { recursive: true, force: true });
await rm(nodeExtract, { recursive: true, force: true });
await rm(nodeDownload, { force: true });

console.log("\nBuilt:");
for (const artifact of artifacts) {
  console.log(`  ${artifact}  ${existsSync(artifact) ? megabytes((await stat(artifact)).size) : ""}`);
}

function innoSetupScript() {
  const source = stage.replaceAll("/", "\\");
  return `; Generated by scripts/app-bundle.mjs. Compile with Inno Setup 6: ISCC frameseq.iss
#define AppVersion "${version}"

[Setup]
AppId={{6B1E2C47-9A3D-4F5B-8C21-F7A9D3E4B5C6}
AppName=FrameSeq
AppVersion={#AppVersion}
AppVerName=FrameSeq {#AppVersion}
AppPublisher=pride7
AppPublisherURL=https://github.com/pride7/frameseq
AppSupportURL=https://github.com/pride7/frameseq/issues
DefaultDirName={localappdata}\\Programs\\FrameSeq
DisableDirPage=auto
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=${arch === "arm64" ? "arm64" : "x64compatible"}
ArchitecturesInstallIn64BitMode=${arch === "arm64" ? "arm64" : "x64compatible"}
ChangesEnvironment=yes
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupIconFile=${source}\\FrameSeq.ico
UninstallDisplayIcon={app}\\FrameSeq.ico
UninstallDisplayName=FrameSeq
LicenseFile=${source}\\app\\LICENSE
OutputDir=${outRoot.replaceAll("/", "\\")}
OutputBaseFilename=FrameSeq-Setup-{#AppVersion}-${target}

[Tasks]
Name: "desktopicon"; Description: "Put FrameSeq Studio on the desktop"
Name: "addtopath"; Description: "Add the frameseq command to PATH"

[Files]
Source: "${source}\\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

${nodeShortcuts()}

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
Type: filesandordirs; Name: "{localappdata}\\FrameSeq\\updates"

[Code]
{ The PATH is changed here rather than in [Registry], so it keeps the type it had. A Path stored as
  REG_SZ stays REG_SZ, and entries such as %USERPROFILE%\\bin mean what they meant before. }
const
  UserPathKey = 'Environment';
  KeyQueryValue = $0001;
  RegExpandSz = 2;

function RegOpenKeyEx(Key: Longint; SubKey: string; Options, Desired: Cardinal; var Opened: Longint): Longint;
  external 'RegOpenKeyExW@advapi32.dll stdcall';
function RegQueryValueEx(Key: Longint; Name: string; Reserved: Longint; var ValueType: Cardinal; Data: Longint; var Size: Cardinal): Longint;
  external 'RegQueryValueExW@advapi32.dll stdcall';
function RegCloseKey(Key: Longint): Longint;
  external 'RegCloseKey@advapi32.dll stdcall';

function UserPathIsExpandable: Boolean;
var
  Key: Longint;
  ValueType, Size: Cardinal;
begin
  { Windows itself stores a new Path as REG_EXPAND_SZ. }
  Result := True;
  if RegOpenKeyEx($80000001, UserPathKey, 0, KeyQueryValue, Key) <> 0 then exit;
  Size := 0;
  if RegQueryValueEx(Key, 'Path', 0, ValueType, 0, Size) = 0 then Result := ValueType = RegExpandSz;
  RegCloseKey(Key);
end;

procedure WriteUserPath(Value: string; Expandable: Boolean);
begin
  if Expandable then RegWriteExpandStringValue(HKEY_CURRENT_USER, UserPathKey, 'Path', Value)
  else RegWriteStringValue(HKEY_CURRENT_USER, UserPathKey, 'Path', Value);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Current, Folder: string;
begin
  if (CurStep <> ssPostInstall) or not WizardIsTaskSelected('addtopath') then exit;
  Folder := ExpandConstant('{app}\\bin');
  if not RegQueryStringValue(HKEY_CURRENT_USER, UserPathKey, 'Path', Current) then Current := '';
  if Pos(';' + Uppercase(Folder) + ';', ';' + Uppercase(Current) + ';') > 0 then exit;
  if (Current <> '') and (Copy(Current, Length(Current), 1) <> ';') then Current := Current + ';';
  WriteUserPath(Current + Folder, UserPathIsExpandable);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Current, Folder, Wrapped: string;
  Index: Integer;
begin
  if CurUninstallStep <> usPostUninstall then exit;
  if not RegQueryStringValue(HKEY_CURRENT_USER, UserPathKey, 'Path', Current) then exit;
  Folder := ExpandConstant('{app}\\bin');
  { Wrapped in semicolons, the entry is found wherever it stands, first, last, or between others. }
  Wrapped := ';' + Current + ';';
  Index := Pos(';' + Uppercase(Folder) + ';', Uppercase(Wrapped));
  if Index = 0 then exit;
  Delete(Wrapped, Index, Length(Folder) + 1);
  Current := Copy(Wrapped, 2, Length(Wrapped) - 2);
  if Current = '' then RegDeleteValue(HKEY_CURRENT_USER, UserPathKey, 'Path')
  else WriteUserPath(Current, UserPathIsExpandable);
end;
`;
}

/**
 * Shortcuts that start the Studio with Node.js in the background, which opens it in the app's
 * window. Node.js is signed and the window is not, so where Smart App Control refuses the
 * window, the Studio still opens, in a browser's app window.
 */
function nodeShortcuts() {
  return `[Icons]
Name: "{autoprograms}\\FrameSeq Studio"; Filename: "{app}\\node\\node.exe"; Parameters: """{app}\\app\\scripts\\app-launch.mjs"" studio --background"; WorkingDir: "{userdocs}"; IconFilename: "{app}\\FrameSeq.ico"; Comment: "Write and present slides with FrameSeq"; Flags: runminimized
Name: "{autodesktop}\\FrameSeq Studio"; Filename: "{app}\\node\\node.exe"; Parameters: """{app}\\app\\scripts\\app-launch.mjs"" studio --background"; WorkingDir: "{userdocs}"; IconFilename: "{app}\\FrameSeq.ico"; Comment: "Write and present slides with FrameSeq"; Flags: runminimized; Tasks: desktopicon

[Run]
Filename: "{app}\\node\\node.exe"; Parameters: """{app}\\app\\scripts\\app-launch.mjs"" studio --background"; WorkingDir: "{userdocs}"; Description: "Open FrameSeq Studio"; Flags: postinstall nowait skipifsilent runhidden
`;
}

function macInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>FrameSeq Studio</string>
  <key>CFBundleDisplayName</key><string>FrameSeq Studio</string>
  <key>CFBundleIdentifier</key><string>io.github.pride7.frameseq</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleExecutable</key><string>FrameSeq Studio</string>
  <key>CFBundleIconFile</key><string>FrameSeq</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`;
}
