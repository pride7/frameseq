import { spawnSync } from "node:child_process";
import { createHash, createPublicKey, verify } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { cp, link, lstat, mkdir, readdir, readlink, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  allLayers,
  appLayers,
  compareVersions,
  installedApp,
  installedRuntime,
  layerFile,
  layerFormat,
  parseVersion,
  samePath,
  takesUpdates,
  updatesDirectory,
} from "./app-layers.mjs";

/**
 * Updating FrameSeq where it is installed. The app updates itself: a newer FrameSeq package
 * from the npm registry, checked against the registry's signature, becomes a layer over the
 * app's own dependencies (see app-layers.mjs), when nothing else the app ships has to change
 * with it. Otherwise the new version comes as a new app, from the release page; and an npm
 * install is updated with npm.
 */

export const packageName = "@pride7/frameseq";
export const releasesUrl = "https://github.com/pride7/frameseq/releases/latest";

/**
 * The npm registry's signing key, from https://registry.npmjs.org/-/npm/v1/keys, pinned: an
 * update whose signature it did not make is refused, wherever the update was downloaded from.
 */
const registryKeys = {
  "SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U":
    "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==",
};

// The typesetters the app installs beside the dependencies count only where they are installed.
const typesetters = ["@myriaddreamin/typst-ts-node-compiler", "node-tectonic"];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Where this FrameSeq came from, which says where a newer one is found: the app, which records
 * itself in frameseq-bundle.json; an npm install, in a project or global; or neither.
 */
export function updateSource(root) {
  const bundleFile = join(root, "frameseq-bundle.json");
  if (existsSync(bundleFile)) {
    // A bundle file that cannot be read still marks the app; this computer names the platform.
    const bundle = readJson(bundleFile) ?? {};
    const platform = typeof bundle.platform === "string" ? bundle.platform : process.platform;
    const arch = typeof bundle.arch === "string" ? bundle.arch : process.arch;
    const app = installedApp(root);
    return {
      kind: "app",
      target: `${platform === "win32" ? "win" : platform === "darwin" ? "mac" : "linux"}-${arch}`,
      app,
      updates: takesUpdates(app),
    };
  }
  const parts = root.split(/[\\/]/);
  const modules = parts.indexOf("node_modules");
  if (modules < 0) return undefined;
  // The outermost node_modules belongs to the project, even inside pnpm's store; a global
  // install's folder has no package.json beside it.
  const project = parts.slice(0, modules).join(sep);
  const global = !existsSync(join(project, "package.json"));
  return {
    kind: "npm",
    command: global ? "npm install --global @pride7/frameseq@latest" : "npm install @pride7/frameseq@latest",
  };
}

/** The registry updates come from: npm's own, or FRAMESEQ_UPDATE_REGISTRY, such as a mirror. */
export function registryUrl(environment = process.env) {
  return (environment.FRAMESEQ_UPDATE_REGISTRY || "https://registry.npmjs.org").replace(/\/+$/, "");
}

