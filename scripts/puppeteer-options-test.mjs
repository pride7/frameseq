import assert from "node:assert/strict";
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

console.log("Puppeteer launch options test passed.");
