import { presentationFileName } from "../../scripts/presentation-file.mjs";
import {
  call,
  StudioRequestError,
  type ChooseResponse,
  type FilesResponse,
  type OpenResponse,
  type RecentPresentation,
  type StudioSession,
} from "./api";
import { askText, element, required, showMenu, toast, type MenuItem } from "./ui";

/** What the open document must settle before another presentation replaces it. */
export interface LeaveGuard {
  /** Save or set aside unsaved edits; false keeps the document open. */
  leave: () => Promise<boolean>;
  /** The other presentation did not open after all, so the document stays. */
  stay: () => void;
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const delay = (milliseconds: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

/** The last two folders of a path, enough to tell presentations of the same name apart. */
function shortFolder(folder: string): string {
  const parts = folder.split(/[\\/]/).filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : folder;
}

/** A folder as the start of a path, with the separator its own platform uses. */
function folderPrefix(folder: string): string {
  if (!folder) return "";
  const separator = folder.includes("\\") ? "\\" : "/";
  return folder.endsWith(separator) ? folder : `${folder}${separator}`;
}

/**
 * The server restarts on the presentation just opened. Cover the page while it does, and
 * reload into the new document once the server answers for it.
 */
async function reloadInto(opened: OpenResponse): Promise<void> {
  const cover = element("div", "studio-switching");
  cover.append(element("div", "studio-splash", `Opening ${opened.name}…`));
  document.body.append(cover);
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    await delay(300);
    try {
      const response = await fetch("/__frameseq/studio/session", { cache: "no-store" });
      const session = await response.json() as Partial<StudioSession>;
      if (response.ok && session.entry === opened.path) {
        location.reload();
        return;
      }
    } catch {
      // The server is between the old document and the new one.
    }
  }
  cover.remove();
  toast(`${opened.name} did not open. The FrameSeq output may say why.`, { tone: "error" });
}

/** Opening, creating, and switching presentations, for the start page and the file menu. */
export class Presentations {
  constructor(
    private readonly session: StudioSession,
    private readonly guard: LeaveGuard = { leave: async () => true, stay: () => undefined },
  ) {}

  files(): Promise<FilesResponse> {
    return call<FilesResponse>("GET", "files");
  }

  /** Pick a presentation in this computer's open dialog, or by its path where there is none. */
  async open(): Promise<void> {
    const { folder } = await this.files().catch(() => ({ folder: "", recent: [] }));
    let path: string | undefined;
    let asked = false;
    if (this.session.dialogs) {
      let chosen: ChooseResponse;
      try {
        chosen = await call<ChooseResponse>("POST", "files/choose", { kind: "open", folder });
      } catch (error) {
        toast(message(error), { tone: "warning" });
        return;
      }
      if (chosen.cancelled) return;
      path = chosen.path;
      asked = Boolean(path);
    }
    if (!asked) {
      path = await askText({
        title: "Open a presentation",
        message: "The full path of its slide document, such as talk.slides.ts.",
        value: folderPrefix(folder),
        confirm: "Open",
        validate: (value) => (/\.ts$/i.test(value) ? undefined : "A FrameSeq presentation is a .ts file."),
      });
    }
    if (path) await this.openPath(path);
  }

  async openPath(path: string): Promise<void> {
    if (!await this.guard.leave()) return;
    try {
      const opened = await call<OpenResponse>("POST", "files/open", { path });
      if (opened.current) {
        this.guard.stay();
        return;
      }
      await reloadInto(opened);
    } catch (error) {
      this.guard.stay();
      toast(message(error), { tone: "error" });
    }
  }

