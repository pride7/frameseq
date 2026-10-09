/** Small pieces of interface shared by the Studio's panels. */

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  if (className) created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}

export function required<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`FrameSeq Studio is missing ${selector}`);
  return found;
}

export interface ToastAction {
  label: string;
  run: () => void;
  primary?: boolean;
}

export interface ToastHandle {
  update: (message: string, options?: { tone?: ToastTone; actions?: ToastAction[]; timeout?: number }) => void;
  close: () => void;
}

export type ToastTone = "info" | "success" | "warning" | "error" | "busy";

let toastHost: HTMLElement | undefined;
const keyedToasts = new Map<string, ToastHandle>();

/**
 * A short message in the corner, optionally with buttons; busy toasts stay until updated. A
 * toast given a key replaces the open one with the same key instead of stacking beside it.
 */
export function toast(
  message: string,
  { tone = "info", actions = [], timeout, key }: {
    tone?: ToastTone;
    actions?: ToastAction[];
    timeout?: number;
    key?: string;
  } = {},
): ToastHandle {
  const existing = key ? keyedToasts.get(key) : undefined;
  if (existing) {
    existing.update(message, { tone, actions, timeout });
    return existing;
  }
  toastHost ??= document.body.appendChild(element("div", "studio-toasts"));
  toastHost.setAttribute("role", "status");
  toastHost.setAttribute("aria-live", "polite");
  const item = element("div", "studio-toast");
  const text = element("div", "studio-toast-text");
  const buttons = element("div", "studio-toast-actions");
  const dismiss = element("button", "studio-toast-close", "×");
  dismiss.type = "button";
  dismiss.setAttribute("aria-label", "Dismiss");
  item.append(text, buttons, dismiss);
  toastHost.append(item);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const close = (): void => {
    if (timer) clearTimeout(timer);
    if (key && keyedToasts.get(key) === handle) keyedToasts.delete(key);
    item.classList.add("is-leaving");
    setTimeout(() => item.remove(), 160);
  };
  dismiss.addEventListener("click", close);

  const update: ToastHandle["update"] = (nextMessage, options = {}) => {
    const nextTone = options.tone ?? tone;
    item.dataset.tone = nextTone;
    text.textContent = nextMessage;
    buttons.replaceChildren(...(options.actions ?? actions).map((action) => {
      const button = element("button", action.primary ? "is-primary" : "", action.label);
      button.type = "button";
      button.addEventListener("click", () => {
        action.run();
        close();
      });
      return button;
    }));
    if (timer) clearTimeout(timer);
    const duration = options.timeout ?? (nextTone === "busy" ? 0 : (nextTone === "error" ? 9000 : 4200));
    if (duration > 0) timer = setTimeout(close, duration);
  };
  const handle: ToastHandle = { update, close };
  if (key) keyedToasts.set(key, handle);
  update(message, { tone, actions, timeout });
  return handle;
}

export interface MenuItem {
  label: string;
  shortcut?: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
}

let openMenu: { close: () => void } | undefined;

/**
 * A context or drop-down menu at a point on the page, closed by Escape or a click elsewhere.
 * A note is a line of explanation above the items it qualifies.
 */
