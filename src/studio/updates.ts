/**
 * Telling the person that a newer FrameSeq is out, and in the app, updating to it. The server
 * knows where this FrameSeq came from and asks there, at most once a day by itself; the app
 * installs a version it can take by itself, which starts the next time the Studio opens. The
 * page says what happened, once per version in a window, and checks again whenever
 * **Help › Check for updates** asks it to.
 */

import { call } from "./api";
import { openOutside } from "./desktop";
import { t } from "./i18n";
import type { MenuEntry } from "./menubar";
import { askChoice, toast, type ToastAction } from "./ui";

export interface UpdateStatus {
  /** Where this FrameSeq updates from; none for a checkout of the repository. */
  source?: "app" | "npm";
  current: string;
  /** The newest version the last check found. */
  latest?: string;
  newer: boolean;
  /** The app can install `latest` by itself, without a new download of the app. */
  ota?: boolean;
  /** The version the app has installed, which starts the next time the Studio opens. */
  ready?: string;
  /** The app is installing `latest` now. */
  installing?: boolean;
  /** Why installing `latest` failed last time. */
  failed?: string;
  /** The person asked not to hear about `latest` again. */
  skipped?: boolean;
  /** Whether the Studio checks, and the app updates, once a day by itself. */
  automatic?: boolean;
  /** FRAMESEQ_NO_UPDATE_CHECK keeps the daily check off. */
  locked?: boolean;
  /** The release page with the app's downloads. */
  url?: string;
  /** The npm command that updates this install. */
  command?: string;
  /** Why a check or an update the person asked for failed. */
  error?: string;
}

const changelogUrl = "https://pride7.github.io/frameseq/docs/changelog.html";
const releasesUrl = "https://github.com/pride7/frameseq/releases/latest";
const shownKey = "frameseq-studio-update-shown";

let status: UpdateStatus | undefined;

/** Whether a notice has yet to show in this window; each shows once. */
function firstTime(notice: string): boolean {
  try {
    if (sessionStorage.getItem(shownKey) === notice) return false;
    sessionStorage.setItem(shownKey, notice);
  } catch {
    // Without storage the notice shows on each reload, which is all it costs.
  }
  return true;
}

const whatsNew: ToastAction = { label: t.updates.whatsNew, run: () => openOutside(changelogUrl) };
const download: ToastAction = { label: t.updates.download, primary: true, run: () => openOutside(releasesUrl) };

function copyCommand(command: string): void {
  void navigator.clipboard.writeText(command).then(
    () => toast(t.updates.copied, { tone: "success" }),
    () => toast(t.updates.npmHint(command), { timeout: 0 }),
  );
}

/** Ask the server again while the app installs an update. */
async function settled(found: UpdateStatus): Promise<UpdateStatus> {
  let latest = found;
  for (let tries = 0; latest.installing && tries < 400; tries += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 1500));
    latest = await call<UpdateStatus>("GET", "update");
  }
  status = latest;
  return latest;
}

function showReady(version: string): void {
  toast(t.updates.ready(version), { tone: "success", actions: [whatsNew], timeout: 20_000, key: "update" });
}

/** Install the latest version in the app now, as the person asks. */
async function installNow(found: UpdateStatus): Promise<void> {
  const version = found.latest ?? "";
  const progress = toast(t.updates.installing(version), { tone: "busy", key: "update" });
  let result: UpdateStatus;
  try {
    result = await settled(await call<UpdateStatus>("POST", "update", { install: true }));
  } catch (error) {
    progress.update(t.updates.installFailed(version, error instanceof Error ? error.message : String(error)), { tone: "error", actions: [download] });
    return;
  }
  if (result.ready) {
    progress.update(t.updates.ready(result.ready), { tone: "success", actions: [whatsNew], timeout: 20_000 });
    return;
  }
  progress.update(t.updates.installFailed(version, result.error ?? result.failed ?? ""), { tone: "error", actions: [download] });
}

