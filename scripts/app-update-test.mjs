#!/usr/bin/env node

// Updates of the FrameSeq app: npm ranges, the registry's signature, which published versions
// an install can take, installing one as a layer over the install's dependencies, the entry that
// runs the newest layer, going back, and the Studio's server installing an update by itself.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { cp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appLayers, chosenApp, installedApp } from "./app-layers.mjs";
import { appRuntime } from "./app-runtime.mjs";
import { installLayer, linkTree, pruneLayers, satisfies, updateProblem, verifyManifest } from "./app-update.mjs";
import { createUpdates } from "./studio-updates.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = resolve(packageRoot, "tmp", "app-update-test");
const tar = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
await mkdir(workspace, { recursive: true });

// ── npm ranges, as package.json files write them ────────────────────────────────────────────
for (const [version, range, expected] of [
  ["6.20.3", "^6.20.3", true],
  ["6.99.0", "^6.20.3", true],
  ["7.0.0", "^6.20.3", false],
  ["6.20.2", "^6.20.3", false],
  ["0.11.4", "^0.11.0", true],
  ["0.12.0", "^0.11.0", false],
  ["1.2.0-beta.16", "^1.2.0-beta.15", true],
  ["1.2.0-beta.14", "^1.2.0-beta.15", false],
  ["1.2.1", "^1.2.0-beta.15", true],
  ["1.3.0-beta.1", "^1.2.0-beta.15", false],
  ["2.0.0-rc.1", "^1.2.3", false],
  ["1.2.9", "~1.2.3", true],
  ["1.3.0", "~1.2.3", false],
  ["24.14.0", "^20.19.0 || >=22.12.0", true],
  ["22.11.0", "^20.19.0 || >=22.12.0", false],
  ["20.19.1", "^20.19.0 || >=22.12.0", true],
  ["1.5.0", ">=1.2.0 <2.0.0", true],
  ["2.0.0", ">=1.2.0 <2.0.0", false],
  ["1.2.3", "1.2.3", true],
  ["1.2.4", "1.x", false],
]) {
  assert.equal(satisfies(version, range), expected, `${version} satisfies ${range}`);
}

// ── The npm registry's signature, checked against the key FrameSeq pins ─────────────────────
const published = {
  name: "@pride7/frameseq",
  version: "0.37.0",
  dist: {
    integrity: "sha512-QDEhpS0pHQOyVJhg6kc8vYhzQ9RzRtKGhk/n04hFxcWlx40BWJCAbq8PZ1H1gxz/ex5G5zyZXcuB8gFXTA/cpQ==",
    signatures: [{
      keyid: "SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U",
      sig: "MEQCIFs6etgqHci4Ku6l62ET+kzQYLyyx1h55UuT9x5cs4h5AiAFPlq2j2XdIyeDMoUUbnDQH0OBP62McJ36o5DltBcS8g==",
    }],
  },
};
verifyManifest(published);
assert.throws(() => verifyManifest({ ...published, version: "0.37.1" }), /signature/, "a signature covers its version");
assert.throws(() => verifyManifest({ ...published, dist: { ...published.dist, integrity: `sha512-${"A".repeat(86)}==` } }), /signature/);
assert.throws(() => verifyManifest({ ...published, dist: { ...published.dist, signatures: [] } }), /signature/);
assert.throws(() => verifyManifest({ ...published, name: "frameseq" }), /does not describe/);

// ── The app's runtime ───────────────────────────────────────────────────────────────────────
assert.match(appRuntime(), /^[0-9a-f]{16}$/);
assert.equal(appRuntime(), appRuntime());

// ── An install, as the app has it: the package npm packs, over its dependencies ─────────────
const packs = resolve(workspace, "packs");
await mkdir(packs, { recursive: true });
if (process.env.npm_execpath) run(process.execPath, [process.env.npm_execpath, "pack", "--pack-destination", packs], { cwd: packageRoot });
else run(`npm pack --pack-destination "${packs}"`, [], { cwd: packageRoot, shell: true });
const tarball = readdirSync(packs).find((name) => name.endsWith(".tgz"));
const unpacked = resolve(workspace, "unpacked");
await mkdir(unpacked, { recursive: true });
run(tar, ["-xzf", join(packs, tarball), "-C", unpacked]);

