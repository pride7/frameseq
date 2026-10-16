import { t } from "./i18n";

/**
 * What the FrameSeq app's own window offers the Studio, as `window.frameseqShell`. A browser
 * has none of it, and there the Studio is a page like any other.
 *
 * - "custom": the window has no title bar of the system's (Windows), so the top bar is the
 *   title bar: it moves the window, and the window's buttons sit at its right end.
 * - "overlay": the system's traffic lights sit over the top bar's left end (macOS).
 * - "native": the system draws the title bar as usual (Linux).
 */
/** A screen as the app's window sees it, in the system's pixels. */
export interface DesktopScreen {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  primary: boolean;
  /** The screen the window is on. */
  current: boolean;
}

export interface DesktopShell {
  chrome: "custom" | "overlay" | "native";
  platform: "windows" | "macos" | "linux" | "harmonyos";
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  startDragging(): Promise<void>;
  close(): Promise<void>;
  onResized(callback: () => void): Promise<unknown>;
  /** The window closes only once `decide` resolves to true. */
  onCloseRequested(decide: () => Promise<boolean>): Promise<unknown>;
  openExternal(url: string): Promise<void>;
  /** The screens of this computer. An app older than the Studio's page has none of the below. */
  screens?(): Promise<DesktopScreen[]>;
  /**
   * Take the window full screen for a slide show: onto the screen whose corner is at `slides`,
   * or where it is, with presenter view's address opened over the screen at `presenter`.
   */
  startShow?(show: {
    slides: { x: number; y: number } | null;
    presenter: { address: string; x: number; y: number } | null;
  }): Promise<void>;
  /** Close presenter view and bring the window back from full screen, to where it was. */
  endShow?(): Promise<void>;
  /** Bring the window to the front, out of the taskbar or the Dock if need be. */
  focus?(): Promise<void>;
}

declare global {
  interface Window {
    frameseqShell?: DesktopShell;
  }
}

export const desktop: DesktopShell | undefined = window.frameseqShell;

/** Open a web page in the default browser: from the app's window, which keeps its own window
 * for the Studio's pages, and from a browser, in a new tab. */
export function openOutside(url: string): void {
  const address = new URL(url, location.href).href;
  if (desktop) void desktop.openExternal(address);
  else window.open(address, "_blank");
}

/**
 * Come to the front, as when the presentation is opened again from outside the Studio. A
 * browser's window may refuse, and then the program that opened the presentation tries.
 */
export function bringToFront(): void {
  if (desktop?.focus) void desktop.focus().catch(() => window.focus());
  else window.focus();
}

/** Whether the window may close: the Studio asks about unsaved edits first. */
export function guardWindowClose(decide: () => Promise<boolean>): void {
  void desktop?.onCloseRequested(decide);
}

const icons = {
  minimize: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5.5h10" stroke="currentColor" /></svg>',
  maximize: '<svg viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" /></svg>',
  restore: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" /><rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" /></svg>',
  close: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" /></svg>',
};

/** Parts of a drag area that stay controls of their own. */
const interactive = "button, a, input, select, textarea, label, [role='menu'], [role='menuitem'], [contenteditable='true']";

/**
 * Fit the page to the app's window: mark the root with the kind of frame, and for a window
 * without a title bar, add the window's buttons and let the top bar move the window.
 */
export function installWindowFrame(): void {
  if (!desktop) return;
  const html = document.documentElement;
  html.classList.add("is-desktop", `is-desktop-${desktop.chrome}`, `is-desktop-${desktop.platform}`);
  if (desktop.platform === "harmonyos") {
    // The soft keyboard can resize the visible viewport without changing 100vh.
    const fitViewport = () => {
      const height = Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight);
      html.style.setProperty("--studio-viewport-height", `${height}px`);
    };
    fitViewport();
    window.addEventListener("resize", fitViewport);
    window.visualViewport?.addEventListener("resize", fitViewport);
  }
  if (desktop.chrome === "native") return;

  // A strip to move the window by, for pages without a top bar: the start page and errors.
  const strip = document.createElement("div");
  strip.className = "studio-window-drag";
  strip.dataset.windowDrag = "";
  document.body.append(strip);

  // Pressing on a drag area moves the window; pressing twice maximises or restores it.
  document.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    if (!event.target.closest("[data-window-drag]") || event.target.closest(interactive)) return;
    event.preventDefault();
    if (event.detail === 2) void desktop.toggleMaximize();
    else void desktop.startDragging();
  });

  if (desktop.chrome !== "custom") return;
  const controls = document.createElement("div");
  controls.className = "studio-window-controls";
  const button = (name: keyof typeof icons, label: string, run: () => void) => {
    const control = document.createElement("button");
    control.type = "button";
    control.className = `studio-window-control is-${name}`;
    control.dataset.window = name;
    control.title = label;
    control.setAttribute("aria-label", label);
    control.innerHTML = icons[name];
    // The buttons act without taking focus from the editor, as a title bar's do.
    control.addEventListener("mousedown", (event) => event.preventDefault());
    control.addEventListener("click", run);
    controls.append(control);
    return control;
  };
  button("minimize", t.window.minimize, () => void desktop.minimize());
  const maximize = button("maximize", t.window.maximize, () => void desktop.toggleMaximize());
  button("close", t.window.close, () => void desktop.close());
  document.body.append(controls);

  const showState = async () => {
    const maximized = await desktop.isMaximized().catch(() => false);
    html.classList.toggle("is-window-maximized", maximized);
    maximize.innerHTML = maximized ? icons.restore : icons.maximize;
    maximize.title = maximized ? t.window.restore : t.window.maximize;
    maximize.setAttribute("aria-label", maximize.title);
  };
  void desktop.onResized(() => void showState());
  void showState();
}
