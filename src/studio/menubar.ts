import { closeMenus, element } from "./ui";

/** One command in a menu. Its state is asked for each time the menu opens. */
export interface MenuCommand {
  /** A stable name for the command, independent of the language the menu is shown in. */
  command: string;
  label: string;
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

/**
 * The menu bar along the top of the Studio, as a desktop program has one: click or hover across
 * the menus, step through them with the arrow keys, open one with Alt and its letter, or reach
 * the bar with Alt or F10. Menus open to the side for their submenus.
 */
export class MenuBar {
  private readonly tops: HTMLButtonElement[] = [];
  private levels: OpenLevel[] = [];
  private openIndex = -1;
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;
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
      if (this.host.contains(target) || this.levels.some((level) => level.menu.contains(target))) return;
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
    this.closeLevels(0);
    closeMenus();
    this.openIndex = index;
    this.tops.forEach((button, position) => {
      button.setAttribute("aria-expanded", String(position === index));
      button.classList.toggle("is-open", position === index);
    });
    const top = this.tops[index];
    top.focus({ preventScroll: true });
    const box = top.getBoundingClientRect();
    this.openLevel(this.menus[index].items(), box.left, box.bottom + 2, undefined);
    if (focusFirst) this.focusItem(0, 0);
  }

  close(): void {
    if (this.openIndex < 0) return;
    this.closeLevels(0);
    this.tops.forEach((button) => {
      button.setAttribute("aria-expanded", "false");
      button.classList.remove("is-open");
    });
    this.openIndex = -1;
  }

  private closeLevels(from: number): void {
    for (const level of this.levels.splice(from)) {
      level.menu.remove();
      level.owner?.setAttribute("aria-expanded", "false");
    }
  }

  private openLevel(entries: MenuEntry[], x: number, y: number, owner: HTMLButtonElement | undefined): void {
    const depth = this.levels.length;
    const menu = element("div", "studio-menu studio-menubar-menu");
    menu.setAttribute("role", "menu");
    const commands: MenuCommand[] = [];
    const buttons: HTMLButtonElement[] = [];
    const checkable = entries.some((entry) => entry !== "separator" && entry.checked);
    for (const entry of entries) {
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
        this.close();
        entry.run?.();
      });
      button.addEventListener("pointerenter", () => {
        if (this.hoverTimer) clearTimeout(this.hoverTimer);
        button.focus({ preventScroll: true });
        this.hoverTimer = setTimeout(() => {
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
    this.openLevel(entry.submenu(), box.right + 2, box.top - 5, owner);
    // Against the right edge, a submenu opens to the left of its menu instead.
    const sub = this.levels[depth + 1].menu;
    const subBox = sub.getBoundingClientRect();
    if (box.right + subBox.width > innerWidth - 4) sub.style.left = `${Math.max(4, box.left - subBox.width - 2)}px`;
    if (focusFirst) this.focusItem(depth + 1, 0);
  }

  private focusItem(depth: number, index: number): void {
    const enabled = this.levels[depth]?.buttons.filter((button) => !button.disabled) ?? [];
    enabled[(index + enabled.length) % Math.max(enabled.length, 1)]?.focus({ preventScroll: true });
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
      else this.open((this.openIndex + 1) % this.tops.length, true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      if (depth > 0) {
        const owner = level.owner;
        this.closeLevels(depth);
        owner?.focus({ preventScroll: true });
      } else {
        this.open((this.openIndex - 1 + this.tops.length) % this.tops.length, true);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (depth > 0) {
        const owner = level.owner;
        this.closeLevels(depth);
        owner?.focus({ preventScroll: true });
      } else {
        const top = this.tops[this.openIndex];
        this.close();
        top?.focus({ preventScroll: true });
      }
    } else if (event.key === "Tab") {
      this.close();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      (event.key === "Home" ? enabled[0] : enabled[enabled.length - 1])?.focus({ preventScroll: true });
    }
  }

  private focusTop(index: number): void {
    this.tops.forEach((button, position) => {
      button.tabIndex = position === index ? 0 : -1;
    });
    this.tops[index].focus({ preventScroll: true });
  }

  private onGlobalKey(event: KeyboardEvent): void {
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
    // Alt pressed and released on its own reaches the menu bar, as it does in Windows programs.
    if (this.altAlone && this.openIndex < 0) {
      event.preventDefault();
      if (this.host.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      else this.focusTop(0);
    }
    this.altAlone = false;
  }
}