/** What the registry publishes about a version of FrameSeq, "latest" by default. */
export async function fetchManifest(version = "latest", { fetch: fetchImpl = globalThis.fetch, environment = process.env, current } = {}) {
  const response = await fetchImpl(`${registryUrl(environment)}/${packageName}/${version}`, {
    headers: { Accept: "application/json", "User-Agent": `FrameSeq/${current ?? "unknown"}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`The npm registry answered HTTP ${response.status}.`);
  const manifest = await response.json();
  if (!parseVersion(manifest?.version)) throw new Error(`The npm registry named no version: ${manifest?.version}`);
  return manifest;
}

/** Refuse a version whose integrity the npm registry did not sign with a key FrameSeq knows. */
export function verifyManifest(manifest, keys = registryKeys) {
  const integrity = manifest?.dist?.integrity;
  if (manifest?.name !== packageName || !parseVersion(manifest.version) || typeof integrity !== "string" || !integrity.startsWith("sha512-")) {
    throw new Error("The npm registry's answer does not describe a version of FrameSeq.");
  }
  const payload = Buffer.from(`${manifest.name}@${manifest.version}:${integrity}`);
  const signed = (Array.isArray(manifest.dist.signatures) ? manifest.dist.signatures : []).some(({ keyid, sig } = {}) => {
    if (typeof keys[keyid] !== "string" || typeof sig !== "string") return false;
    try {
      const key = createPublicKey({ key: Buffer.from(keys[keyid], "base64"), format: "der", type: "spki" });
      return verify("sha256", payload, key, Buffer.from(sig, "base64"));
    } catch {
      return false;
    }
  });
  if (!signed) throw new Error(`FrameSeq ${manifest.version} does not carry the npm registry's signature.`);
}

const below = (a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2]);

/**
 * Whether a version satisfies an npm range of the kinds package.json files use: `^`, `~`,
 * comparisons, exact versions, and alternatives joined by `||`. Any other form counts as not.
 */
export function satisfies(version, range) {
  const v = parseVersion(version);
  if (!v) return false;
  return String(range).split("||").some((alternative) => {
    let preAllowed = false;
    const met = alternative.trim().split(/\s+/).filter(Boolean).every((part) => {
      if (part === "*") return true;
      const match = /^(\^|~|>=|<=|>|<|=)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(part);
      if (!match) return false;
      const [, operator = "=", base] = match;
      const b = parseVersion(base);
      // A pre-release satisfies only a range that names a pre-release of the same version.
      if (b.pre.length > 0 && b.numbers.join(".") === v.numbers.join(".")) preAllowed = true;
      const order = compareVersions(version, base);
      const [major, minor, patch] = b.numbers;
      switch (operator) {
        case "^": return order >= 0 && below(v.numbers, major > 0 ? [major + 1, 0, 0] : minor > 0 ? [0, minor + 1, 0] : [0, 0, patch + 1]);
        case "~": return order >= 0 && below(v.numbers, [major, minor + 1, 0]);
        case ">=": return order >= 0;
        case "<=": return order <= 0;
        case ">": return order > 0;
        case "<": return order < 0;
        default: return order === 0;
      }
    });
    return met && (v.pre.length === 0 || preAllowed);
  });
}

/**
 * Why this install cannot take a version as a layer, or undefined when it can: the version
 * must be stamped with the app's runtime, run on its Node.js, and need no dependency other than
 * the ones the app has.
 */
export function updateProblem(manifest, app, node = process.versions.node) {
  if (!takesUpdates(app)) return "This app cannot update itself.";
  if (manifest.appRuntime !== installedRuntime(app).runtime) return `FrameSeq ${manifest.version} needs a new app.`;
  if (manifest.engines?.node && !satisfies(node, manifest.engines.node)) {
    return `FrameSeq ${manifest.version} needs Node.js ${manifest.engines.node}.`;
  }
  const optional = new Set([...typesetters, ...Object.keys(manifest.optionalDependencies ?? {})]);
  const wanted = {
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...Object.fromEntries(typesetters.filter((name) => manifest.devDependencies?.[name]).map((name) => [name, manifest.devDependencies[name]])),
  };
  for (const [name, range] of Object.entries(wanted)) {
    const installed = readJson(join(app, "node_modules", ...name.split("/"), "package.json"))?.version;
    if (!installed && optional.has(name)) continue;
    if (!installed || !satisfies(installed, range)) return `FrameSeq ${manifest.version} needs ${name}@${range}.`;
  }
  return undefined;
}

/** Copy a folder as hard links, which take no room, or as copies where a link cannot go. */
export async function linkTree(from, to) {
  const info = await lstat(from);
  if (info.isSymbolicLink()) {
    const kind = process.platform === "win32" ? ((await stat(from)).isDirectory() ? "junction" : "file") : undefined;
    await symlink(await readlink(from), to, kind);
    return;
  }
  if (info.isDirectory()) {
    await mkdir(to, { recursive: true });
    await Promise.all((await readdir(from)).map((name) => linkTree(join(from, name), join(to, name))));
    return;
  }
  try {
    await link(from, to);
  } catch {
    await cp(from, to);
  }
}

function untar(archive, into) {
  // Windows has its own tar, which reads drive letters; another on the PATH, such as Git's, may not.
  const tar = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
  const result = spawnSync(tar, ["-xzf", archive, "-C", into], { encoding: "utf8", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`The update could not be unpacked: ${result.stderr.trim()}`);
}

/** Windows refuses to move a folder a virus scanner is still reading, for a moment. */
async function moveInto(from, to) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      if (attempt >= 20 || !["EPERM", "EBUSY", "EACCES"].includes(error?.code)) throw error;
      await delay(250);
    }
  }
}

