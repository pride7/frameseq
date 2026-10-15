import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";

/**
 * What the Studio remembers between runs, and the operating system's own dialogs for choosing
 * a presentation or a folder. Everything here runs on the computer the Studio was started on.
 */

const recentLimit = 12;

/** Where FrameSeq keeps its settings: the platform's usual place, or FRAMESEQ_CONFIG_DIR. */
export function configDirectory(environment = process.env) {
  if (environment.FRAMESEQ_CONFIG_DIR) return resolve(environment.FRAMESEQ_CONFIG_DIR);
  if (process.platform === "win32") {
    return join(environment.APPDATA ?? join(homedir(), "AppData", "Roaming"), "FrameSeq");
  }
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "FrameSeq");
  return join(environment.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "frameseq");
}

const settingsFile = () => join(configDirectory(), "studio.json");

const samePath = (left, right) => (
  process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right
);

async function readSettings() {
  try {
    const value = JSON.parse(await readFile(settingsFile(), "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

async function writeSettings(settings) {
  await mkdir(configDirectory(), { recursive: true });
  await writeFile(settingsFile(), `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** The presentations opened most recently, newest first, leaving out any that are gone. */
export async function recentPresentations() {
  const settings = await readSettings();
  const recent = [];
  for (const item of Array.isArray(settings.recent) ? settings.recent : []) {
    if (typeof item?.path !== "string" || !await isFile(item.path)) continue;
    recent.push({ path: item.path, name: basename(item.path), folder: dirname(item.path) });
  }
  return recent;
}

/** Put a presentation first among the recent ones, and its folder first for the next one. */
export async function rememberPresentation(path) {
  const settings = await readSettings();
  const others = (Array.isArray(settings.recent) ? settings.recent : [])
    .filter((item) => typeof item?.path === "string" && !samePath(item.path, path));
  await writeSettings({
    ...settings,
    recent: [{ path, opened: new Date().toISOString() }, ...others].slice(0, recentLimit),
    folder: dirname(path),
  });
}

export async function forgetPresentation(path) {
  const settings = await readSettings();
  await writeSettings({
    ...settings,
    recent: (Array.isArray(settings.recent) ? settings.recent : [])
      .filter((item) => typeof item?.path === "string" && !samePath(item.path, path)),
  });
}

/** Where a new presentation goes unless told otherwise: where the last one went, or Documents. */
export async function defaultFolder(current) {
  const settings = await readSettings();
  const candidates = [
    typeof settings.folder === "string" ? settings.folder : undefined,
    current ? dirname(current) : undefined,
    join(homedir(), "Documents"),
    homedir(),
  ];
  for (const candidate of candidates) {
    if (candidate && await isDirectory(candidate)) return candidate;
  }
  return homedir();
}

function onPath(name) {
  return (process.env.PATH ?? "").split(delimiter).some((directory) => directory && existsSync(join(directory, name)));
}

/** Whether this computer can show a native dialog; FRAMESEQ_NO_DIALOGS=1 turns them off. */
export function dialogsAvailable() {
  if (process.env.FRAMESEQ_NO_DIALOGS === "1") return false;
  if (process.platform === "win32" || process.platform === "darwin") return true;
  return onPath("zenity") || onPath("kdialog");
}

function run(command, args, environment = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...environment },
      windowsHide: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => resolveRun({ code: -1, stdout, stderr: error.message }));
    child.on("close", (code) => resolveRun({ code: code ?? -1, stdout, stderr }));
  });
}

const prompts = {
  open: "Open a FrameSeq presentation",
  folder: "Choose the folder for the new presentation",
  image: "Choose a picture to put on the slide",
};

/** The pictures a slide can show, as the dialogs filter them. */
export const pictureExtensions = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".bmp"];

/**
 * The dialogs as a PowerShell script. The folder and the title arrive through the environment,
 * so no path is ever quoted into the script, and the answer leaves as UTF-8 whatever the
 * console's code page. A topmost owner brings the dialog in front of the Studio's window.
 */
export function windowsScript(kind) {
  const dialog = kind === "folder"
    ? [
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$dialog.Description = $env:FRAMESEQ_DIALOG_TITLE",
      "if ($dialog.PSObject.Properties['UseDescriptionForTitle']) { $dialog.UseDescriptionForTitle = $true }",
      "$dialog.ShowNewFolderButton = $true",
      "if ($env:FRAMESEQ_DIALOG_FOLDER) { $dialog.SelectedPath = $env:FRAMESEQ_DIALOG_FOLDER }",
      "$answer = { $dialog.SelectedPath }",
    ]
    : [
      "$dialog = New-Object System.Windows.Forms.OpenFileDialog",
      "$dialog.Title = $env:FRAMESEQ_DIALOG_TITLE",
      kind === "image"
        ? `$dialog.Filter = 'Pictures|${pictureExtensions.map((extension) => `*${extension}`).join(";")}|All files (*.*)|*.*'`
        : "$dialog.Filter = 'FrameSeq presentations (*.slides.ts, slides.ts)|*.slides.ts;slides.ts|TypeScript files (*.ts)|*.ts|All files (*.*)|*.*'",
      "if ($env:FRAMESEQ_DIALOG_FOLDER) { $dialog.InitialDirectory = $env:FRAMESEQ_DIALOG_FOLDER }",
      "$answer = { $dialog.FileName }",
    ];
  return [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "Add-Type -AssemblyName System.Windows.Forms",
    "[System.Windows.Forms.Application]::EnableVisualStyles()",
    "$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }",
    ...dialog,
    "if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write((& $answer)) }",
  ].join("\n");
}

async function windowsDialog(kind, folder) {
  // PowerShell 7 draws the current folder picker; Windows PowerShell, always present, an older one.
  const shell = onPath("pwsh.exe") ? "pwsh.exe" : "powershell.exe";
  const encoded = Buffer.from(windowsScript(kind), "utf16le").toString("base64");
  return run(shell, ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
    FRAMESEQ_DIALOG_TITLE: prompts[kind],
    FRAMESEQ_DIALOG_FOLDER: folder ?? "",
  });
}

async function macDialog(kind, folder) {
  const choose = kind === "folder" ? "choose folder" : "choose file";
  const script = [
    "on run argv",
    "set promptText to item 1 of argv",
    "tell application \"System Events\"",
    "activate",
    "if (count of argv) > 1 and item 2 of argv is not \"\" then",
    `set chosen to ${choose} with prompt promptText default location (POSIX file (item 2 of argv))`,
    "else",
    `set chosen to ${choose} with prompt promptText`,
    "end if",
    "end tell",
    "return POSIX path of chosen",
    "end run",
  ];
  const result = await run("osascript", [...script.flatMap((line) => ["-e", line]), prompts[kind], folder ?? ""]);
  // A cancelled AppleScript dialog reports error -128.
  if (result.code !== 0 && /-128/.test(result.stderr)) return { code: 0, stdout: "", stderr: "" };
  return result;
}

async function linuxDialog(kind, folder) {
  if (onPath("zenity")) {
    const result = await run("zenity", [
      "--file-selection",
      `--title=${prompts[kind]}`,
      ...(kind === "folder"
        ? ["--directory"]
        : kind === "image"
          ? [`--file-filter=Pictures | ${pictureExtensions.map((extension) => `*${extension}`).join(" ")}`, "--file-filter=All files | *"]
          : ["--file-filter=FrameSeq presentations | *.slides.ts slides.ts", "--file-filter=All files | *"]),
      ...(folder ? [`--filename=${folder.endsWith("/") ? folder : `${folder}/`}`] : []),
    ]);
    // zenity leaves with 1 when the dialog is cancelled.
    return result.code === 1 ? { code: 0, stdout: "", stderr: "" } : result;
  }
  const result = await run("kdialog", kind === "folder"
    ? ["--title", prompts[kind], "--getexistingdirectory", folder || homedir()]
    : ["--title", prompts[kind], "--getopenfilename", folder || homedir(), kind === "image" ? pictureExtensions.map((extension) => `*${extension}`).join(" ") : "*.ts"]);
  return result.code === 1 ? { code: 0, stdout: "", stderr: "" } : result;
}

/**
 * Ask the person at this computer for a presentation to open or a folder to save in. Resolves
 * to the chosen path, to `cancelled`, or to `unavailable` when no dialog could be shown, in
 * which case the Studio asks for the path itself.
 */
export async function chooseWithDialog(kind, folder) {
  if (!dialogsAvailable()) return { unavailable: true };
  const show = process.platform === "win32" ? windowsDialog : process.platform === "darwin" ? macDialog : linuxDialog;
  const result = await show(kind, folder);
  if (result.code !== 0) return { unavailable: true, reason: result.stderr.trim() };
  const path = result.stdout.trim();
  return path ? { path: resolve(path) } : { cancelled: true };
}

export { isDirectory, isFile };
