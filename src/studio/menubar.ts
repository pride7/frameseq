import type { MenuIcon } from "./menu-icons";
import { closeMenus, element, holdMenu, menuIconSlot } from "./ui";

/** One command in a menu. Its state is asked for each time the menu opens. */
export interface MenuCommand {
  /** A stable name for the command, independent of the language the menu is shown in. */
  command: string;
  label: string;
  /** A picture before the label, which a menu that has any shows in a column of its own. */
  icon?: MenuIcon;
  /**
   * A drawing of what the command makes, in place of an icon, as SVG markup: a shape by its
   * outline, or a layout as a small slide, as the gallery and the layout picker show them.
   */
  drawing?: string;
  shortcut?: string;
  run?: () => void;
  /** A check mark beside the label: a setting that is on, or the chosen one of several. */
  checked?: () => boolean;
  disabled?: () => boolean;
  /** The items of a menu that opens to the side of this one. */
  submenu?: () => MenuEntry[];
  danger?: boolean;
}

export type MenuEntry = MenuCommand | "separator";

export interface TopMenu {
  id: string;
  label: string;
  /** The letter that opens the menu with Alt. */
  accessKey: string;
  items: () => MenuEntry[];
}

interface OpenLevel {
  menu: HTMLElement;
  buttons: HTMLButtonElement[];
  entries: MenuCommand[];
  /** The item in the level above that opened this one. */
  owner?: HTMLButtonElement;
}

const ownsKeys = (event: KeyboardEvent): boolean => (
  event.target instanceof Element && event.target.closest("[data-owns-keys]") !== null
);

/**
 * A menu and the submenus opened from it, each beside the one that opened it. Hovering or Right
 * opens a submenu and Left or Escape closes it; what Left and Right do past the ends, and what
 * Escape does in the first menu, belong to whoever opened the menu.
 */
