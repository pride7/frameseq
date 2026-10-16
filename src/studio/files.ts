import { isPresentationFile, presentationFileName, presentationTemplate, presentationTemplates } from "../../scripts/presentation-file.mjs";
import {
  call,
  StudioRequestError,
  type ChooseResponse,
  type FilesResponse,
  type OpenResponse,
  type RecentPresentation,
  type StudioSession,
  type TemplatesResponse,
  type UserTemplate,
} from "./api";
import { language, switchLanguage, t } from "./i18n";
import { askChoice, askText, element, required, showMenu, toast, type MenuItem } from "./ui";

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

const templateKey = "frameseq-studio-template";

/** The template this browser last made a presentation from, or the blank one. */
function lastTemplate(mine: UserTemplate[]): string {
  try {
    const stored = localStorage.getItem(templateKey);
    if (stored && presentationTemplate(stored)) return stored;
    if (stored?.startsWith("user:") && mine.some((template) => `user:${template.name}` === stored)) return stored;
  } catch {
    // Storage may be unavailable; every dialog then starts on the blank template.
  }
  return "blank";
}

function rememberTemplate(id: string): void {
  try {
    localStorage.setItem(templateKey, id);
  } catch {
    // The next dialog starts on the blank template instead.
  }
}

/** Why a name cannot be a template's, which is a file's name on every system; undefined when it can. */
export function templateNameProblem(value: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  const bad = !value || value !== value.trim() || value.endsWith(".") || value.length > 80 || /[\\/:*?"<>|\u0000-\u001f]/.test(value);
  return bad ? t.files.badTemplateName : undefined;
}

const emptyTemplates: TemplatesResponse = { folder: "", templates: [] };

/** The person's own templates and where they are kept. */
export function ownTemplates(): Promise<TemplatesResponse> {
  return call<TemplatesResponse>("GET", "templates").catch(() => emptyTemplates);
}

/**
 * The templates as a choice among their real covers, each drawn in a small frame by the runtime
 * that shows any presentation, with a line about the chosen one underneath: those FrameSeq
 * ships, then the person's own. A right click on one offers what can be done with it: a copy of
 * one FrameSeq ships to change, or one's own to edit, find, or delete.
 */
function templatePicker(
  initial: TemplatesResponse,
  actions: { edit: (template: UserTemplate) => void; folders: boolean },
): { field: HTMLFieldSetElement; value: () => string } {
  let mine = initial;
  const field = element("fieldset", "studio-field studio-templates");
  field.append(element("legend", "", t.files.template));
  const builtIn = element("div", "studio-template-grid");
  const own = element("div", "studio-template-grid is-own");
  const summary = element("p", "studio-template-summary");
  const folderLine = element("p", "studio-template-folder");
  let chosen = lastTemplate(mine.templates);
  const describe = (): void => {
    const owned = chosen.startsWith("user:");
    summary.textContent = owned ? t.files.ownSummary(mine.folder) : presentationTemplate(chosen)?.summaries[language] ?? "";
  };
  const option = (id: string, name: string, title: string, preview: string, menu: () => Array<MenuItem | "separator">): HTMLLabelElement => {
    const choice = element("label", "studio-template");
    choice.dataset.template = id;
    choice.title = title;
    const radio = element("input");
    radio.type = "radio";
    radio.name = "template";
    radio.value = id;
    radio.checked = id === chosen;
    radio.addEventListener("change", () => {
      chosen = id;
      describe();
    });
    const cover = element("span", "studio-template-cover");
    const frame = element("iframe");
    frame.src = preview;
    frame.title = name;
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    frame.addEventListener("load", () => cover.classList.add("is-ready"), { once: true });
    cover.append(frame);
    choice.append(radio, cover, element("span", "studio-template-name", name));
    choice.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showMenu(event.clientX, event.clientY, menu(), name);
    });
    return choice;
  };

  const refresh = async (): Promise<void> => {
    mine = await ownTemplates();
    if (chosen.startsWith("user:") && !mine.templates.some((template) => `user:${template.name}` === chosen)) chosen = "blank";
    showOwn();
    describe();
  };

  const copy = async (id: string, suggestion: string): Promise<void> => {
    const taken = new Set(mine.templates.map((template) => template.name.toLowerCase()));
    const name = await askText({
      title: t.files.copyTitle,
      message: t.files.copyMessage,
      value: suggestion,
      confirm: t.files.copyConfirm,
      validate: (value) => templateNameProblem(value) ?? (taken.has(value.toLowerCase()) ? t.files.exists(value) : undefined),
    });
    if (!name) return;
    try {
      await call("POST", "templates/copy", { template: id, name, language });
      chosen = `user:${name}`;
      await refresh();
      toast(t.files.copied(name), { tone: "success" });
    } catch (error) {
      toast(message(error), { tone: "error" });
    }
  };

  const remove = async (template: UserTemplate): Promise<void> => {
    const sure = await askChoice({
      title: t.files.deleteTitle(template.name),
      message: t.files.deleteMessage,
      choices: [{ label: t.files.deleteConfirm, value: "delete", primary: true }],
    });
    if (sure !== "delete") return;
    try {
      await call("POST", "templates/delete", { name: template.name, language });
      await refresh();
      toast(t.files.deleted(template.name), { tone: "info" });
    } catch (error) {
      toast(message(error), { tone: "error" });
    }
  };

  for (const template of presentationTemplates) {
    builtIn.append(option(
      template.id,
      template.names[language],
      template.summaries[language],
      `/__frameseq/studio/template-preview?template=${encodeURIComponent(template.id)}&language=${language}`,
      () => [{ label: t.files.copyToMine, run: () => void copy(template.id, template.names[language]) }],
    ));
  }

  function showOwn(): void {
    own.replaceChildren(...mine.templates.map((template) => option(
      `user:${template.name}`,
      template.name,
      template.path,
      `/__frameseq/studio/template-preview?file=${encodeURIComponent(template.path)}`,
      () => [
        { label: t.files.editTemplate, run: () => actions.edit(template) },
        { label: t.files.showTemplate, run: () => void call("POST", "templates/reveal", { name: template.name }).catch((error) => toast(message(error), { tone: "error" })) },
        "separator",
        { label: t.files.deleteTemplate, danger: true, run: () => void remove(template) },
      ],
    )));
    if (mine.templates.length === 0) own.replaceChildren(element("p", "studio-template-empty", t.files.noOwnTemplates));
    for (const radio of field.querySelectorAll<HTMLInputElement>("input[name='template']")) radio.checked = radio.value === chosen;
    showFolder();
  }

  function showFolder(): void {
    const open = element("button", "studio-link-button", t.files.openFolder);
    open.type = "button";
    open.addEventListener("click", () => void call("POST", "templates/reveal", {}).catch((error) => toast(message(error), { tone: "error" })));
    const parts: Array<Node | string> = [`${t.files.templatesFolder}: `, element("code", "", mine.folder), " ", open];
    if (actions.folders) {
      const change = element("button", "studio-link-button", t.files.changeFolder);
      change.type = "button";
      change.addEventListener("click", () => void (async () => {
        try {
          const chosenFolder = await call<ChooseResponse>("POST", "files/choose", { kind: "folder", folder: mine.folder });
          if (!chosenFolder.path) return;
          const changed = await call<{ folder: string }>("POST", "templates/folder", { path: chosenFolder.path, language });
          await refresh();
          toast(t.files.folderChanged(changed.folder), { tone: "success" });
        } catch (error) {
          toast(message(error), { tone: "error" });
        }
      })());
      parts.push(" · ", change);
    }
    folderLine.replaceChildren(...parts);
  }

  field.append(
    element("p", "studio-template-heading", t.files.builtIn),
    builtIn,
    element("p", "studio-template-heading", t.files.myTemplates),
    own,
    summary,
    folderLine,
  );
  showOwn();
  describe();
  return { field, value: () => chosen };
}

