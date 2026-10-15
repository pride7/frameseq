import { call } from "./api";
import { t } from "./i18n";
import { closeMenus, element } from "./ui";

/** Lucide's icons as the Studio's server hands them over: the inside of each SVG, by name. */
interface IconSet {
  width: number;
  height: number;
  icons: Record<string, string>;
}

let loading: Promise<IconSet> | undefined;

function loadIcons(): Promise<IconSet> {
  loading ??= call<IconSet>("GET", "icons").catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

/** At most this many icons are drawn at once; searching narrows the rest down. */
const shown = 160;

let openPicker: { close: () => void } | undefined;

/**
 * Choose an icon by its picture, as a drawing program's icon dialog does: a search box over a
 * grid of the set, the current icon marked. Resolves to the name chosen, or undefined.
 */
export function chooseIcon(anchor: HTMLElement, current?: string): Promise<string | undefined> {
  openPicker?.close();
  closeMenus();
  return new Promise((resolveChoice) => {
    const picker = element("div", "studio-icon-picker");
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", t.icons.title);
    const search = element("input", "studio-icon-search");
    search.type = "search";
    search.placeholder = t.icons.search;
    search.spellcheck = false;
    search.setAttribute("aria-label", t.icons.search);
    const grid = element("div", "studio-icon-grid");
    grid.setAttribute("role", "listbox");
    const status = element("p", "studio-icon-status", t.icons.loading);
    picker.append(element("p", "studio-icon-title", t.icons.title), search, grid, status);
    document.body.append(picker);

    const place = (): void => {
      const box = anchor.getBoundingClientRect();
      const size = picker.getBoundingClientRect();
      picker.style.left = `${Math.max(6, Math.min(box.left, innerWidth - size.width - 6))}px`;
      const below = box.bottom + 4;
      picker.style.top = `${below + size.height > innerHeight - 6 ? Math.max(6, box.top - size.height - 4) : below}px`;
    };
    place();

    let set: IconSet | undefined;
    let settled = false;
    const finish = (name: string | undefined): void => {
      if (settled) return;
      settled = true;
      close();
      resolveChoice(name);
    };

    const draw = (): void => {
      if (!set) return;
      const words = search.value.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
      const names = Object.keys(set.icons).filter((name) => words.every((word) => name.includes(word)));
      // The icon in use comes first, so it can be kept with one key.
      if (current && !words.length && names.includes(current)) {
        names.splice(names.indexOf(current), 1);
        names.unshift(current);
      }
      grid.replaceChildren(...names.slice(0, shown).map((name) => {
        const button = element("button", `studio-icon-choice${name === current ? " is-current" : ""}`);
        button.type = "button";
        button.title = name;
        button.dataset.name = name;
        button.setAttribute("role", "option");
        button.setAttribute("aria-label", name);
        // The pictures are Lucide's own, from the package the slides draw them with.
        button.innerHTML = `<svg viewBox="0 0 ${set?.width ?? 24} ${set?.height ?? 24}" aria-hidden="true">${set?.icons[name] ?? ""}</svg>`;
        button.addEventListener("click", () => finish(name));
        return button;
      }));
      status.textContent = names.length === 0
        ? t.icons.none
        : (names.length > shown ? t.icons.some(shown, names.length) : t.icons.all(names.length));
    };

    loadIcons().then((icons) => {
      set = icons;
      draw();
      place();
    }, (error: unknown) => {
      status.textContent = error instanceof Error ? error.message : String(error);
    });

    search.addEventListener("input", draw);
    const buttons = (): HTMLButtonElement[] => [...grid.querySelectorAll<HTMLButtonElement>(".studio-icon-choice")];
    // How many icons a row holds, from where the grid wrapped its first row.
    const columns = (): number => {
      const all = buttons();
      const top = all[0]?.getBoundingClientRect().top;
      const wrapped = all.findIndex((button) => button.getBoundingClientRect().top !== top);
      return wrapped > 0 ? wrapped : Math.max(all.length, 1);
    };
    const onKey = (event: KeyboardEvent): void => {
      const all = buttons();
      const index = all.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(undefined);
        anchor.focus();
      } else if (event.key === "Enter" && document.activeElement === search) {
        event.preventDefault();
        if (all[0]) finish(all[0].dataset.name);
      } else if (event.key === "ArrowDown" && document.activeElement === search) {
        event.preventDefault();
        all[0]?.focus();
      } else if (index >= 0 && event.key.startsWith("Arrow")) {
        event.preventDefault();
        const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns(), ArrowUp: -columns() }[event.key] ?? 0;
        const next = index + step;
        if (next < 0) search.focus();
        else all[Math.min(next, all.length - 1)]?.focus();
      }
    };
    const onPointer = (event: PointerEvent): void => {
      if (!picker.contains(event.target as Node)) finish(undefined);
    };
    function close(): void {
      picker.remove();
      removeEventListener("keydown", onKey, true);
      removeEventListener("pointerdown", onPointer, true);
      if (openPicker?.close === close) openPicker = undefined;
    }
    addEventListener("keydown", onKey, true);
    addEventListener("pointerdown", onPointer, true);
    openPicker = { close: () => finish(undefined) };
    search.focus();
  });
}
