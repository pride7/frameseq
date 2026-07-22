import process from "node:process";

export function puppeteerLaunchOptions(options = {}, runtime = {}) {
  const { args = [], ...rest } = options;
  const {
    platform = process.platform,
    ci = process.env.CI,
    uid = process.getuid?.(),
  } = runtime;
  const isLinuxAutomation = platform === "linux" && (ci === "true" || uid === 0);
  const sandboxArgs = isLinuxAutomation
    ? ["--no-sandbox", "--disable-setuid-sandbox"]
    : [];

  return {
    headless: true,
    ...rest,
    args: [...sandboxArgs, ...args],
  };
}
