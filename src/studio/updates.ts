/**
 * Telling the person that a newer FrameSeq is out. The server knows where this FrameSeq came
 * from and asks there, at most once a day by itself; the page says what it found, once per
 * version in a window, and checks again whenever **Help › Check for updates** asks it to.
 */

import { call } from "./api";
import { openOutside } from "./desktop";
import { t } from "./i18n";
import type { MenuEntry } from "./menubar";
import { askChoice, toast } from "./ui";

export interface UpdateStatus {
  /** Where this FrameSeq updates from; none for a checkout of the repository. */
  source?: "app" | "npm";
  current: string;
  /** The newest version the last check found. */
  latest?: string;
  newer: boolean;
  /** The person asked not to hear about `latest` again. */
  skipped?: boolean;
  /** Whether the Studio checks once a day by itself. */
  automatic?: boolean;
  /** FRAMESEQ_NO_UPDATE_CHECK keeps the daily check off. */
  locked?: boolean;
  /** The release page with the app's downloads. */
  url?: string;
  /** The npm command that updates this install. */
  command?: string;
  /** Why a check the person asked for failed. */
  error?: string;
}

const changelogUrl = "https://pride7.github.io/frameseq/docs/changelog.html";
const shownKey = "frameseq-studio-update-shown";

let status: UpdateStatus | undefined;

function copyCommand(command: string): void {
  void navigator.clipboard.writeText(command).then(
    () => toast(t.updates.copied, { tone: "success" }),
    () => toast(t.updates.npmHint(command), { timeout: 0 }),
  );
}

/** Where the update goes from here: the app's downloads, or the npm command that installs it. */
function updateActions(found: UpdateStatus): Array<{ label: string; run: () => void; primary?: boolean }> {
  const skip = { label: t.updates.skip, run: () => void call("POST", "update", { skip: found.latest }).catch(() => undefined) };
  if (found.source === "app") {
    return [skip, { label: t.updates.download, primary: true, run: () => openOutside(found.url ?? changelogUrl) }];
  }
  return [
    skip,
    { label: t.updates.whatsNew, run: () => openOutside(changelogUrl) },
    ...(found.command ? [{ label: t.updates.copyCommand, primary: true, run: () => copyCommand(found.command!) }] : []),
  ];
}

/** Say once per window that a newer version is out, unless the person skipped it. */
export async function watchForUpdates(): Promise<void> {
  try {
    status = await call<UpdateStatus>("GET", "update");
  } catch {
    return;
  }
  if (!status.newer || status.skipped || !status.automatic || !status.latest) return;
  try {
    if (sessionStorage.getItem(shownKey) === status.latest) return;
    sessionStorage.setItem(shownKey, status.latest);
  } catch {
    // Without storage the notice shows on each reload, which is all it costs.
  }
  toast(t.updates.availableToast(status.latest, status.current), {
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
  progress.close();
  const actions = updateActions(found);
  const choice = await askChoice({
    title: t.updates.available(found.latest),
    message: [
      t.updates.current(found.current),
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