/** Where the update goes from here: installed by the app, its download, or the npm command. */
function updateActions(found: UpdateStatus): ToastAction[] {
  const skip = { label: t.updates.skip, run: () => void call("POST", "update", { skip: found.latest }).catch(() => undefined) };
  if (found.source === "app" && found.ota) {
    return [skip, { label: t.updates.update, primary: true, run: () => void installNow(found) }];
  }
  if (found.source === "app") {
    return [skip, { label: t.updates.download, primary: true, run: () => openOutside(found.url ?? releasesUrl) }];
  }
  return [
    skip,
    { label: t.updates.whatsNew, run: () => openOutside(changelogUrl) },
    ...(found.command ? [{ label: t.updates.copyCommand, primary: true, run: () => copyCommand(found.command!) }] : []),
  ];
}

/**
 * Say once per window what the daily check found: a version the app has installed by itself,
 * one it could not install, or one to download, unless the person skipped it.
 */
export async function watchForUpdates(): Promise<void> {
  try {
    status = await call<UpdateStatus>("GET", "update");
    if (!status.automatic || !status.newer || !status.latest || status.skipped) return;
    if (status.installing) {
      status = await settled(status);
      if (status.ready && firstTime(`ready ${status.ready}`)) showReady(status.ready);
    }
  } catch {
    return;
  }
  const { latest } = status;
  if (!latest || status.ready || status.installing) return;
  if (status.failed) {
    if (firstTime(`failed ${latest}`)) {
      toast(t.updates.installFailed(latest, status.failed), { tone: "error", actions: [download], timeout: 20_000, key: "update" });
    }
    return;
  }
  if (!firstTime(`available ${latest}`)) return;
  toast(t.updates.availableToast(latest, status.current), {
    actions: updateActions(status),
    timeout: 20_000,
    key: "update",
  });
}

/** Check now, as **Help › Check for updates** asks, and say what was found. */
export async function checkForUpdates(): Promise<void> {
  const progress = toast(t.updates.checking, { tone: "busy", key: "update" });
  let found: UpdateStatus;
  try {
    found = await call<UpdateStatus>("POST", "update", { check: true });
    if (found.installing && found.latest) {
      progress.update(t.updates.installing(found.latest), { tone: "busy" });
      found = await settled(found);
    }
  } catch (error) {
    progress.update(t.updates.failed(error instanceof Error ? error.message : String(error)), { tone: "error" });
    return;
  }
  status = found;
  if (found.error) {
    progress.update(t.updates.failed(found.error), { tone: "error" });
    return;
  }
  if (!found.newer || !found.latest) {
    progress.update(t.updates.upToDate(found.current), { tone: "success" });
    return;
  }
  if (found.ready) {
    progress.update(t.updates.ready(found.ready), { tone: "success", actions: [whatsNew], timeout: 20_000 });
    return;
  }
  progress.close();
  const actions = updateActions(found);
  const choice = await askChoice({
    title: t.updates.available(found.latest),
    message: [
      t.updates.current(found.current),
      found.source === "app" && found.ota ? t.updates.otaHint : "",
      found.source === "npm" && found.command ? t.updates.npmHint(found.command) : "",
    ].filter(Boolean).join(" "),
    choices: actions.map((action, index) => ({ label: action.label, value: String(index), primary: action.primary })),
  });
  if (choice !== undefined) actions[Number(choice)]?.run();
}

/** Help's commands for updates, shown where this FrameSeq has somewhere to update from. */
export function updateMenu(): MenuEntry[] {
  if (!status?.source) return [];
  return [
    { command: "check-updates", label: t.menu.checkUpdates, run: () => void checkForUpdates() },
    {
      command: "automatic-updates",
      label: t.menu.automaticUpdates,
      checked: () => Boolean(status?.automatic),
      disabled: () => Boolean(status?.locked),
      run: () => {
        const automatic = !status?.automatic;
        void call<UpdateStatus>("POST", "update", { automatic }).then((next) => {
          status = next;
        }).catch((error: unknown) => {
          toast(t.updates.failed(error instanceof Error ? error.message : String(error)), { tone: "error" });
        });
      },
    },
  ];
}