/**
 * Download a version, check it, and install it as a layer for this app, which runs it from its
 * next start. The layer is made in a folder of its own and moved into place only once its
 * FrameSeq has started, so a failed update leaves the app as it was.
 */
export async function installLayer({
  manifest,
  app,
  fetch: fetchImpl = globalThis.fetch,
  keys = registryKeys,
  environment = process.env,
  node = process.execPath,
}) {
  verifyManifest(manifest, keys);
  const problem = updateProblem(manifest, app);
  if (problem) throw new Error(problem);
  const installed = () => appLayers(app, environment).find((layer) => layer.version === manifest.version);
  if (installed()) return installed().path;

  const directory = updatesDirectory(environment);
  // Named for the install too, since a portable copy beside the installed app has layers of its own.
  const install = createHash("sha256").update(process.platform === "win32" ? resolve(app).toLowerCase() : resolve(app)).digest("hex").slice(0, 8);
  const target = join(directory, `${manifest.version}_${install}`);
  const work = join(directory, `.partial-${manifest.version}-${process.pid}-${Date.now()}`);
  await mkdir(work, { recursive: true });
  try {
    const response = await fetchImpl(manifest.dist.tarball, { signal: AbortSignal.timeout(300_000) });
    if (!response.ok) throw new Error(`FrameSeq ${manifest.version} could not be downloaded: HTTP ${response.status}.`);
    const tarball = Buffer.from(await response.arrayBuffer());
    if (`sha512-${createHash("sha512").update(tarball).digest("base64")}` !== manifest.dist.integrity) {
      throw new Error(`The download of FrameSeq ${manifest.version} is not the one the npm registry signed.`);
    }
    const archive = join(work, "package.tgz");
    await writeFile(archive, tarball);
    const unpacked = join(work, "unpacked");
    await mkdir(unpacked);
    untar(archive, unpacked);
    const layer = join(unpacked, "package");
    const unpackedManifest = readJson(join(layer, "package.json"));
    if (unpackedManifest?.name !== packageName || unpackedManifest.version !== manifest.version) {
      throw new Error(`The download is not FrameSeq ${manifest.version}.`);
    }

    await linkTree(join(app, "node_modules"), join(layer, "node_modules"));
    // The layer finds the app's browser and window where the app has them.
    const bundle = readJson(join(app, "frameseq-bundle.json")) ?? {};
    for (const key of ["browser", "window"]) {
      if (typeof bundle[key] === "string") bundle[key] = resolve(app, bundle[key]);
    }
    bundle.version = manifest.version;
    await writeFile(join(layer, "frameseq-bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`);
    await writeFile(join(layer, layerFile), `${JSON.stringify({
      format: layerFormat,
      version: manifest.version,
      runtime: bundle.runtime,
      install: app,
    }, null, 2)}\n`);

    const started = spawnSync(node, [join(layer, "scripts", "frameseq.mjs"), "--version"], {
      encoding: "utf8",
      timeout: 120_000,
      windowsHide: true,
      env: { ...process.env, ...environment },
    });
    if (started.status !== 0 || started.stdout.trim() !== manifest.version) {
      const lines = `${started.error?.message ?? ""}\n${started.stderr ?? ""}\n${started.stdout ?? ""}`
        .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const reason = lines.find((line) => /^[A-Za-z]*Error\b/.test(line)) ?? lines.at(-1) ?? `exit code ${started.status}`;
      throw new Error(`FrameSeq ${manifest.version} did not start: ${reason}`);
    }

    if (!installed()) {
      // A folder left by an update that did not finish.
      await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      await moveInto(layer, target);
    }
  } finally {
    await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
  }
  await pruneLayers(app, environment);
  return target;
}

/**
 * Remove the layers this install has no use for: all but its two newest, which may be running,
 * those it cannot run, those of installs that are gone, what is left of removed layers, and
 * updates that never finished.
 */
export async function pruneLayers(app, environment = process.env, keep = 2) {
  const kept = new Set(appLayers(app, environment).slice(0, keep).map((layer) => resolve(layer.path)));
  const removable = allLayers(environment).filter(({ path, layer }) => {
    if (kept.has(resolve(path))) return false;
    // A layer is named for its version; one without frameseq-layer.json was removed in use.
    if (layer === undefined) return Boolean(parseVersion(basename(path).split("_")[0]));
    return typeof layer.install === "string" && (!existsSync(layer.install) || samePath(layer.install, app));
  }).map(({ path }) => path);
  const directory = updatesDirectory(environment);
  for (const name of await readdir(directory).catch(() => [])) {
    if (!name.startsWith(".partial-")) continue;
    const path = join(directory, name);
    const age = Date.now() - (await stat(path).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs;
    if (age > 60 * 60 * 1000) removable.push(path);
  }
  await Promise.all(removable.map((path) => rm(path, { recursive: true, force: true }).catch(() => undefined)));
}

/**
 * Remove every layer of this install, so it runs its own FrameSeq again. Each stops counting as
 * a layer at once, as its frameseq-layer.json goes; files a running FrameSeq holds, as Windows
 * keeps them, go when a later start prunes the layers.
 */
export async function removeLayers(app, environment = process.env) {
  const layers = allLayers(environment).filter(({ layer }) => typeof layer?.install === "string" && samePath(layer.install, app));
  let held = 0;
  for (const { path } of layers) {
    await rm(join(path, layerFile), { force: true });
    await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {
      held += 1;
    });
  }
  return { removed: layers.length, held };
}

/** `frameseq update`: install a newer version where the app can, or say how to get it. */
export async function updateCommand({ packageRoot, current, check = false, revert = false, environment = process.env }) {
  const source = updateSource(packageRoot);
  if (!source) {
    console.log(`FrameSeq ${current} runs from a checkout of its repository; update it with git.`);
    return;
  }
  if (source.kind === "npm") {
    if (revert) throw new Error("Only the FrameSeq app keeps updates to go back from.");
    const latest = await fetchManifest("latest", { environment, current });
    console.log(compareVersions(latest.version, current) > 0
      ? `FrameSeq ${latest.version} is out; this is ${current}. Update it with: ${source.command}`
      : `FrameSeq ${current} is the latest version.`);
    return;
  }
  const { app } = source;
  if (revert) {
    const { removed } = await removeLayers(app, environment);
    console.log(removed > 0
      ? `Removed ${removed === 1 ? "the update" : `${removed} updates`}: FrameSeq ${installedRuntime(app).version}, as installed, runs from its next start.`
      : `No updates are installed: FrameSeq ${installedRuntime(app).version} runs as installed.`);
    return;
  }
  const latest = await fetchManifest("latest", { environment, current });
  const ready = appLayers(app, environment)[0];
  if (compareVersions(latest.version, current) <= 0) {
    console.log(`FrameSeq ${current} is the latest version.`);
  } else if (ready && compareVersions(ready.version, latest.version) >= 0) {
    console.log(`FrameSeq ${ready.version} is installed and runs from FrameSeq's next start.`);
  } else if (updateProblem(latest, app)) {
    console.log(`FrameSeq ${latest.version} is out; this is ${current}. ${updateProblem(latest, app)} Download it from ${releasesUrl}`);
  } else if (check) {
    console.log(`FrameSeq ${latest.version} is out; this is ${current}. Run frameseq update to install it.`);
  } else {
    console.log(`Installing FrameSeq ${latest.version}…`);
    await installLayer({ manifest: latest, app, environment });
    console.log(`FrameSeq ${latest.version} is installed and runs from FrameSeq's next start.`);
  }
}
