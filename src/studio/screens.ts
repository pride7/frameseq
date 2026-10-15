import { desktop } from "./desktop";

/** A screen as the Window Management API describes it, which Chromium has. */
export interface PlacedScreen extends Screen {
  readonly availLeft: number;
  readonly availTop: number;
  readonly left: number;
  readonly top: number;
  readonly isInternal: boolean;
  readonly isPrimary: boolean;
  readonly label: string;
  readonly devicePixelRatio: number;
}

interface ScreenDetails extends EventTarget {
  readonly screens: readonly PlacedScreen[];
  readonly currentScreen: PlacedScreen;
}

/** A screen the slides can be shown on, as Present › Show screen lists it. */
export interface ShowScreen {
  /** The same for a screen while it keeps its name and place, so that the choice is remembered. */
  key: string;
  /** What the system calls it, as "DELL U2720Q", where it says. */
  name: string;
  /** Where it is, in the space all the screens share. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Its size in pixels, as the system's display settings give it. */
  pixels: { width: number; height: number };
  /** The system's main display. */
  primary: boolean;
  /** A laptop's own screen, as a browser can tell. */
  internal: boolean;
  /** The screen the Studio's window is on. */
  current: boolean;
  /** The browser's screen itself, to place windows on. */
  placed?: PlacedScreen;
}

/** Where a show goes: the slides on one screen, and presenter view, if any, on another. */
export interface ShowPlacement {
  show: ShowScreen;
  presenter?: ShowScreen;
}

const placing = window as Window & { getScreenDetails?: () => Promise<ScreenDetails> };

/** Whether a browser can tell the screens apart and place the Studio's windows on them. */
export const browserPlaces = !desktop && typeof placing.getScreenDetails === "function";

/** Whether this computer has more than one screen, as a browser that can place windows says. */
export function hasScreens(): boolean {
  return browserPlaces && Boolean((screen as Screen & { isExtended?: boolean }).isExtended);
}

export async function windowManagement(): Promise<PermissionState | undefined> {
  try {
    return (await navigator.permissions.query({ name: "window-management" as PermissionName })).state;
  } catch {
    return undefined;
  }
}

const keyOf = (name: string, left: number, top: number) => `${name}@${left},${top}`;

/** The browser's screens, which it keeps up to date once it may tell the Studio about them. */
let details: ScreenDetails | undefined;
/** The app's screens, as its window last said. */
let appScreens: ShowScreen[] = [];

/** The screens as last learned, with the Studio's own among them; none until they are known. */
export function knownScreens(): ShowScreen[] {
  if (desktop) return appScreens;
  if (!details) return [];
  const here = details.currentScreen;
  return details.screens.map((placed) => ({
    key: keyOf(placed.label, placed.left, placed.top),
    name: placed.label,
    left: placed.left,
    top: placed.top,
    width: placed.width,
    height: placed.height,
    pixels: {
      width: Math.round(placed.width * placed.devicePixelRatio),
      height: Math.round(placed.height * placed.devicePixelRatio),
    },
    primary: placed.isPrimary,
    internal: placed.isInternal,
    current: placed === here,
    placed,
  }));
}

/** Learn the screens again: from the app's window, or from a browser that may already say. */
export async function refreshScreens(): Promise<ShowScreen[]> {
  if (desktop?.screens) {
    try {
      appScreens = (await desktop.screens()).map((found) => ({
        key: keyOf(found.name, found.x, found.y),
        name: found.name,
        left: found.x,
        top: found.y,
        width: found.width,
        height: found.height,
        pixels: { width: found.width, height: found.height },
        primary: found.primary,
        internal: false,
        current: found.current,
      }));
    } catch {
      // The screens stay as they were last learned.
    }
  } else if (browserPlaces && !details && await windowManagement() === "granted") {
    await allowScreens();
  }
  return knownScreens();
}

/** Ask the browser about the screens, which the first time asks the person whether it may. */
export async function allowScreens(): Promise<boolean> {
  try {
    details = await placing.getScreenDetails!();
  } catch {
    details = undefined;
  }
  return details !== undefined;
}

const choiceKey = "frameseq-studio-show-screen";

/** The screen chosen in Present › Show screen; none chooses automatically. */
export function chosenKey(): string | undefined {
  try {
    return localStorage.getItem(choiceKey) ?? undefined;
  } catch {
    return undefined;
  }
}

export function chooseScreen(key: string | undefined): void {
  try {
    if (key) localStorage.setItem(choiceKey, key);
    else localStorage.removeItem(choiceKey);
  } catch {
    // The choice lasts until the page reloads.
  }
  remembered = key;
}

let remembered = chosenKey();

/** The chosen screen among these: the same one, or failing that the only one of its name. */
export function chosenScreen(screens: readonly ShowScreen[], key = remembered): ShowScreen | undefined {
  if (!key) return undefined;
  const same = screens.find((candidate) => candidate.key === key);
  if (same) return same;
  const name = key.slice(0, key.lastIndexOf("@"));
  const named = screens.filter((candidate) => candidate.name && candidate.name === name);
  return named.length === 1 ? named[0] : undefined;
}

/**
 * Where a show goes. A chosen screen gets the slides; otherwise, with presenter view, another
 * screen than the Studio's does, an external one first, as a projector is. Presenter view takes
 * the Studio's screen, or another when the slides take that one. Nothing means the Studio's own
 * screen, as on a computer with one.
 */
export function placeShow(screens: readonly ShowScreen[], presenterView: boolean): ShowPlacement | undefined {
  const here = screens.find((candidate) => candidate.current);
  if (!here) return undefined;
  const chosen = chosenScreen(screens);
  const besides = (taken: ShowScreen) => screens.filter((candidate) => candidate !== taken);
  if (!chosen) {
    if (!presenterView) return undefined;
    const others = besides(here);
    const there = others.find((other) => !other.internal && !other.primary)
      ?? others.find((other) => !other.internal)
      ?? others[0];
    return there ? { show: there, presenter: here } : undefined;
  }
  if (!presenterView) return { show: chosen };
  if (chosen !== here) return { show: chosen, presenter: here };
  const others = besides(here);
  const presenter = others.find((other) => other.internal) ?? others.find((other) => other.primary) ?? others[0];
  return { show: chosen, presenter };
}

/** Where a screen is from the Studio's, which tells screens of one size apart. */
export function direction(target: ShowScreen, screens: readonly ShowScreen[]): "here" | "left" | "right" | "above" | "below" {
  const here = screens.find((candidate) => candidate.current);
  if (!here || target === here) return "here";
  const dx = target.left + target.width / 2 - (here.left + here.width / 2);
  const dy = target.top + target.height / 2 - (here.top + here.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "above" : "below";
}

/** A name a person knows a screen by: not a device path such as \\.\DISPLAY1. */
export function screenName(target: ShowScreen): string {
  return target.name.startsWith("\\\\.\\") ? "" : target.name.trim();
}
