import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { appLayers, compareVersions, parseVersion } from "./app-layers.mjs";
import { fetchManifest, installLayer, pruneLayers, updateProblem, updateSource } from "./app-update.mjs";
import { configDirectory } from "./studio-files.mjs";

export { compareVersions, parseVersion, updateSource };

/**
 * Whether a newer FrameSeq is out, for the Studio to say so, and, in the app, updating to it.
 * The app takes a version it can run over its own dependencies from the npm registry and
 * installs it by itself (see app-update.mjs); for any other, it asks GitHub for the release
 * with the downloads. An npm install asks the npm registry. A checkout of the repository has
 * nothing to update from, so it asks nobody. The Studio checks at most once a day by itself,
 * and whenever the person asks; its own setting or FRAMESEQ_NO_UPDATE_CHECK=1 turns the daily
 * check off.
 */

const releaseUrl = "https://api.github.com/repos/pride7/frameseq/releases/latest";
const day = 24 * 60 * 60 * 1000;
const timeout = 8000;

/**
 * The newest release for this source, as { version, url, ota }, or undefined when there is none
 * yet. `ota` marks a version the app can install by itself.
 */
async function fetchLatest(source, current, fetchImpl, environment) {
  const options = { fetch: fetchImpl, environment, current };
  if (source.kind === "npm") return { version: (await fetchManifest("latest", options)).version };
  if (source.updates) {
    try {
      const manifest = await fetchManifest("latest", options);
      if (compareVersions(manifest.version, current) > 0 && !updateProblem(manifest, source.app)) {
        return { version: manifest.version, ota: true };
      }
    } catch {
      // The release on GitHub still says whether there is a new app to download.
    }
  }
  const response = await fetchImpl(releaseUrl, {
    headers: { "User-Agent": `FrameSeq/${current}`, Accept: "application/vnd.github+json" },
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

/**
 * `daily` false leaves the daily check to Studios that open a window, so one started with
 * --no-open, as scripts and tests start it, only checks when asked, and installs nothing by
 * itself. `keys` replaces the npm registry's signing keys, for testing.
 */
export function createUpdates({
  packageRoot,
  current,
  daily = true,
  fetch: fetchImpl = globalThis.fetch,
  now = Date.now,
  environment = process.env,
  keys,
}) {
  const source = updateSource(packageRoot);
  const locked = environment.FRAMESEQ_NO_UPDATE_CHECK === "1";
  const stateFile = () => join(configDirectory(environment), "updates.json");
  let checking;
  let installing;

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
    checking ??= fetchLatest(source, current, fetchImpl, environment).then(async (latest) => {
      await writeState({ ...await readState(), checked: now(), latest: latest ?? null });
      return latest;
    }).finally(() => {
      checking = undefined;
    });
    return checking;
  };

  /** Install a version as a layer of the app; a failure is remembered so it is not retried daily. */
  const install = (version) => {
    installing ??= (async () => {
      const manifest = await fetchManifest(version, { fetch: fetchImpl, environment, current });
      await installLayer({ manifest, app: source.app, fetch: fetchImpl, environment, ...(keys ? { keys } : {}) });
      const { failed: _failed, ...state } = await readState();
      await writeState(state);
    })().catch(async (problem) => {
      const message = problem instanceof Error ? problem.message : String(problem);
      await writeState({ ...await readState(), failed: { version, message } });
      throw problem;
    }).finally(() => {
      installing = undefined;
    });
    return installing;
  };

  // Updates the app no longer runs, left by earlier ones.
  if (source?.kind === "app" && daily) void pruneLayers(source.app, environment).catch(() => undefined);

  /**
   * What the Studio says about updates. `force` asks now, whatever the last check found;
   * otherwise a check happens only when the daily one is on and the last is a day old. With the
   * daily check on, the app starts installing a version it can take by itself.
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
    const skipped = newer && state.skipped === latest.version;
    // A layer newer than this FrameSeq that covers the latest version runs from the next start.
    const layer = source.kind === "app" ? appLayers(source.app, environment)[0]?.version : undefined;
    const ready = newer && layer && compareVersions(layer, current) > 0 && compareVersions(layer, latest.version) >= 0 ? layer : undefined;
    const failed = newer && state.failed?.version === latest.version ? state.failed.message : undefined;
    if (newer && latest.ota && !ready && !skipped && !failed && automatic && daily) {
      void install(latest.version).catch(() => undefined);
    }
    return {
      source: source.kind,
      current,
      automatic,
      locked,
      newer,
      ...(latest ? { latest: latest.version } : {}),
      ...(latest?.url ? { url: latest.url } : {}),
      ...(newer && latest.ota ? { ota: true } : {}),
      ...(source.command ? { command: source.command } : {}),
      skipped,
      ...(ready ? { ready } : {}),
      ...(installing ? { installing: true } : {}),
      ...(failed ? { failed } : {}),
      ...(error ? { error } : {}),
    };
  };

  /** Install the latest version now, as the person asks; says why when it cannot. */
  const installLatest = async () => {
    const found = await status();
    if (!found.newer || !found.ota || found.ready) return found;
    try {
      await install(found.latest);
    } catch (problem) {
      return { ...await status(), error: problem instanceof Error ? problem.message : String(problem) };
    }
    return status();
  };

  /** Keep the daily check on or off, or stop mentioning one version. */
  const remember = async ({ automatic, skip }) => {
    const state = await readState();
    if (typeof automatic === "boolean") state.automatic = automatic;
    if (typeof skip === "string" && parseVersion(skip)) state.skipped = skip;
    await writeState(state);
  };

  return { source, status, installLatest, remember };
}
