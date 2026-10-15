import process from "node:process";
import puppeteer from "puppeteer";
import { exportBrowser } from "./browsers.mjs";

export function puppeteerLaunchOptions(options = {}, runtime = {}) {
  const { args = [], ...rest } = options;
  const {
    platform = process.platform,
    ci = process.env.CI,
    uid = process.getuid?.(),
    browser = exportBrowser(() => puppeteer.executablePath()),
  } = runtime;
  const isLinuxAutomation = platform === "linux" && (ci === "true" || uid === 0);
  const sandboxArgs = isLinuxAutomation
    ? ["--no-sandbox", "--disable-setuid-sandbox"]
    : [];

  return {
    headless: true,
    // Without a browser of Puppeteer's own, as in the standalone app, one on this computer renders.
    ...(browser ? { executablePath: browser } : {}),
    ...rest,
    args: [...sandboxArgs, ...args],
  };
}