const app = resolve(workspace, "FrameSeq", "app");
await cp(join(unpacked, "package"), app, { recursive: true });
// The repository's own dependencies stand in for the app's, through a link that takes no time.
await symlink(join(packageRoot, "node_modules"), join(app, "node_modules"), process.platform === "win32" ? "junction" : "dir");
const installedVersion = JSON.parse(await readFile(join(app, "package.json"), "utf8")).version;
// Versions published after the installed one, whatever version the repository is at.
const [major, minor, patch] = installedVersion.split(".").map(Number);
const ahead = (steps) => `${major}.${minor}.${patch + steps}`;
const nextMinor = `${major}.${minor + 1}.0`;
const runtime = "test-runtime";
await writeFile(join(app, "frameseq-bundle.json"), JSON.stringify({ version: installedVersion, platform: process.platform, arch: process.arch, runtime, window: "../FrameSeq Studio.exe" }));
const environment = { FRAMESEQ_UPDATES_DIR: resolve(workspace, "updates"), FRAMESEQ_CONFIG_DIR: resolve(workspace, "config") };
const launch = (args, extra = {}) => run(process.execPath, [join(app, "scripts", "app-launch.mjs"), ...args], {
  env: { ...process.env, ...environment, ...extra },
});
assert.equal(launch(["--version"]), installedVersion, "with no updates, the app runs its own FrameSeq");