  /** Name a new presentation and choose its folder; it opens as soon as it is written. */
  async create(): Promise<void> {
    const { folder } = await this.files().catch(() => ({ folder: "", recent: [] }));
    const dialog = element("dialog", "studio-dialog studio-new-dialog");
    const form = element("form");
    form.method = "dialog";
    const title = element("input");
    title.type = "text";
    title.name = "title";
    title.placeholder = "Quarterly review";
    title.spellcheck = false;
    const place = element("input");
    place.type = "text";
    place.name = "folder";
    place.value = folder;
    place.spellcheck = false;
    const titleField = element("label", "studio-field");
    titleField.append(element("span", "", "Title"), title);
    const row = element("span", "studio-field-row");
    row.append(place);
    if (this.session.dialogs) {
      const browse = element("button", "studio-button", "Browse…");
      browse.type = "button";
      browse.dataset.action = "browse-folder";
      browse.addEventListener("click", () => void (async () => {
        browse.disabled = true;
        try {
          const chosen = await call<ChooseResponse>("POST", "files/choose", { kind: "folder", folder: place.value.trim() });
          if (chosen.path) place.value = chosen.path;
          else if (chosen.unavailable) toast("This computer has no folder dialog. Type the folder's path instead.", { tone: "warning" });
        } catch (error) {
          toast(message(error), { tone: "warning" });
        } finally {
          browse.disabled = false;
          place.focus();
        }
      })());
      row.append(browse);
    }
    const placeField = element("label", "studio-field");
    placeField.append(element("span", "", "Folder"), row);
    const file = element("p", "studio-new-file");
    const problem = element("p", "studio-dialog-problem");
    const actions = element("div", "studio-dialog-actions");
    const cancel = element("button", "studio-button", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => dialog.close());
    const accept = element("button", "studio-button is-primary", "Create");
    accept.type = "submit";
    actions.append(cancel, accept);
    form.append(element("h2", "", "New presentation"), titleField, placeField, file, problem, actions);
    dialog.append(form);
    document.body.append(dialog);

    const describe = (): void => {
      const name = presentationFileName(title.value);
      file.replaceChildren("Saved as ", element("code", "", name));
      problem.replaceChildren();
      accept.disabled = !title.value.trim() || !place.value.trim();
    };
    title.addEventListener("input", describe);
    place.addEventListener("input", describe);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (accept.disabled) return;
      void (async () => {
        accept.disabled = true;
        if (!await this.guard.leave()) {
          dialog.close();
          return;
        }
        try {
          const opened = await call<OpenResponse>("POST", "files/create", {
            title: title.value.trim(),
            folder: place.value.trim(),
          });
          dialog.close();
          await reloadInto(opened);
        } catch (error) {
          this.guard.stay();
          accept.disabled = false;
          problem.replaceChildren(message(error));
          const existing = error instanceof StudioRequestError ? error.data.path : undefined;
          if (typeof existing === "string") {
            const open = element("button", "studio-link-button", "Open it");
            open.type = "button";
            open.addEventListener("click", () => {
              dialog.close();
              void this.openPath(existing);
            });
            problem.append(" ", open);
          }
        }
      })();
    });
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
    describe();
    title.focus();
  }

  /** The file menu under the document's name: new, open, the recent presentations, its folder. */
  async showMenu(anchor: HTMLElement): Promise<void> {
    const { recent } = await this.files().catch(() => ({ recent: [] as RecentPresentation[] }));
    const others = recent.filter((item) => item.path !== this.session.entry).slice(0, 8);
    const box = anchor.getBoundingClientRect();
    const items: Array<MenuItem | "separator" | { heading: string }> = [
      { label: "New presentation…", run: () => void this.create() },
      { label: "Open…", shortcut: /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘O" : "Ctrl+O", run: () => void this.open() },
    ];
    if (others.length > 0) {
      items.push("separator", { heading: "Recent" }, ...others.map((item) => ({
        label: item.name,
        shortcut: shortFolder(item.folder),
        run: () => void this.openPath(item.path),
      })));
    }
    items.push("separator", {
      label: "Show in folder",
      run: () => void call("POST", "files/reveal").catch((error) => toast(message(error), { tone: "error" })),
    });
    showMenu(box.left, box.bottom + 6, items, "Presentation");
  }
}

/**
 * The Studio with no presentation open: start a new one, open one, or pick up a recent one.
 * It is what `frameseq studio` shows without a file, and what a shortcut opens.
 */
export async function showStartPage(root: HTMLElement, session: StudioSession, logo: string): Promise<void> {
  const presentations = new Presentations(session);
  root.className = "studio is-start";
  document.title = "FrameSeq Studio";
  root.innerHTML = `
    <div class="studio-start">
      <header class="studio-start-header">${logo}<h1>FrameSeq <b>Studio</b></h1></header>
      <div class="studio-start-actions">
        <button type="button" class="studio-start-action is-primary" data-start="new">
          <span class="studio-start-glyph" aria-hidden="true">+</span>
          <span><b>New presentation</b><small>A cover and a first slide, ready to write</small></span>
        </button>
        <button type="button" class="studio-start-action" data-start="open">
          <span class="studio-start-glyph" aria-hidden="true">↗</span>
          <span><b>Open…</b><small>A .slides.ts file on this computer</small></span>
        </button>
      </div>
      <section class="studio-start-recent" aria-label="Recent presentations">
        <h2>Recent</h2>
        <ul data-slot="recent"></ul>
      </section>
      <p class="studio-start-note"></p>
    </div>
  `;
  required<HTMLElement>(root, ".studio-start-note").textContent = session.quitOnClose
    ? "Closing this window stops FrameSeq Studio."
    : "FrameSeq Studio runs until you stop it in its terminal.";
  const list = required<HTMLUListElement>(root, "[data-slot='recent']");

  const showRecent = (recent: RecentPresentation[]): void => {
    if (recent.length === 0) {
      list.replaceChildren(element("li", "studio-start-empty", "Presentations you open appear here."));
      return;
    }
    list.replaceChildren(...recent.map((item) => {
      const row = element("li", "studio-start-recent-row");
      const open = element("button", "studio-start-recent-item");
      open.type = "button";
      open.title = item.path;
      open.dataset.path = item.path;
      open.append(element("span", "studio-start-recent-name", item.name), element("span", "studio-start-recent-folder", item.folder));
      open.addEventListener("click", () => void presentations.openPath(item.path));
      const forget = element("button", "studio-icon-button", "×");
      forget.type = "button";
      forget.title = "Remove from this list";
      forget.setAttribute("aria-label", `Remove ${item.name} from this list`);
      forget.addEventListener("click", () => void call<{ recent: RecentPresentation[] }>("POST", "files/forget", { path: item.path })
        .then((result) => showRecent(result.recent))
        .catch((error) => toast(message(error), { tone: "error" })));
      row.append(open, forget);
      return row;
    }));
  };
  showRecent((await presentations.files().catch(() => ({ recent: [] as RecentPresentation[] }))).recent);

  root.addEventListener("click", (event) => {
    const action = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-start]")?.dataset.start : undefined;
    if (action === "new") void presentations.create();
    if (action === "open") void presentations.open();
  });
  addEventListener("keydown", (event) => {
    const primary = /Mac|iPhone|iPad/.test(navigator.platform) ? event.metaKey : event.ctrlKey;
    if (primary && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "o") {
      event.preventDefault();
      void presentations.open();
    }
  });
  required<HTMLButtonElement>(root, "[data-start='new']").focus();
}