export function showMenu(
  x: number,
  y: number,
  items: Array<MenuItem | "separator" | { note: string }>,
  label: string,
): void {
  openMenu?.close();
  const menu = element("div", "studio-menu");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", label);
  const buttons: HTMLButtonElement[] = [];
  for (const item of items) {
    if (item === "separator") {
      menu.append(element("div", "studio-menu-separator"));
      continue;
    }
    if ("note" in item) {
      menu.append(element("p", "studio-menu-note", item.note));
      continue;
    }
    const button = element("button", `studio-menu-item${item.danger ? " is-danger" : ""}`);
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.disabled = Boolean(item.disabled);
    button.append(element("span", "studio-menu-label", item.label));
    if (item.shortcut) button.append(element("kbd", "studio-menu-shortcut", item.shortcut));
    button.addEventListener("click", () => {
      close();
      item.run();
    });
    buttons.push(button);
    menu.append(button);
  }
  document.body.append(menu);
  const box = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(6, Math.min(x, innerWidth - box.width - 6))}px`;
  menu.style.top = `${Math.max(6, Math.min(y, innerHeight - box.height - 6))}px`;

  const onPointer = (event: PointerEvent): void => {
    if (!menu.contains(event.target as Node)) close();
  };
  const onKey = (event: KeyboardEvent): void => {
    const enabled = buttons.filter((button) => !button.disabled);
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      enabled[(index + step + enabled.length) % enabled.length]?.focus();
    }
  };
  function close(): void {
    menu.remove();
    removeEventListener("pointerdown", onPointer, true);
    removeEventListener("keydown", onKey, true);
    removeEventListener("blur", close);
    if (openMenu?.close === close) openMenu = undefined;
  }
  addEventListener("pointerdown", onPointer, true);
  addEventListener("keydown", onKey, true);
  addEventListener("blur", close);
  openMenu = { close };
  buttons.find((button) => !button.disabled)?.focus();
}

/** Ask for one line of text in a small dialog; resolves to undefined when cancelled. */
export function askText({
  title,
  message,
  value,
  confirm,
  validate,
}: {
  title: string;
  message: string;
  value: string;
  confirm: string;
  validate: (value: string) => string | undefined;
}): Promise<string | undefined> {
  return new Promise((resolveAnswer) => {
    const dialog = element("dialog", "studio-dialog");
    const form = element("form");
    form.method = "dialog";
    const heading = element("h2", "", title);
    const text = element("p", "", message);
    const input = element("input");
    input.type = "text";
    input.value = value;
    input.spellcheck = false;
    input.setAttribute("aria-label", title);
    const problem = element("p", "studio-dialog-problem");
    const actions = element("div", "studio-dialog-actions");
    const cancel = element("button", "studio-button", "Cancel");
    cancel.type = "button";
    const accept = element("button", "studio-button is-primary", confirm);
    accept.type = "submit";
    actions.append(cancel, accept);
    form.append(heading, text, input, problem, actions);
    dialog.append(form);
    document.body.append(dialog);

    let answer: string | undefined;
    const check = (): boolean => {
      const reason = validate(input.value.trim());
      problem.textContent = reason ?? "";
      accept.disabled = Boolean(reason);
      return !reason;
    };
    input.addEventListener("input", check);
    form.addEventListener("submit", (event) => {
      if (!check()) {
        event.preventDefault();
        return;
      }
      answer = input.value.trim();
    });
    cancel.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolveAnswer(answer);
    }, { once: true });
    dialog.showModal();
    check();
    input.select();
  });
}

const sizesKey = "frameseq-studio-layout";

function readSizes(): Record<string, number> {
  try {
    const value = JSON.parse(localStorage.getItem(sizesKey) ?? "{}") as unknown;
    return value && typeof value === "object" ? value as Record<string, number> : {};
  } catch {
    return {};
  }
}

function storeSize(name: string, value: number): void {
  try {
    localStorage.setItem(sizesKey, JSON.stringify({ ...readSizes(), [name]: value }));
  } catch {
    // The layout simply resets next time.
  }
}

/**
 * A draggable divider that sets one CSS length on the Studio, such as the rail's width. The
 * size is remembered in this browser, and a double-click puts the default back.
 */
export function splitter(
  handle: HTMLElement,
  {
    host,
    variable,
    axis,
    fallback,
    minimum,
    maximum,
    invert = false,
    onResize,
  }: {
    host: HTMLElement;
    variable: string;
    axis: "x" | "y";
    fallback: number;
    minimum: number;
    maximum: () => number;
    invert?: boolean;
    onResize?: () => void;
  },
): void {
  const clamp = (value: number): number => Math.round(Math.min(Math.max(value, minimum), maximum()));
  const apply = (value: number): void => {
    host.style.setProperty(variable, `${clamp(value)}px`);
    onResize?.();
  };
  const stored = readSizes()[variable];
  apply(typeof stored === "number" ? stored : fallback);
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", axis === "x" ? "vertical" : "horizontal");
  handle.tabIndex = 0;

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = axis === "x" ? event.clientX : event.clientY;
    const initial = Number.parseFloat(getComputedStyle(host).getPropertyValue(variable)) || fallback;
    handle.setPointerCapture(event.pointerId);
    host.classList.add("is-resizing", axis === "x" ? "is-resizing-x" : "is-resizing-y");
    const move = (moveEvent: PointerEvent): void => {
      const delta = (axis === "x" ? moveEvent.clientX : moveEvent.clientY) - start;
      apply(initial + (invert ? -delta : delta));
    };
    const end = (): void => {
      handle.removeEventListener("pointermove", move);
      host.classList.remove("is-resizing", "is-resizing-x", "is-resizing-y");
      storeSize(variable, clamp(Number.parseFloat(getComputedStyle(host).getPropertyValue(variable)) || fallback));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end, { once: true });
    handle.addEventListener("pointercancel", end, { once: true });
  });
  handle.addEventListener("dblclick", () => {
    apply(fallback);
    storeSize(variable, fallback);
  });
  handle.addEventListener("keydown", (event) => {
    const keys = axis === "x" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = Number.parseFloat(getComputedStyle(host).getPropertyValue(variable)) || fallback;
    const direction = event.key === keys[1] ? 1 : -1;
    apply(current + direction * (invert ? -16 : 16));
    storeSize(variable, clamp(current + direction * (invert ? -16 : 16)));
  });
}

export function readPreference(name: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(`frameseq-studio-${name}`);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

export function storePreference(name: string, value: boolean): void {
  try {
    localStorage.setItem(`frameseq-studio-${name}`, value ? "1" : "0");
  } catch {
    // Preferences are a convenience.
  }
}

export function formatDuration(milliseconds: number): string {
  return milliseconds < 1000 ? `${milliseconds} ms` : `${(milliseconds / 1000).toFixed(1)} s`;
}
