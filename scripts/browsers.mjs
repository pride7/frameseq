import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Installed Chromium browsers, most likely first: Chrome, Edge, Chromium, and Brave. */
export function chromiumCandidates(platform = process.platform, env = process.env) {
  if (platform === "win32") {
    const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean);
    return [
      ["Google", "Chrome", "Application", "chrome.exe"],
      ["Microsoft", "Edge", "Application", "msedge.exe"],
      ["BraveSoftware", "Brave-Browser", "Application", "brave.exe"],
    ].flatMap((parts) => roots.map((root) => join(root, ...parts)));
  }
  if (platform === "darwin") {
    return ["Google Chrome", "Microsoft Edge", "Chromium", "Brave Browser"]
      .map((name) => `/Applications/${name}.app/Contents/MacOS/${name}`);
  }
  const directories = (env.PATH ?? "").split(delimiter).filter(Boolean);
  return ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"]
    .flatMap((name) => directories.map((directory) => join(directory, name)));
}

/** The first Chromium browser installed on this computer, if there is one. */
export function installedChromium() {
  return chromiumCandidates().find((candidate) => existsSync(candidate));
}

/**
 * The browser shipped beside FrameSeq in the standalone app, which installs no browser of
 * Puppeteer's own. The app records where it put one in frameseq-bundle.json.
 */
export function bundledBrowser(root = packageRoot) {
  try {
    const bundle = JSON.parse(readFileSync(join(root, "frameseq-bundle.json"), "utf8"));
    if (typeof bundle.browser !== "string") return undefined;
    const path = resolve(root, bundle.browser);
    return existsSync(path) ? path : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The FrameSeq app's own window for the Studio, where the app was built with one, as
 * frameseq-bundle.json records. On Linux it needs WebKitGTK, so it is tried before it is used.
 * FRAMESEQ_NO_STUDIO_WINDOW=1 opens the Studio in a browser instead.
 */
export function bundledStudioWindow(root = packageRoot) {
  if (process.env.FRAMESEQ_NO_STUDIO_WINDOW === "1") return undefined;
  try {
    const bundle = JSON.parse(readFileSync(join(root, "frameseq-bundle.json"), "utf8"));
    if (typeof bundle.window !== "string") return undefined;
    const path = resolve(root, bundle.window);
    if (!existsSync(path)) return undefined;
    if (process.platform === "linux" && spawnSync(path, ["--check"], { timeout: 10_000 }).status !== 0) return undefined;
    return path;
  } catch {
    return undefined;
  }
}

/** Whether FrameSeq runs from the standalone app rather than an npm install. */
export function runsFromBundle(root = packageRoot) {
  return existsSync(join(root, "frameseq-bundle.json"));
}

/**
 * The browser FrameSeq renders exports and checks with: FRAMESEQ_BROWSER when it is set, the
 * one shipped with the app, Puppeteer's own when it downloaded one, and otherwise an installed
 * Chrome or Edge. Undefined leaves the choice to Puppeteer.
 */
export function exportBrowser(puppeteerBrowser) {
  if (process.env.FRAMESEQ_BROWSER) return process.env.FRAMESEQ_BROWSER;
  const bundled = bundledBrowser();
  if (bundled) return bundled;
  let ownBrowser;
  try {
    ownBrowser = puppeteerBrowser?.();
  } catch {
    ownBrowser = undefined;
  }
  if (ownBrowser && existsSync(ownBrowser)) return undefined;
  return installedChromium();
}
