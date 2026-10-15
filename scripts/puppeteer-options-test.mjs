import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundledBrowser, chromiumCandidates, runsFromBundle } from "./browsers.mjs";
import { puppeteerLaunchOptions } from "./puppeteer-options.mjs";

assert.deepEqual(
  puppeteerLaunchOptions({}, { platform: "linux", ci: "true", uid: 1000 }).args,
  ["--no-sandbox", "--disable-setuid-sandbox"],
);
assert.deepEqual(
  puppeteerLaunchOptions({}, { platform: "linux", ci: "", uid: 0 }).args,
  ["--no-sandbox", "--disable-setuid-sandbox"],
);
assert.deepEqual(
  puppeteerLaunchOptions(
    { headless: false, args: ["--window-size=1280,720"] },
    { platform: "linux", ci: "", uid: 1000 },
  ),
  { headless: false, args: ["--window-size=1280,720"] },
);
assert.deepEqual(
  puppeteerLaunchOptions({}, { platform: "win32", ci: "true", uid: 0 }).args,
  [],
);

// Without a browser of Puppeteer's own, as in the standalone app, an installed one renders.
assert.equal(
  puppeteerLaunchOptions({}, { platform: "win32", browser: "C:\Edge\msedge.exe" }).executablePath,
  "C:\Edge\msedge.exe",
);
assert.equal("executablePath" in puppeteerLaunchOptions({}, { platform: "win32", browser: undefined }), false);
assert.ok(
  chromiumCandidates("win32", { PROGRAMFILES: "C:\Program Files" })
    .includes("C:\Program Files\Microsoft\Edge\Application\msedge.exe")
    || chromiumCandidates("win32", { PROGRAMFILES: "C:\Program Files" }).some((path) => path.endsWith("msedge.exe")),
  "Edge, which every Windows computer has, must be a candidate",
);
assert.ok(chromiumCandidates("darwin", {}).includes("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"));

// The standalone app records the browser it ships beside FrameSeq.
const app = await mkdtemp(join(tmpdir(), "frameseq-bundle-"));
try {
  assert.equal(runsFromBundle(app), false);
  await writeFile(join(app, "headless-shell"), "");
  await writeFile(join(app, "frameseq-bundle.json"), JSON.stringify({ browser: "headless-shell" }));
  assert.equal(runsFromBundle(app), true);
  assert.equal(bundledBrowser(app), join(app, "headless-shell"));
  await writeFile(join(app, "frameseq-bundle.json"), JSON.stringify({ browser: "missing" }));
  assert.equal(bundledBrowser(app), undefined, "a browser that is not there is not used");
} finally {
  await rm(app, { recursive: true, force: true });
}

console.log("Puppeteer launch options test passed.");