/**
 * The server restarts on the presentation just opened. Cover the page while it does, and
 * reload into the new document once the server answers for it.
 */
async function reloadInto(opened: OpenResponse): Promise<void> {
  const cover = element("div", "studio-switching");
  cover.append(element("div", "studio-splash", t.files.opening(opened.name)));
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
  toast(t.files.didNotOpen(opened.name), { tone: "error" });
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
        title: t.files.openTitle,
        message: t.files.openMessage,
        value: folderPrefix(folder),
        confirm: t.files.openConfirm,
        validate: (value) => (isPresentationFile(value) ? undefined : t.files.notPresentation),
      });
    }
    if (path) await this.openPath(path);
  }

  async openPath(path: string): Promise<void> {
    if (!await this.guard.leave()) return;
    try {
      const opened = await call<OpenResponse>("POST", "files/open", { path, language });
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
    const [{ folder }, mine] = await Promise.all([
      this.files().catch(() => ({ folder: "", recent: [] })),
      ownTemplates(),
    ]);
    const dialog = element("dialog", "studio-dialog studio-new-dialog");
    const form = element("form");
    form.method = "dialog";
    const title = element("input");
    title.type = "text";
    title.name = "title";
    title.placeholder = t.files.titlePlaceholder;
    title.spellcheck = false;
    const place = element("input");
    place.type = "text";
    place.name = "folder";
    place.value = folder;
    place.spellcheck = false;
    const titleField = element("label", "studio-field");
    titleField.append(element("span", "", t.files.title), title);
    const row = element("span", "studio-field-row");
    row.append(place);
    if (this.session.dialogs) {
      const browse = element("button", "studio-button", t.files.browse);
      browse.type = "button";
      browse.dataset.action = "browse-folder";
      browse.addEventListener("click", () => void (async () => {
        browse.disabled = true;
        try {
          const chosen = await call<ChooseResponse>("POST", "files/choose", { kind: "folder", folder: place.value.trim() });
          if (chosen.path) place.value = chosen.path;
          else if (chosen.unavailable) toast(t.files.noFolderDialog, { tone: "warning" });
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
    placeField.append(element("span", "", t.files.folder), row);
    // A template of one's own is a presentation, and it is edited by opening it.
    const templates = templatePicker(mine, {
      edit: (template) => {
        dialog.close();
        void this.openPath(template.path);
      },
      folders: this.session.dialogs,
    });
    const file = element("p", "studio-new-file");
    const problem = element("p", "studio-dialog-problem");
    const actions = element("div", "studio-dialog-actions");
    const cancel = element("button", "studio-button", t.ui.cancel);
    cancel.type = "button";
    cancel.addEventListener("click", () => dialog.close());
    const accept = element("button", "studio-button is-primary", t.files.create);
    accept.type = "submit";
    actions.append(cancel, accept);
    form.append(element("h2", "", t.files.newTitle), titleField, templates.field, placeField, file, problem, actions);
    dialog.append(form);
    document.body.append(dialog);
    // A double click on a template takes it, as in other programs' template galleries.
    templates.field.addEventListener("dblclick", (event) => {
      if (event.target instanceof Element && event.target.closest(".studio-template")) form.requestSubmit();
    });

    const describe = (): void => {
      const name = presentationFileName(title.value);
      file.replaceChildren(t.files.savedAs, element("code", "", name));
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
            template: templates.value(),
            language,
          });
          rememberTemplate(templates.value());
          dialog.close();
          await reloadInto(opened);
        } catch (error) {
          this.guard.stay();
          accept.disabled = false;
          problem.replaceChildren(message(error));
          const existing = error instanceof StudioRequestError ? error.data.path : undefined;
          if (typeof existing === "string") {
            const open = element("button", "studio-link-button", t.files.openIt);
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
      { label: t.files.newMenu, run: () => void this.create() },
      { label: t.files.openMenu, shortcut: /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘O" : "Ctrl+O", run: () => void this.open() },
    ];
    if (others.length > 0) {
      items.push("separator", { heading: "Recent" }, ...others.map((item) => ({
        label: item.name,
        shortcut: shortFolder(item.folder),
        run: () => void this.openPath(item.path),
      })));
    }
    items.push("separator", {
      label: t.files.showInFolder,
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
  document.title = t.appName;
  root.innerHTML = `
    <div class="studio-start">
      <header class="studio-start-header">${logo}<h1>FrameSeq <b>Studio</b></h1>
        <span class="studio-start-language" role="group" aria-label="${t.menu.language}">
          <button type="button" data-language="en" aria-pressed="${language === "en"}">${t.languages.en}</button>
          <button type="button" data-language="zh" aria-pressed="${language === "zh"}">${t.languages.zh}</button>
        </span>
      </header>
      <div class="studio-start-actions">
        <button type="button" class="studio-start-action is-primary" data-start="new">
          <span class="studio-start-glyph" aria-hidden="true">+</span>
          <span><b>${t.start.newTitle}</b><small>${t.start.newHint}</small></span>
        </button>
        <button type="button" class="studio-start-action" data-start="open">
          <span class="studio-start-glyph" aria-hidden="true">↗</span>
          <span><b>${t.start.openTitle}</b><small>${t.start.openHint}</small></span>
        </button>
      </div>
      <section class="studio-start-recent" aria-label="${t.start.recentLabel}">
        <h2>${t.start.recent}</h2>
        <ul data-slot="recent"></ul>
      </section>
      <p class="studio-start-note"></p>
    </div>
  `;
  required<HTMLElement>(root, ".studio-start-note").textContent = session.quitOnClose
    ? t.start.quitsOnClose
    : t.start.runsInTerminal;
  const list = required<HTMLUListElement>(root, "[data-slot='recent']");

  const showRecent = (recent: RecentPresentation[]): void => {
    if (recent.length === 0) {
      list.replaceChildren(element("li", "studio-start-empty", t.start.noRecent));
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
      forget.title = t.start.forget;
      forget.setAttribute("aria-label", t.start.forgetNamed(item.name));
      forget.addEventListener("click", () => void call<{ recent: RecentPresentation[] }>("POST", "files/forget", { path: item.path })
        .then((result) => showRecent(result.recent))
        .catch((error) => toast(message(error), { tone: "error" })));
      row.append(open, forget);
      return row;
    }));
  };
  showRecent((await presentations.files().catch(() => ({ recent: [] as RecentPresentation[] }))).recent);

  root.addEventListener("click", (event) => {
    const chosen = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-language]")?.dataset.language : undefined;
    if ((chosen === "en" || chosen === "zh") && chosen !== language) switchLanguage(chosen);
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