// Published versions, signed with a key standing in for the registry's.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const keys = { "test-key": publicKey.export({ format: "der", type: "spki" }).toString("base64") };
const ownManifest = JSON.parse(await readFile(join(app, "package.json"), "utf8"));
const downloads = new Map();
async function publish(version, change = async () => undefined, overrides = {}) {
  const folder = resolve(workspace, "published", version);
  await cp(join(unpacked, "package"), join(folder, "package"), { recursive: true });
  const manifestFile = join(folder, "package", "package.json");
  await writeFile(manifestFile, JSON.stringify({ ...JSON.parse(await readFile(manifestFile, "utf8")), version }, null, 2));
  await change(join(folder, "package"));
  const archive = join(folder, "package.tgz");
  run(tar, ["-czf", archive, "-C", folder, "package"]);
  const bytes = await readFile(archive);
  const url = `https://registry.test/@pride7/frameseq/-/frameseq-${version}.tgz`;
  downloads.set(url, bytes);
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  const manifest = {
    name: ownManifest.name,
    version,
    appRuntime: runtime,
    engines: ownManifest.engines,
    dependencies: ownManifest.dependencies,
    devDependencies: ownManifest.devDependencies,
    ...overrides,
    dist: { tarball: url, integrity, ...overrides.dist },
  };
  manifest.dist.signatures = [{
    keyid: "test-key",
    sig: sign("sha256", Buffer.from(`${manifest.name}@${manifest.version}:${manifest.dist.integrity}`), privateKey).toString("base64"),
  }];
  downloads.set(`https://registry.test/@pride7/frameseq/${version}`, manifest);
  return manifest;
}
const fetched = [];
const fakeFetch = async (url) => {
  fetched.push(url);
  const body = downloads.get(url);
  if (!body) return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  return {
    ok: true,
    status: 200,
    json: async () => body,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
};

// ── Which versions this install can take ────────────────────────────────────────────────────
const next = await publish(ahead(1));
assert.equal(updateProblem(next, app), undefined);
assert.match(updateProblem({ ...next, appRuntime: "another" }, app), /needs a new app/);
assert.match(updateProblem({ ...next, appRuntime: undefined }, app), /needs a new app/, "a version published without a runtime needs a new app");
assert.match(updateProblem({ ...next, engines: { node: ">=99.0.0" } }, app), /needs Node\.js/);
assert.match(updateProblem({ ...next, dependencies: { ...next.dependencies, vite: "^99.0.0" } }, app), /needs vite@\^99\.0\.0/);
assert.match(updateProblem({ ...next, dependencies: { ...next.dependencies, "left-pad": "^1.3.0" } }, app), /needs left-pad/, "a new dependency needs a new app");
assert.equal(updateProblem({ ...next, devDependencies: { ...next.devDependencies, "node-tectonic": "^1.0.1" } }, app), undefined);
const older = resolve(workspace, "older-app");
await mkdir(join(older, "scripts"), { recursive: true });
await writeFile(join(older, "frameseq-bundle.json"), "{}");
assert.match(updateProblem(next, older), /cannot update itself/, "an app from before updates takes none");

// ── Installing one as a layer ───────────────────────────────────────────────────────────────
const layer = await installLayer({ manifest: next, app, fetch: fakeFetch, keys, environment });
assert.ok(layer.startsWith(environment.FRAMESEQ_UPDATES_DIR));
assert.deepEqual(appLayers(app, environment).map((item) => item.version), [ahead(1)]);
const layerBundle = JSON.parse(await readFile(join(layer, "frameseq-bundle.json"), "utf8"));
assert.equal(layerBundle.version, ahead(1));
assert.equal(layerBundle.window, resolve(app, "..", "FrameSeq Studio.exe"), "a layer finds the app's window where the app has it");
assert.equal(installedApp(layer), app, "a layer knows the install it belongs to");
assert.ok(lstatSync(join(layer, "node_modules")).isSymbolicLink(), "a linked node_modules stays a link");
assert.equal(readdirSync(environment.FRAMESEQ_UPDATES_DIR).filter((name) => name.startsWith(".")).length, 0, "nothing is left of the work");
assert.equal(launch(["--version"]), ahead(1), "the app's entry runs the newest layer");
assert.equal(launch(["--version"], { FRAMESEQ_APP_LAYER: "installed" }), installedVersion, "FRAMESEQ_APP_LAYER=installed runs the app's own");
assert.equal(await installLayer({ manifest: next, app, fetch: fakeFetch, keys, environment }), layer, "a layer is installed once");

// A download that is not what the registry signed, an unsigned version, and one that does not
// start are each refused, and leave nothing behind.
const tampered = await publish(ahead(2));
tampered.dist.integrity = next.dist.integrity;
tampered.dist.signatures = [{ keyid: "test-key", sig: sign("sha256", Buffer.from(`${tampered.name}@${tampered.version}:${tampered.dist.integrity}`), privateKey).toString("base64") }];
await assert.rejects(installLayer({ manifest: tampered, app, fetch: fakeFetch, keys, environment }), /not the one the npm registry signed/);
const unsigned = await publish(ahead(3));
await assert.rejects(installLayer({ manifest: unsigned, app, fetch: fakeFetch, environment }), /signature/, "only the registry's key is trusted by default");
const broken = await publish(ahead(4), (folder) => writeFile(join(folder, "scripts", "frameseq.mjs"), 'throw new Error("broken");\n'));
await assert.rejects(installLayer({ manifest: broken, app, fetch: fakeFetch, keys, environment }), /did not start: .*broken/);
assert.deepEqual(appLayers(app, environment).map((item) => item.version), [ahead(1)]);
assert.equal(readdirSync(environment.FRAMESEQ_UPDATES_DIR).length, 1);

// Layers another install made, on another runtime, or older than the install are not run.
const foreign = async (name, layerFields) => {
  await mkdir(join(environment.FRAMESEQ_UPDATES_DIR, name, "scripts"), { recursive: true });
  await writeFile(join(environment.FRAMESEQ_UPDATES_DIR, name, "scripts", "frameseq.mjs"), "");
  await writeFile(join(environment.FRAMESEQ_UPDATES_DIR, name, "frameseq-layer.json"), JSON.stringify({ format: 1, version: nextMinor, runtime, install: app, ...layerFields }));
};
await foreign(`${nextMinor}_other`, { install: resolve(workspace, "elsewhere", "app") });
await foreign(`${nextMinor}_runtime`, { runtime: "another" });
await foreign("0.0.1_old", { version: "0.0.1" });
assert.deepEqual(appLayers(app, environment).map((item) => item.version), [ahead(1)]);
assert.equal(chosenApp(app, environment), layer);
await pruneLayers(app, environment);
assert.deepEqual(readdirSync(environment.FRAMESEQ_UPDATES_DIR).sort(), [basenameOf(layer)], "unusable layers are pruned");

// Going back to the app as installed.
assert.match(launch(["update", "--revert"]), /Removed the update/);
assert.equal(launch(["--version"]), installedVersion);
assert.deepEqual(appLayers(app, environment), []);

// ── Hard links: a tree of folders and files, linked rather than copied ──────────────────────
const tree = resolve(workspace, "tree");
await mkdir(join(tree, "a", "b"), { recursive: true });
await writeFile(join(tree, "a", "b", "file.txt"), "linked");
await writeFile(join(tree, "top.txt"), "top");
await linkTree(tree, resolve(workspace, "tree-linked"));
assert.equal(await readFile(resolve(workspace, "tree-linked", "a", "b", "file.txt"), "utf8"), "linked");
assert.equal((await stat(resolve(workspace, "tree-linked", "top.txt"))).ino, (await stat(join(tree, "top.txt"))).ino, "a file is the same file, linked");

// ── The Studio's server installs an update by itself, once a day ────────────────────────────
const third = await publish(ahead(5));
downloads.set("https://registry.test/@pride7/frameseq/latest", third);
const updates = createUpdates({
  packageRoot: app,
  current: installedVersion,
  fetch: fakeFetch,
  environment: { ...environment, FRAMESEQ_UPDATE_REGISTRY: "https://registry.test" },
  keys,
});
let status = await updates.status();
assert.equal(status.ota, true);
assert.equal(status.latest, ahead(5));
assert.equal(status.installing, true, "the server installs it by itself");
for (let tries = 0; status.installing && tries < 600; tries += 1) {
  await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  status = await updates.status();
}
assert.equal(status.ready, ahead(5), "it runs from the Studio's next start");
assert.equal(launch(["--version"]), ahead(5));
assert.ok(!fetched.some((url) => url.includes("api.github.com")), "a version the app takes by itself needs no download from GitHub");

// A Studio running the layer still says where the app is.
const fromLayer = createUpdates({ packageRoot: appLayers(app, environment)[0].path, current: ahead(5), fetch: fakeFetch, daily: false, environment });
assert.equal(fromLayer.source.app, app);
assert.equal((await fromLayer.status()).newer, false);

// ── The Studio starts again on the update, as the app's window runs it ──────────────────────
// The installed FrameSeq runs, as before the update. A stand-in for the app's window holds the
// server's input, which stops the server when it closes, and reads its output; it stays until
// its own input closes, as the window stays until the person closes it.
const talk = resolve(workspace, "talk");
await mkdir(talk, { recursive: true });
run(process.execPath, [join(app, "scripts", "frameseq.mjs"), "new", "slides.ts"], { cwd: talk, env: { ...process.env, ...environment } });
const studioEnvironment = { ...process.env, ...environment, FRAMESEQ_UPDATE_REGISTRY: "https://registry.test", NO_COLOR: "1", FORCE_COLOR: "0" };
delete studioEnvironment.FRAMESEQ_NO_UPDATE_CHECK;
const windowStandIn = resolve(workspace, "window.mjs");
await writeFile(windowStandIn, [
  'import { spawn } from "node:child_process";',
  'const server = spawn(process.execPath, process.argv.slice(2), { stdio: ["pipe", "inherit", "inherit"], windowsHide: true });',
  'server.on("exit", (code) => console.log(`window: the server stopped (${code})`));',
  'process.stdin.on("end", () => process.exit(0));',
  "process.stdin.resume();",
  "",
].join("\n"));

async function startStudio() {
  const child = spawn(process.execPath, [windowStandIn, join(app, "scripts", "frameseq.mjs"), "studio", "slides.ts", "--desktop"], {
    cwd: talk,
    env: studioEnvironment,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const started = Date.now();
  while (!/Studio:\s+(http\S+)/.test(output)) {
    if (child.exitCode !== null || Date.now() - started > 120_000) throw new Error(`The Studio did not start:\n${output}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  const origin = new URL(/Studio:\s+(http\S+)/.exec(output)[1]).origin;
  return { child, origin, output: () => output };
}

async function studioSession(origin) {
  try {
    const response = await fetch(`${origin}/__frameseq/studio/session`, { signal: AbortSignal.timeout(5000) });
    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined;
  }
}

async function studioCall(origin, token, method, body) {
  const response = await fetch(`${origin}/__frameseq/studio/update`, {
    method,
    headers: { "Content-Type": "application/json", "X-FrameSeq-Studio": token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function waitFor(check, what, timeout = 180_000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
}

/** Start the installed Studio with an update ready, have it start again, and see what answers. */
async function restartStudio(expected) {
  const studio = await startStudio();
  try {
    const { token, frameseq } = await studioSession(studio.origin);
    assert.equal(frameseq, installedVersion);
    const found = (await studioCall(studio.origin, token, "GET")).body;
    assert.equal(found.restarts, true, "a Studio the window started starts again on an update");
    const asked = await studioCall(studio.origin, token, "POST", { restart: true });
    assert.equal(asked.status, 200, JSON.stringify(asked.body));
    const answered = await waitFor(async () => {
      const session = await studioSession(studio.origin);
      return session && session.token !== token ? session : undefined;
    }, `FrameSeq ${expected} to answer on ${studio.origin}`).catch((error) => {
      throw new Error(`${error.message}\n${studio.output()}`);
    });
    assert.equal(answered.frameseq, expected, studio.output());
    assert.equal(answered.entry, join(talk, "slides.ts"), "the same presentation opens again");
    await waitFor(() => studio.output().includes("window: the server stopped (0)"), "the old server to stop", 30_000);
  } finally {
    studio.child.stdin.end();
  }
  // The new server watches the window's process, and stops with it.
  await waitFor(async () => !await studioSession(studio.origin), "the new server to stop with the window", 30_000);
}

await writeFile(join(environment.FRAMESEQ_CONFIG_DIR, "updates.json"), JSON.stringify({ checked: Date.now(), latest: { version: ahead(5), ota: true } }));
await restartStudio(ahead(5));

// An update that does not start is set aside, and the Studio starts again on what it ran.
const brokenLayer = join(environment.FRAMESEQ_UPDATES_DIR, `${ahead(6)}_broken`);
await mkdir(join(brokenLayer, "scripts"), { recursive: true });
await writeFile(join(brokenLayer, "scripts", "frameseq.mjs"), `if (process.argv.includes("--version")) console.log("${ahead(6)}"); else throw new Error("broken");\n`);
await writeFile(join(brokenLayer, "frameseq-layer.json"), JSON.stringify({ format: 1, version: ahead(6), runtime, install: app }));
await writeFile(join(environment.FRAMESEQ_CONFIG_DIR, "updates.json"), JSON.stringify({ checked: Date.now(), latest: { version: ahead(6), ota: true } }));
assert.equal(appLayers(app, environment)[0].version, ahead(6));
await restartStudio(installedVersion);
assert.equal(appLayers(app, environment)[0].version, ahead(5), "the update that did not start is set aside");
const afterBroken = JSON.parse(await readFile(join(environment.FRAMESEQ_CONFIG_DIR, "updates.json"), "utf8"));
assert.equal(afterBroken.failed?.version, ahead(6), "and is not installed again by itself");

console.log("App update test passed: npm ranges, the registry's signature, runtimes and dependencies, layers, the app's entry, going back, updating from the Studio, and starting it again on the update.");

function basenameOf(path) {
  return path.split(/[\\/]/).pop();
}