class MenuStack {
  private levels: OpenLevel[] = [];
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly owner: {
    /** Close every level, as choosing a command does. */
    close: () => void;
    /** Left or Right pressed where no submenu opens or closes. */
    sideways: (step: 1 | -1) => void;
    /** Escape pressed in the first menu. */
    escape: () => void;
    /** A class for every level, beside studio-menu. */
    className: string;
  }) {}

  contains(target: Node | null): boolean {
    return target !== null && this.levels.some((level) => level.menu.contains(target));
  }

  closeLevels(from: number): void {
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    for (const level of this.levels.splice(from)) {
      level.menu.remove();
      level.owner?.setAttribute("aria-expanded", "false");
    }
  }

  open(entries: MenuEntry[], x: number, y: number, owner: HTMLButtonElement | undefined): HTMLElement {
    const depth = this.levels.length;
    const menu = element("div", `studio-menu ${this.owner.className}`);
    menu.setAttribute("role", "menu");
    const commands: MenuCommand[] = [];
    const buttons: HTMLButtonElement[] = [];
    // A menu with pictures shows a setting that is on by its picture, or a check mark in its place.
    const iconic = entries.some((entry) => entry !== "separator" && (entry.icon || entry.drawing));
    const checkable = !iconic && entries.some((entry) => entry !== "separator" && entry.checked);
    // A menu put together from parts that may be missing shows each separator once, between items.
    const shown = entries.filter((entry, index) => entry !== "separator" || (
      index > 0 && entries[index - 1] !== "separator" && entries.slice(index + 1).some((next) => next !== "separator")
    ));
    for (const entry of shown) {
      if (entry === "separator") {
        menu.append(element("div", "studio-menu-separator"));
        continue;
      }
      const button = element("button", `studio-menu-item${entry.danger ? " is-danger" : ""}`);
      button.type = "button";
      button.dataset.command = entry.command;
      const checked = entry.checked?.();
      button.setAttribute("role", entry.checked ? "menuitemcheckbox" : "menuitem");
      if (entry.checked) button.setAttribute("aria-checked", String(Boolean(checked)));
      button.disabled = Boolean(entry.disabled?.());
      if (iconic) button.append(menuIconSlot(entry.icon, checked, entry.drawing));
      if (checkable) button.append(element("span", "studio-menu-check", checked ? "✓" : ""));
      button.append(element("span", "studio-menu-label", entry.label));
      if (entry.shortcut) button.append(element("kbd", "studio-menu-shortcut", entry.shortcut));
      if (entry.submenu) {
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        button.append(element("span", "studio-menu-arrow", "›"));
      }
      button.addEventListener("click", () => {
        if (entry.submenu) {
          this.openSubmenu(depth, button, entry, true);
          return;
        }
        this.owner.close();
        entry.run?.();
      });
      button.addEventListener("pointerenter", () => {
        if (this.hoverTimer) clearTimeout(this.hoverTimer);
        button.focus({ preventScroll: true });
        this.hoverTimer = setTimeout(() => {
          // A menu that closed meanwhile, as when one of its items was clicked, opens nothing.
          if (this.levels[depth]?.menu !== menu) return;
          if (entry.submenu) this.openSubmenu(depth, button, entry, false);
          else this.closeLevels(depth + 1);
        }, 160);
      });
      button.addEventListener("keydown", (event) => this.onItemKey(event, depth, buttons.indexOf(button)));
      commands.push(entry);
      buttons.push(button);
      menu.append(button);
    }
    document.body.append(menu);
    const box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(x, innerWidth - box.width - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(y, innerHeight - box.height - 4))}px`;
    this.levels.push({ menu, buttons, entries: commands, owner });
    return menu;
  }

  private openSubmenu(depth: number, owner: HTMLButtonElement, entry: MenuCommand, focusFirst: boolean): void {
    if (owner.disabled || !entry.submenu) return;
    if (this.levels[depth + 1]?.owner === owner) {
      if (focusFirst) this.focusItem(depth + 1, 0);
      return;
    }
    this.closeLevels(depth + 1);
    owner.setAttribute("aria-expanded", "true");
    const box = owner.getBoundingClientRect();
    const sub = this.open(entry.submenu(), box.right + 2, box.top - 5, owner);
    // Against the right edge, a submenu opens to the left of its menu instead.
    const subBox = sub.getBoundingClientRect();
    if (box.right + subBox.width > innerWidth - 4) sub.style.left = `${Math.max(4, box.left - subBox.width - 2)}px`;
    if (focusFirst) this.focusItem(depth + 1, 0);
  }

  /** Focus an enabled item of a level, counting from the end when `index` is negative. */
  focusItem(depth: number, index: number): void {
    const enabled = this.levels[depth]?.buttons.filter((button) => !button.disabled) ?? [];
    enabled[(index + enabled.length) % Math.max(enabled.length, 1)]?.focus({ preventScroll: true });
  }

  private onItemKey(event: KeyboardEvent, depth: number, index: number): void {
    const level = this.levels[depth];
    if (!level) return;
    const enabled = level.buttons.filter((button) => !button.disabled);
    const position = enabled.indexOf(level.buttons[index]);
    const entry = level.entries[index];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const step = event.key === "ArrowDown" ? 1 : -1;
      enabled[(position + step + enabled.length) % enabled.length]?.focus({ preventScroll: true });
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      if (entry.submenu) this.openSubmenu(depth, level.buttons[index], entry, true);
      else this.owner.sideways(1);
    } else if (event.key === "ArrowLeft" || event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (depth > 0) {
        const owner = level.owner;
        this.closeLevels(depth);
        owner?.focus({ preventScroll: true });
      } else if (event.key === "Escape") {
        this.owner.escape();
      } else {
        this.owner.sideways(-1);
      }
    } else if (event.key === "Tab") {
      this.owner.close();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      (event.key === "Home" ? enabled[0] : enabled[enabled.length - 1])?.focus({ preventScroll: true });
    }
  }
}

/**
 * The menu bar along the top of the Studio, as a desktop program has one: click or hover across
 * the menus, step through them with the arrow keys, open one with Alt and its letter, or reach
 * the bar with Alt or F10. Menus open to the side for their submenus.
 */
export class MenuBar {
  private readonly tops: HTMLButtonElement[] = [];
  private readonly stack = new MenuStack({
    close: () => this.close(),
    sideways: (step) => this.open((this.openIndex + step + this.tops.length) % this.tops.length, true),
    escape: () => {
      const top = this.tops[this.openIndex];
      this.close();
      top?.focus({ preventScroll: true });
    },
    className: "studio-menubar-menu",
  });

  private openIndex = -1;
  private altAlone = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly menus: TopMenu[],
    private readonly options: { showAccessKeys: boolean },
  ) {
    host.setAttribute("role", "menubar");
    for (const [index, menu] of menus.entries()) {
      const button = element("button", "studio-menubar-item");
      button.type = "button";
      button.dataset.menu = menu.id;
      button.setAttribute("role", "menuitem");
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
      button.tabIndex = index === 0 ? 0 : -1;
      button.append(...this.label(menu));
      button.addEventListener("click", () => (this.openIndex === index ? this.close() : this.open(index, false)));
      button.addEventListener("pointerenter", () => {
        if (this.openIndex >= 0 && this.openIndex !== index) this.open(index, false);
      });
      button.addEventListener("keydown", (event) => this.onTopKey(event, index));
      this.tops.push(button);
      host.append(button);
    }
    addEventListener("keydown", (event) => this.onGlobalKey(event), true);
    addEventListener("keyup", (event) => this.onGlobalKeyUp(event), true);
    addEventListener("pointerdown", (event) => {
      if (this.openIndex < 0) return;
      const target = event.target as Node;
      if (this.host.contains(target) || this.stack.contains(target)) return;
      this.close();
    }, true);
    // A click into the preview or the rail lands in another document, which only blurs this one.
    addEventListener("blur", () => this.close());
  }

  /** The menu's name, with its access letter marked; Chinese labels add it in brackets, as Windows does. */
  private label(menu: TopMenu): Node[] {
    const key = menu.accessKey.toUpperCase();
    if (this.options.showAccessKeys) {
      return [document.createTextNode(menu.label), element("span", "studio-access-paren", `(${key})`)];
    }
    const at = menu.label.toUpperCase().indexOf(key);
    if (at < 0) return [document.createTextNode(menu.label)];
    return [
      document.createTextNode(menu.label.slice(0, at)),
      element("span", "studio-access", menu.label.slice(at, at + 1)),
      document.createTextNode(menu.label.slice(at + 1)),
    ];
  }

  private open(index: number, focusFirst: boolean): void {
    this.stack.closeLevels(0);
    closeMenus();
    this.openIndex = index;
    this.tops.forEach((button, position) => {
      button.setAttribute("aria-expanded", String(position === index));
      button.classList.toggle("is-open", position === index);
    });
    const top = this.tops[index];
    top.focus({ preventScroll: true });
    const box = top.getBoundingClientRect();
    this.stack.open(this.menus[index].items(), box.left, box.bottom + 2, undefined);
    if (focusFirst) this.stack.focusItem(0, 0);
  }

  close(): void {
    if (this.openIndex < 0) return;
    this.stack.closeLevels(0);
    this.tops.forEach((button) => {
      button.setAttribute("aria-expanded", "false");
      button.classList.remove("is-open");
    });
    this.openIndex = -1;
  }

  private onTopKey(event: KeyboardEvent, index: number): void {
    const count = this.tops.length;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = (index + (event.key === "ArrowRight" ? 1 : -1) + count) % count;
      if (this.openIndex >= 0) this.open(next, true);
      else this.focusTop(next);
    } else if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.open(index, true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      this.tops[index].blur();
    }
  }

  private focusTop(index: number): void {
    this.tops.forEach((button, position) => {
      button.tabIndex = position === index ? 0 : -1;
    });
    this.tops[index].focus({ preventScroll: true });
  }

  private onGlobalKey(event: KeyboardEvent): void {
    // A part of the page that takes every key, such as the terminal, keeps Alt and F10 as well.
    if (ownsKeys(event)) {
      this.altAlone = false;
      return;
    }
    if (event.key === "Alt") {
      this.altAlone = true;
      this.host.classList.add("show-access");
      return;
    }
    this.altAlone = false;
    if (event.key === "F10" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      this.focusTop(0);
      return;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey && /^[a-z]$/i.test(event.key)) {
      const index = this.menus.findIndex((menu) => menu.accessKey.toLowerCase() === event.key.toLowerCase());
      if (index >= 0) {
        event.preventDefault();
        event.stopPropagation();
        this.open(index, true);
      }
    }
  }

  private onGlobalKeyUp(event: KeyboardEvent): void {
    if (event.key !== "Alt") return;
    this.host.classList.remove("show-access");
    if (ownsKeys(event)) {
      this.altAlone = false;
      return;
    }
    // Alt pressed and released on its own reaches the menu bar, as it does in Windows programs.
    if (this.altAlone && this.openIndex < 0) {
      event.preventDefault();
      if (this.host.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      else this.focusTop(0);
    }
    this.altAlone = false;
  }
}

/**
 * The menu a right-click opens, with the same items, submenus, and keys as the menu bar's. It
 * opens below and to the right of the point, or above and to the left where there is no room,
 * and hands the focus back to where it was when it closes. Opened from the keyboard, its first
 * item takes the focus; opened by the mouse, the arrow keys reach the items.
 */
export function showContextMenu(
  x: number,
  y: number,
  entries: MenuEntry[],
  { label, keyboard = false }: { label: string; keyboard?: boolean },
): void {
  const release = holdMenu(close);
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  let closed = false;
  const stack = new MenuStack({ close, sideways: () => undefined, escape: close, className: "studio-context-menu" });
  const menu = stack.open(entries, x, y, undefined);
  menu.setAttribute("aria-label", label);
  menu.tabIndex = -1;
  const box = menu.getBoundingClientRect();
  if (y + box.height > innerHeight - 4 && y - box.height >= 4) menu.style.top = `${y - box.height}px`;
  if (x + box.width > innerWidth - 4 && x - box.width >= 4) menu.style.left = `${x - box.width}px`;
  if (keyboard) stack.focusItem(0, 0);
  else menu.focus({ preventScroll: true });

  const onPointer = (event: PointerEvent): void => {
    if (!stack.contains(event.target as Node)) close();
  };
  // Until an item has the focus, the keys that reach one come here.
  const onKey = (event: KeyboardEvent): void => {
    const active = document.activeElement;
    if (active !== menu && stack.contains(active)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "Home" || event.key === "ArrowUp" || event.key === "End") {
      event.preventDefault();
      stack.focusItem(0, event.key === "ArrowDown" || event.key === "Home" ? 0 : -1);
    } else if (event.key === "Tab") {
      event.preventDefault();
      close();
    }
  };
  // A right-click on the menu itself opens no other menu over it.
  const swallow = (event: MouseEvent): void => {
    if (stack.contains(event.target as Node)) event.preventDefault();
  };
  function close(): void {
    if (closed) return;
    closed = true;
    removeEventListener("pointerdown", onPointer, true);
    removeEventListener("keydown", onKey, true);
    removeEventListener("blur", close);
    removeEventListener("resize", close);
    removeEventListener("contextmenu", swallow, true);
    const hadFocus = stack.contains(document.activeElement);
    stack.closeLevels(0);
    release();
    if (hadFocus && previous?.isConnected) previous.focus({ preventScroll: true });
  }
  addEventListener("pointerdown", onPointer, true);
  addEventListener("keydown", onKey, true);
  // A click into the preview or the rail lands in another document, which only blurs this one.
  addEventListener("blur", close);
  addEventListener("resize", close);
  addEventListener("contextmenu", swallow, true);
}
