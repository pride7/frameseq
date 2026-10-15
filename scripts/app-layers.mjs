import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * The FrameSeq app runs the newest update it has installed for itself, or else its own copy of
 * FrameSeq. An update is a layer: a folder holding a newer FrameSeq package over the app's own
 * dependencies, kept in the per-user updates folder. A layer is used only by the install it was
 * made for, and only while that install's runtime (Node.js, the Studio's window, the launchers)
 * is the one it was made with, as the `runtime` in frameseq-bundle.json records.
 *
 * app-launch.mjs runs this before FrameSeq loads, so it imports only Node.js's own modules. An
 * app reads the layers that later versions write, so frameseq-layer.json keeps its shape.
 */

export const layerFile = "frameseq-layer.json";
export const layerFormat = 1;

/** A version's numbers and pre-release identifiers, or undefined when it is not one. */
export function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(text).trim());
  if (!match) return undefined;
  return { numbers: match.slice(1, 4).map(Number), pre: match[4] ? match[4].split(".") : [] };
}

/**
 * Compare two versions as Semantic Versioning orders them: a pre-release such as 1.2.0-beta.1
 * comes before 1.2.0, and build metadata after a plus is ignored. Negative when `left` is older.
 */
export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error(`Not a version: ${a ? right : left}`);
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] - b.numbers[index];
  }
  if (a.pre.length === 0 || b.pre.length === 0) return b.pre.length - a.pre.length;
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index += 1) {
    const x = a.pre[index];
    const y = b.pre[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xNumber = /^\d+$/.test(x);
    const yNumber = /^\d+$/.test(y);
    if (xNumber && yNumber) return Number(x) - Number(y);
    if (xNumber !== yNumber) return xNumber ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Where updates are kept: per user and per computer, away from the settings, which Windows may
 * carry between computers. FRAMESEQ_UPDATES_DIR names another folder.
 */
export function updatesDirectory(environment = process.env) {
  if (environment.FRAMESEQ_UPDATES_DIR) return resolve(environment.FRAMESEQ_UPDATES_DIR);
  if (process.platform === "win32") {
    return join(environment.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "FrameSeq", "updates");
  }
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "FrameSeq", "updates");
  return join(environment.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "frameseq", "updates");
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

export function samePath(left, right) {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** The app folder of the install a FrameSeq belongs to: its own, or the one a layer was made for. */
export function installedApp(root) {
  const layer = readJson(join(root, layerFile));
  return typeof layer?.install === "string" ? layer.install : root;
}

/** The version and runtime of an installed app, from its own folder. */
export function installedRuntime(app) {
  const bundle = readJson(join(app, "frameseq-bundle.json"));
  const manifest = readJson(join(app, "package.json"));
  return {
    version: typeof manifest?.version === "string" ? manifest.version : undefined,
    runtime: typeof bundle?.runtime === "string" ? bundle.runtime : undefined,
  };
}

/** Whether an install can take updates: it starts through app-launch.mjs and knows its runtime. */
export function takesUpdates(app) {
  const { version, runtime } = installedRuntime(app);
  return Boolean(version && runtime && existsSync(join(app, "scripts", "app-launch.mjs")));
}

/** Every layer in the updates folder, with what its frameseq-layer.json says, valid or not. */
export function allLayers(environment = process.env) {
  const directory = updatesDirectory(environment);
  let names = [];
  try {
    names = readdirSync(directory);
  } catch {
    return [];
  }
  return names
    .filter((name) => !name.startsWith("."))
    .map((name) => ({ path: join(directory, name), layer: readJson(join(directory, name, layerFile)) }));
}

/** The layers this install can run, newest first: newer than it, made for it, on its runtime. */
export function appLayers(app, environment = process.env) {
  const { version, runtime } = installedRuntime(app);
  if (!version || !runtime) return [];
  return allLayers(environment)
    .filter(({ path, layer }) => layer?.format === layerFormat
      && parseVersion(layer.version)
      && layer.runtime === runtime
      && typeof layer.install === "string"
      && samePath(layer.install, app)
      && compareVersions(layer.version, version) > 0
      && existsSync(join(path, "scripts", "frameseq.mjs")))
    .map(({ path, layer }) => ({ path, version: layer.version }))
    .sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * The folder whose FrameSeq runs: the newest layer, or the install's own.
 * FRAMESEQ_APP_LAYER=installed runs the install's own whatever layers there are.
 */
export function chosenApp(app, environment = process.env) {
  if (environment.FRAMESEQ_APP_LAYER === "installed") return app;
  return appLayers(app, environment)[0]?.path ?? app;
}

/**
 * The app's entry, which launchers and shortcuts run so that they start the newest layer;
 * undefined outside the app, where FrameSeq runs as npm installed it.
 */
export function appEntry(root) {
  const app = installedApp(root);
  const entry = join(app, "scripts", "app-launch.mjs");
  return existsSync(join(app, "frameseq-bundle.json")) && existsSync(entry) ? entry : undefined;
}
