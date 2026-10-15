import QRCode from "qrcode";
import { call, type StudioSession } from "./api";
import { language, t } from "./i18n";
import { askChoice, element, showInfo, toast } from "./ui";

const sessionKey = "frameseq-studio-remote-session";
const pairKey = "frameseq-studio-pair-phone";

let current: string | undefined;

/**
 * The pairing a phone scans, kept for this window so the phone stays paired when the Studio
 * reloads. The slide show carries it, and the server relays the phone's steps to that show.
 */
export function remoteSession(): string {
  if (current) return current;
  try {
    const stored = sessionStorage.getItem(sessionKey);
    if (stored && /^[0-9a-f]{32,128}$/.test(stored)) current = stored;
  } catch {
    // A pairing that cannot be kept lasts until the page reloads.
  }
  if (!current) {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    current = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    try {
      sessionStorage.setItem(sessionKey, current);
    } catch {
      // As above.
    }
  }
  return current;
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Pair a phone. The first time, the person agrees to open the Studio to the local network; the
 * server starts again on it, and the code to scan shows once the page has reloaded.
 */
export async function pairPhone(session: StudioSession, saveFirst: () => Promise<boolean>): Promise<void> {
  if (session.phoneRemote) {
    await showPairing();
    return;
  }
  const choice = await askChoice({
    title: t.remote.title,
    message: t.remote.turnOnMessage,
    choices: [{ label: t.remote.turnOn, value: "on", primary: true }],
  });
  if (choice !== "on") return;
  if (!await saveFirst()) {
    toast(t.remote.saveFirst, { tone: "warning" });
    return;
  }
  try {
    await call("POST", "phone-remote", {});
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), { tone: "error" });
    return;
  }
  try {
    sessionStorage.setItem(pairKey, "1");
  } catch {
    // The person opens the pairing from the menu again.
  }
  const cover = element("div", "studio-switching");
  cover.append(element("div", "studio-splash", t.remote.starting));
  document.body.append(cover);
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    await delay(300);
    try {
      const response = await fetch("/__frameseq/studio/session", { cache: "no-store" });
      const restarted = await response.json() as Partial<StudioSession>;
      if (response.ok && restarted.phoneRemote) {
        location.reload();
        return;
      }
    } catch {
      // The server is starting again.
    }
  }
  cover.remove();
  toast(t.remote.didNotStart, { tone: "error" });
}

/**
 * After the reload that turned the phone remote on, the code to scan shows by itself, and again
 * after any other reload until it is closed.
 */
export function resumePairing(session: StudioSession): void {
  let pending = false;
  try {
    pending = sessionStorage.getItem(pairKey) === "1";
  } catch {
    // Nothing was waiting.
  }
  if (pending && session.phoneRemote) void showPairing();
}

/** The code a phone scans, with the address it opens, on each network this computer is on. */
async function showPairing(): Promise<void> {
  let origins: string[] = [];
  try {
    const response = await fetch("/__frameseq/remote-info", { cache: "no-store" });
    const data = await response.json() as { origins?: unknown };
    if (Array.isArray(data.origins)) origins = data.origins.filter((origin): origin is string => typeof origin === "string");
  } catch {
    // Said below.
  }
  if (origins.length === 0) {
    showInfo(t.remote.title, [element("p", "", t.remote.noNetwork)]).addEventListener("close", donePairing, { once: true });
    return;
  }

  const code = element("div", "studio-remote-code");
  const link = element("code", "studio-remote-link");
  const copy = element("button", "studio-button", t.remote.copy);
  copy.type = "button";
  const render = async (origin: string) => {
    const url = new URL("/", origin);
    url.searchParams.set("remote", "1");
    url.searchParams.set("session", remoteSession());
    // The phone's remote speaks the Studio's language.
    url.searchParams.set("lang", language);
    code.innerHTML = await QRCode.toString(url.href, {
      type: "svg",
      width: 240,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#020617", light: "#ffffff" },
    });
    link.textContent = url.href;
    copy.textContent = t.remote.copy;
  };
  copy.addEventListener("click", () => {
    void navigator.clipboard?.writeText(link.textContent ?? "").then(() => {
      copy.textContent = t.remote.copied;
    }).catch(() => undefined);
  });
  await render(origins[0]);

  const body: Node[] = [element("p", "", t.remote.scan), code];
  if (origins.length > 1) {
    // A computer on more than one network, as with a VPN, offers an address on each.
    const picker = element("select", "studio-select studio-remote-origin");
    picker.setAttribute("aria-label", t.remote.address);
    for (const origin of origins) picker.append(new Option(origin, origin));
    picker.addEventListener("change", () => void render(picker.value));
    body.push(picker);
  }
  const address = element("div", "studio-remote-address");
  address.append(link, copy);
  body.push(address, element("p", "studio-remote-note", t.remote.note));
  showInfo(t.remote.title, body).addEventListener("close", donePairing, { once: true });
}

/** The pairing was seen, so a later reload leaves it closed. */
function donePairing(): void {
  try {
    sessionStorage.removeItem(pairKey);
  } catch {
    // Nothing was kept.
  }
}
