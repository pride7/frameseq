import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { configDirectory } from "./studio-files.mjs";

/**
 * Whether a newer FrameSeq is out, for the Studio to say so. The app asks GitHub for its latest
 * release, which carries the downloads; an npm install asks the npm registry. A checkout of the
 * repository has nothing to update from, so it asks nobody. The Studio checks at most once a
 * day by itself, and whenever the person asks; its own setting or FRAMESEQ_NO_UPDATE_CHECK=1
 * turns the daily check off.
 */

const releaseUrl = "https://api.github.com/repos/pride7/frameseq/releases/latest";
const registryUrl = "https://registry.npmjs.org/@pride7/frameseq/latest";
const day = 24 * 60 * 60 * 1000;
const timeout = 8000;

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
 * Where this FrameSeq came from, which says where a newer one is found: the app, which records
 * itself in frameseq-bundle.json; an npm install, in a project or global; or neither.
 */
export function updateSource(root) {
  const bundleFile = join(root, "frameseq-bundle.json");
  if (existsSync(bundleFile)) {
    let bundle = {};
    try {
      bundle = JSON.parse(readFileSync(bundleFile, "utf8"));
    } catch {
      // A bundle file that cannot be read still marks the app; this computer names the platform.
    }
    const platform = typeof bundle.platform === "string" ? bundle.platform : process.platform;
    const arch = typeof bundle.arch === "string" ? bundle.arch : process.arch;
    return { kind: "app", target: `${platform === "win32" ? "win" : platform === "darwin" ? "mac" : "linux"}-${arch}` };
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

/** The newest release for this source, as { version, url }, or undefined when there is none yet. */
async function fetchLatest(source, current, fetchImpl) {
  const headers = { "User-Agent": `FrameSeq/${current}` };
  if (source.kind === "app") {
    const response = await fetchImpl(releaseUrl, {
      headers: { ...headers, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw new Error(`GitHub answered HTTP ${response.status}.`);
    const release = await response.json();
    const version = String(release.tag_name ?? "").replace(/^v/, "");
    if (!parseVersion(version)) throw new Error(`GitHub named no version: ${release.tag_name}`);
    // The downloads are attached a while after the release appears; until this system's is
    // there, there is nothing to update to.
    const assets = Array.isArray(release.assets) ? release.assets : [];
    if (!assets.some((asset) => String(asset.name ?? "").includes(`-${source.target}.`))) return undefined;
    return { version, url: typeof release.html_url === "string" ? release.html_url : undefined };
  }
  const response = await fetchImpl(registryUrl, {
    headers: { ...headers, Accept: "application/json" },
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`The npm registry answered HTTP ${response.status}.`);
  const manifest = await response.json();
  if (!parseVersion(manifest.version)) throw new Error(`The npm registry named no version: ${manifest.version}`);
  return { version: manifest.version };
}

/**
 * `daily` false leaves the daily check to Studios that open a window, so one started with
 * --no-open, as scripts and tests start it, only checks when asked.
 */
export function createUpdates({
  packageRoot,
  current,
  daily = true,
  fetch: fetchImpl = globalThis.fetch,
  now = Date.now,
  environment = process.env,
}) {
  const source = updateSource(packageRoot);
  const locked = environment.FRAMESEQ_NO_UPDATE_CHECK === "1";
  const stateFile = () => join(configDirectory(environment), "updates.json");
  let checking;

  const readState = async () => {
    try {
      const value = JSON.parse(await readFile(stateFile(), "utf8"));
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  };
  const writeState = async (state) => {
    await mkdir(dirname(stateFile()), { recursive: true });
    await writeFile(stateFile(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
  };

  const check = () => {
    checking ??= fetchLatest(source, current, fetchImpl).then(async (latest) => {
      await writeState({ ...await readState(), checked: now(), latest: latest ?? null });
      return latest;
    }).finally(() => {
      checking = undefined;
    });
    return checking;
  };

  /**
   * What the Studio says about updates. `force` asks now, whatever the last check found;
   * otherwise a check happens only when the daily one is on and the last is a day old.
   */
  const status = async ({ force = false } = {}) => {
    if (!source) return { current, newer: false };
    const state = await readState();
    const automatic = !locked && state.automatic !== false;
    let latest = state.latest ?? undefined;
    let error;
    const due = daily && automatic && !(typeof state.checked === "number" && now() - state.checked < day);
    if (force || due) {
      try {
        latest = await check();
      } catch (problem) {
        // A daily check that fails, as offline, tries again the next time the Studio starts.
        if (force) error = problem instanceof Error ? problem.message : String(problem);
      }
    }
    const newer = Boolean(latest?.version && parseVersion(latest.version) && compareVersions(latest.version, current) > 0);
    return {
      source: source.kind,
      current,
      automatic,
      locked,
      newer,
      ...(latest ? { latest: latest.version } : {}),
      ...(latest?.url ? { url: latest.url } : {}),
      ...(source.command ? { command: source.command } : {}),
      skipped: newer && state.skipped === latest.version,
      ...(error ? { error } : {}),
    };
  };

  /** Keep the daily check on or off, or stop mentioning one version. */
  const remember = async ({ automatic, skip }) => {
    const state = await readState();
    if (typeof automatic === "boolean") state.automatic = automatic;
    if (typeof skip === "string" && parseVersion(skip)) state.skipped = skip;
    await writeState(state);
  };

  return { source, status, remember };
}
