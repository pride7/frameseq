import "./studio.css";
import { redo, selectAll, toggleComment, undo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { ChangeSet, EditorSelection, Text, type ChangeSpec, type TransactionSpec } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { collectLayoutIssues } from "../../scripts/layout-rules.mjs";
import {
  call,
  downloadUrl,
  openSession,
  StudioRequestError,
  type ChooseResponse,
  type ExportFormat,
  type ExportResult,
  type InspectObject,
  type InspectReport,
  type InspectSlide,
  type LanguageDiagnostic,
  type SaveResponse,
  type SourceResponse,
  type StudioSession,
} from "./api";
import {
  detectFormat,
  fromFileOffset,
  minimalChange,
  toEditorText,
  toFileText,
  type FileFormat,
} from "./document";
import type { Diagnostic } from "@codemirror/lint";
import {
  createEditor,
  refreshDocumentDiagnostics,
  setEditorDarkness,
  setEditorLocked,
  startReview,
  endReview,
  reviewChanges,
  goToChange,
  showPreviewSlide,
  showSlideMarks,
  type SlideMark,
} from "./editor";
import { ownTemplates, Presentations, showStartPage, templateNameProblem } from "./files";
import { language, switchLanguage, t, type Language } from "./i18n";
import { goToNameDefinition, renameNameAtCursor } from "./language";
import { MenuBar, showContextMenu, type MenuCommand, type MenuEntry } from "./menubar";
import type { MenuIcon } from "./menu-icons";
import { notesText, readNotes, SpeakerNotes } from "./notes";
import { blockStart, buildSlideMap, slideAt, type RenderedSlide, type SlideGroup, type SlideMap } from "./outline";
import {
  StudioFrames,
  type BlockedDrag,
  type ObjectCommand,
  type PreviewFailure,
  type PreviewSelection,
  type SelectionAction,
  type SourceTarget,
} from "./frames";
import { formulaEscapes, nameDefinition, nameDiagnostics, prepareNameRename, type FormulaEscape } from "../source-names";
import { copiedCode, namesAt, pastedLines } from "./clipboard";
import { guardWindowClose, installWindowFrame, openOutside } from "./desktop";
import { AssistantPanel, type AssistantContext } from "./assistant";
import { askExportSlides } from "./export-slides";
import { chooseIcon } from "./icons";
import { SlideInspector } from "./inspector";
import { SlideShow } from "./show";
import {
  allowScreens,
  chooseScreen,
  chosenScreen,
  direction,
  hasScreens,
  knownScreens,
  refreshScreens,
  screenName,
} from "./screens";
import { pairPhone, remoteSession, resumePairing } from "./remote";
import { updateMenu, watchForUpdates } from "./updates";
import { ProblemsPanel, type Problem } from "./problems";
import { layoutSketch, showLayoutPicker, slideLayouts, type SlideLayout } from "./layouts";
import { bindRegion, deleteSlide, duplicateSlide, insertSlide, moveSlide, planBinding } from "./slides";
import { StudioTerminal } from "./terminal";
import { insertMaster, masterInsertion, masterName, masterNames, starterMaster, type PageGeometry } from "./masters";
import {
  appendToSlide,
  connectorChanges,
  contentCode,
  contentGroups,
  insertAfter,
  insertGroups,
  insertName,
  insertPicture,
  isContentKind,
  isPlaceholderKind,
  placeholderGroup,
  placedContent,
  placementCode,
  showInsertGallery,
  slideEnd,
  type ConnectorEnd,
  type ContentCode,
  type ContentKind,
  type InsertKind,
  type Placement,
} from "./insert";
import {
  askChoice,
  askText,
  element,
  formatDuration,
  readPreference,
  required,
  showInfo,
  showMenu,
  splitter,
  storePreference,
  toast,
  type MenuItem,
} from "./ui";

type SaveState = "saved" | "dirty" | "saving" | "blocked" | "conflict" | "error" | "offline";
type ThemeChoice = "system" | "light" | "dark";
type PanelTab = "problems" | "output" | "terminal";

const themeKey = "frameseq-studio-theme";

/** The palette chosen in this browser; the page applies it before anything is drawn. */
function readThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(themeKey);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/** Whether keys pressed in an element type into it, so that its own undo takes them. */
function typesText(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
}

const stashKey = "frameseq-studio-stash";
const autosaveDelay = 450;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";

const trash = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
/** Ctrl+` on every system: ⌘` switches windows on macOS. */
const terminalKey = isMac ? "⌃`" : "Ctrl+`";

const logo = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="frameseq-mark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#frameseq-mark)"/><g fill="#fff"><rect x="13" y="13" width="9" height="30" rx="2.5"/><rect x="13" y="13" width="30" height="9" rx="2.5"/><rect x="13" y="28" width="22" height="8" rx="2.5"/></g><g fill="#ffe27a"><rect x="42" y="30" width="9" height="21" rx="2.5"/><rect x="30" y="42" width="21" height="9" rx="2.5"/></g></svg>`;

const shell = `
  <header class="studio-topbar" data-window-drag>
    <div class="studio-brand" title="${t.appName}">${logo}</div>
    <nav class="studio-menubar" data-slot="menubar" aria-label="${t.shell.menuBar}"></nav>
    <div class="studio-file">
      <button type="button" class="studio-file-button" data-action="file-menu" aria-haspopup="menu" title="${t.shell.fileButton(mod)}"><span class="studio-file-name" data-slot="file"></span><span class="studio-caret" aria-hidden="true"></span></button>
      <span class="studio-save-state" data-slot="save-state" data-state="saved"><i></i><span>${t.save.saved}</span></span>
    </div>
    <div class="studio-actions">
      <button type="button" class="studio-button" data-action="toggle-editor" aria-pressed="true" title="${t.shell.toggleEditor(mod)}"><span aria-hidden="true">&lt;/&gt;</span> ${t.shell.code}</button>
      <button type="button" class="studio-button" data-action="toggle-assistant" title="${t.assistant.buttonTitle(mod)}"><span aria-hidden="true">✦</span> ${t.assistant.button}</button>
      <button type="button" class="studio-button is-primary" data-action="present" title="${t.shell.presentTitle}"><span aria-hidden="true">▶</span> ${t.shell.present}</button>
    </div>
  </header>
  <div class="studio-banner" data-slot="banner" hidden>
    <span data-slot="banner-text"></span>
    <span class="studio-banner-actions" data-slot="banner-actions"></span>
  </div>
  <div class="studio-banner studio-master-bar" data-slot="master-bar" hidden>
    <span>${t.masters.banner}</span>
    <span class="studio-banner-actions"><button type="button" class="studio-button is-primary" data-action="close-masters">${t.masters.close}</button></span>
  </div>
  <main class="studio-workspace">
    <section class="studio-rail" aria-label="${t.shell.slides}">
      <header class="studio-pane-header">
        <span class="studio-pane-title" data-slot="rail-title">${t.shell.slides}</span>
        <span class="studio-pane-meta" data-slot="slide-count"></span>
        <span class="studio-pane-spacer"></span>
        <button type="button" class="studio-icon-button" data-action="new-slide" title="${t.shell.newSlideTitle}">+</button>
      </header>
      <div class="studio-rail-body" data-slot="rail"></div>
      <div class="studio-splitter is-horizontal" data-splitter="inspector"></div>
      <section class="studio-inspector" aria-label="${t.shell.currentSlide}">
        <header class="studio-pane-header">
          <button type="button" class="studio-icon-button studio-inspector-toggle" data-action="toggle-inspector" aria-expanded="true" title="${t.shell.toggleInspector}"></button>
          <span class="studio-pane-title" data-slot="inspector-title">${t.shell.currentSlide}</span>
          <span class="studio-pane-meta" data-slot="inspector-meta"></span>
        </header>
        <div class="studio-inspector-body" data-slot="inspector" role="tree" aria-label="${t.shell.inspectorLabel}"></div>
      </section>
    </section>
    <div class="studio-splitter" data-splitter="rail"></div>
    <section class="studio-editor-pane" aria-label="${t.shell.editor}">
      <header class="studio-pane-header">
        <span class="studio-pane-title" data-slot="editor-title"></span>
        <span class="studio-breadcrumb" data-slot="breadcrumb"></span>
        <span class="studio-assistant-working" data-slot="assistant-working" hidden>${t.assistant.working}</span>
        <span class="studio-review" data-slot="review" hidden>
          <span class="studio-review-count" data-slot="review-count"></span>
          <button type="button" class="studio-icon-button" data-action="review-previous" title="${t.review.previous}">↑</button>
          <button type="button" class="studio-icon-button" data-action="review-next" title="${t.review.next}">↓</button>
          <button type="button" class="studio-button" data-action="review-reject">${t.review.rejectAll}</button>
          <button type="button" class="studio-button is-primary" data-action="review-accept">${t.review.acceptAll}</button>
        </span>
      </header>
      <div class="studio-editor" data-slot="editor"></div>
    </section>
    <div class="studio-splitter" data-splitter="preview"></div>
    <section class="studio-preview-pane" aria-label="${t.shell.preview}">
      <header class="studio-pane-header">
        <span class="studio-pane-title">${t.shell.preview}</span>
        <span class="studio-pane-meta" data-slot="preview-slide"></span>
        <span class="studio-pane-spacer"></span>
        <button type="button" class="studio-button studio-insert-button" data-action="insert" title="${t.insert.buttonTitle}" aria-haspopup="menu"><span aria-hidden="true">◇</span> ${t.insert.button}</button>
        <label class="studio-toggle" title="${t.shell.followTitle}"><input type="checkbox" data-control="follow"><span>${t.shell.followCursor}</span></label>
        <button type="button" class="studio-icon-button" data-action="open-browser" title="${t.shell.openBrowserTitle}">↗</button>
      </header>
      <div class="studio-preview-body" data-slot="preview"></div>
      <div class="studio-splitter is-horizontal" data-splitter="notes"></div>
      <section class="studio-notes" aria-label="${t.notes.title}">
        <header class="studio-pane-header">
          <button type="button" class="studio-icon-button studio-notes-toggle" data-action="toggle-notes" aria-expanded="true" title="${t.notes.toggle}"></button>
          <span class="studio-pane-title">${t.notes.title}</span>
          <span class="studio-pane-meta" data-slot="notes-meta"></span>
          <button type="button" class="studio-icon-button studio-notes-source" data-action="notes-source" title="${t.notes.showSource}" hidden>&lt;/&gt;</button>
        </header>
        <div class="studio-notes-body" data-slot="notes"></div>
      </section>
    </section>
    <div class="studio-splitter" data-splitter="assistant"></div>
    <section class="studio-assistant" data-slot="assistant" aria-label="${t.assistant.title}"></section>
  </main>
  <div class="studio-splitter is-horizontal" data-splitter="panel"></div>
  <section class="studio-panel" aria-label="${t.shell.panel}">
    <header class="studio-panel-tabs" role="tablist">
      <button type="button" role="tab" data-tab="problems" aria-selected="true">${t.shell.problems}<span class="studio-badge" data-slot="problem-badge">0</span></button>
      <button type="button" role="tab" data-tab="output" aria-selected="false">${t.shell.output}</button>
      <button type="button" role="tab" data-tab="terminal" aria-selected="false">${t.shell.terminal}</button>
      <span class="studio-pane-spacer"></span>
      <span class="studio-check-state" data-slot="check-state"></span>
      <button type="button" class="studio-icon-button studio-terminal-kill" data-action="kill-terminal" title="${t.shell.killTerminal}" hidden>${trash}</button>
      <button type="button" class="studio-icon-button" data-action="toggle-panel" title="${t.shell.togglePanel(mod)}"></button>
    </header>
    <div class="studio-panel-body">
      <div class="studio-problems" data-panel="problems"></div>
      <pre class="studio-output" data-panel="output" hidden></pre>
      <div class="studio-terminal" data-panel="terminal" hidden></div>
    </div>
  </section>
  <footer class="studio-statusbar">
    <span data-slot="status-connection"></span>
    <button type="button" class="studio-status-button" data-slot="status-problems" data-action="show-problems"></button>
    <span class="studio-pane-spacer"></span>
    <span data-slot="status-slide"></span>
    <span data-slot="status-cursor"></span>
    <span data-slot="status-format"></span>
    <span>TypeScript</span>
  </footer>
  <div class="studio-check-host" data-slot="check"></div>
`;

const root = required<HTMLElement>(document, "#studio");

function slot<T extends HTMLElement = HTMLElement>(name: string): T {
  return required<T>(root, `[data-slot="${name}"]`);
}

function showFatal(title: string, detail: string): void {
  root.className = "studio is-fatal";
  const box = element("div", "studio-fatal");
  box.innerHTML = logo;
  box.append(element("h1", "", title), element("p", "", detail));
  const command = element("code", "", "frameseq studio talk.slides.ts");
  box.append(command);
  root.replaceChildren(box);
}

async function start(): Promise<void> {
  installWindowFrame();
  let session: StudioSession;
  let source: SourceResponse;
  try {
    session = await openSession();
    void watchForUpdates();
    if (session.start) {
      await showStartPage(root, session, logo);
      return;
    }
    source = await call<SourceResponse>("GET", "source");
  } catch (error) {
    // A plain `frameseq dev` server serves this page but not the Studio behind it.
    const notStudio = error instanceof StudioRequestError && error.status === 404;
    showFatal(
      notStudio ? t.fatal.notStudio : t.fatal.failed,
      notStudio ? t.fatal.notStudioDetail : t.fatal.failedDetail(error instanceof Error ? error.message : String(error)),
    );
    return;
  }
  root.className = "studio";
  root.innerHTML = shell;
  document.title = `${session.name} · FrameSeq Studio`;
  slot("file").textContent = session.file;
  required<HTMLElement>(root, "[data-action='file-menu']").title = `${session.entry}\n${t.shell.fileButton(mod)}`;
  slot("editor-title").textContent = session.name;

  // ── Document state ──────────────────────────────────────────────────────────────────────
  let format: FileFormat = detectFormat(source.text);
  let baseVersion = source.version;
  /** The editor's text as it was when it last matched the file on disk. */
  let syncedText = toEditorText(source.text);
  let syncedDoc = Text.of(syncedText.split("\n"));
  /** Every change made since then, to carry the preview's file offsets into the editor. */
  let sinceSync = ChangeSet.empty(syncedText.length);
  let sinceSaveStart: ChangeSet | undefined;
  let saveState: SaveState = "saved";
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<boolean> | undefined;
  let saveAgain = false;
  let autosave = readPreference("autosave", true);
  let follow = readPreference("follow", true);
  let report: InspectReport | undefined;
  let reportText = "";
  let inspectTimer: ReturnType<typeof setTimeout> | undefined;
  let followTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressFollow = false;
  let renderedCount = 0;
  /** The slides as the rail last rendered them, with where each one came from. */
  let outline: RenderedSlide[] | undefined;
  /** Whether the preview and the rail show the master pages, to be edited, instead of the slides. */
  let masterView = false;
  let previewSlide = 0;
  let previewLabel = "";
  /** The notes of the slide in the preview as they rendered; unknown again once the text changes. */
  let previewNotes: string | undefined;
  /** Why the last run of the document failed, until a run succeeds again. */
  let runtimeFailures: PreviewFailure[] = [];
  let exporting = false;
  /** The assistant's panel, made the first time it is opened. */
  let assistant: AssistantPanel | undefined;
  /** The text before the assistant's first change not yet reviewed, and whether the review shows. */
  let reviewBase: string | undefined;
  let reviewing = false;
  let assistantBusy = false;

  // ── Theme ───────────────────────────────────────────────────────────────────────────────
  let themeChoice = readThemeChoice();
  const systemLight = matchMedia("(prefers-color-scheme: light)");
  const resolvedTheme = (): "light" | "dark" => (
    themeChoice === "system" ? (systemLight.matches ? "light" : "dark") : themeChoice
  );

  const stash = readStash(session.entry, session.version);
  const initialText = stash?.text ?? syncedText;

  // ── Editor ──────────────────────────────────────────────────────────────────────────────
  const view: EditorView = createEditor(slot("editor"), {
    doc: initialText,
    onUpdate: handleUpdate,
    onSave: () => void save({ auto: false }),
    onDiagnostics: handleDiagnostics,
    onSlideMarker: (index) => goToSlide(index, { focusEditor: false }),
    documentDiagnostics: () => documentDiagnostics(),
    dark: resolvedTheme() === "dark",
  });
  const notes = new SpeakerNotes(
    slot("notes"),
    slot("notes-meta"),
    required<HTMLButtonElement>(root, "[data-action='notes-source']"),
    view,
    (range) => {
      showEditor(true);
      suppressFollow = true;
      view.dispatch({
        selection: EditorSelection.range(range.from, range.to),
        effects: EditorView.scrollIntoView(range.from, { y: "center" }),
      });
      view.focus();
    },
  );
  if (stash) {
    const anchor = Math.min(stash.anchor, view.state.doc.length);
    const head = Math.min(stash.head, view.state.doc.length);
    view.dispatch({ selection: EditorSelection.single(anchor, head), scrollIntoView: true });
    if (stash.text !== syncedText) {
      // Text the editor held when the page was reloaded, recorded against this same file.
      sinceSync = ChangeSet.of([minimalChange(syncedText, stash.text)], syncedText.length);
    }
    previewSlide = stash.slide;
  }

  // ── Panels and frames ───────────────────────────────────────────────────────────────────
  const problems = new ProblemsPanel(
    required(root, "[data-panel='problems']"),
    selectProblem,
    showCounts,
  );
  const terminal = new StudioTerminal(required(root, "[data-panel='terminal']"), {
    token: session.token,
    entry: session.entry,
    available: session.terminal === true,
    dark: resolvedTheme() === "dark",
    openLink: openOutside,
  });
  const frames = new StudioFrames(
    { preview: slot("preview"), rail: slot("rail"), check: slot("check") },
    {
      previewRendered: () => {
        problems.set("build", []);
        problems.set("runtime", []);
        if (runtimeFailures.length > 0) {
          runtimeFailures = [];
          refreshDocumentDiagnostics(view);
        }
      },
      previewFailed: (failures) => {
        runtimeFailures = failures;
        problems.set("runtime", failures.map((failure): Problem => {
          const location = failure.start === undefined ? undefined : savedLineOf(failure.start);
          return {
            source: "runtime",
            severity: "error",
            message: failure.message,
            detail: t.check.runtimeDetail,
            ...(location ?? {}),
          };
        }));
        refreshDocumentDiagnostics(view);
      },
      slide: (index, count, label, slideNotes) => {
        previewSlide = index;
        previewLabel = label;
        previewNotes = slideNotes;
        assistant?.refreshContext();
        renderedCount = count;
        showPreviewPosition();
        frames.markThumbnail(index);
        showPreviewSlide(view, index);
        refreshInspector();
      },
      reveal: (target) => revealTarget(target),
      select: (targets) => {
        const ranges = targets.map(editorRange).filter((range): range is { from: number; to: number } => Boolean(range));
        if (ranges.length === 0) return;
        suppressFollow = true;
        view.dispatch({
          selection: EditorSelection.create(
            ranges.map((range) => EditorSelection.range(range.from, range.to)),
            ranges.length - 1,
          ),
          scrollIntoView: true,
        });
      },
      edit: applyPreviewEdit,
      bind: (targets) => void bindSelection(targets),
      placed: (placement) => void insertPlaced(placement),
      placeCancelled: () => placingHint?.close(),
      command: (command) => {
        if (command === "save") void save({ auto: false });
        if (command === "undo") undo(view);
        if (command === "redo") redo(view);
        if (command === "present" || command === "present-beginning") present(command === "present" ? previewSlide : 0);
      },
      railRendered: () => frames.markThumbnail(previewSlide),
      outline: (slides) => {
        outline = slides;
        renderedCount = slides.length;
        showMarks();
        showCursor();
        showPreviewPosition();
        refreshInspector();
      },
      thumbnail: (index) => goToSlide(index, { focusEditor: false }),
      thumbnailMove: (from, to) => void rearrange("move", from, to),
      thumbnailMenu: (index, x, y) => showSlideMenu(index, x, y),
      thumbnailDelete: (index) => void rearrange("delete", index),
      checkRendered: (frame) => scheduleLayoutCheck(frame),
      contextMenu: (x, y, selection, keyboard) => showPreviewMenu(x, y, selection, keyboard),
      objectCommand: (command, selection) => runObjectCommand(command, selection),
      dragBlocked: (target, reason, code) => void explainBlockedDrag(target, reason, code),
    },
    previewSlide,
    resolvedTheme(),
  );

  /** Show the chosen palette everywhere: the page, the editor, and the slide rail. */
  function applyTheme(): void {
    const theme = resolvedTheme();
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f6f8fb" : "#0a0e17");
    setEditorDarkness(view, theme === "dark");
    frames.setTheme(theme);
    terminal.setDark(theme === "dark");
  }

  function chooseTheme(choice: ThemeChoice): void {
    themeChoice = choice;
    try {
      localStorage.setItem(themeKey, themeChoice);
    } catch {
      // The choice simply lasts until the page closes.
    }
    applyTheme();
  }
  applyTheme();
  systemLight.addEventListener("change", () => {
    if (themeChoice === "system") applyTheme();
  });

  // ── Current slide ───────────────────────────────────────────────────────────────────────
  const inspector = new SlideInspector(slot("inspector"), {
    selectObject: (object) => {
      const position = object.source.start ?? view.state.doc.line(Math.min(object.source.line, view.state.doc.lines)).from;
      suppressFollow = true;
      view.dispatch({
        selection: EditorSelection.cursor(position),
        effects: EditorView.scrollIntoView(position, { y: "center" }),
      });
      frames.focus({ slideIndex: previewSlide, ...savedLocation(position) });
      inspector.highlight(object);
    },
    selectRegion: (region) => {
      const position = region.source.start ?? view.state.doc.line(Math.min(region.source.line, view.state.doc.lines)).from;
      suppressFollow = true;
      view.dispatch({
        selection: EditorSelection.cursor(position),
        effects: EditorView.scrollIntoView(position, { y: "center" }),
      });
      frames.focus({ slideIndex: previewSlide, name: region.path });
    },
    edit: ({ edits, checks }) => {
      const doc = view.state.doc;
      // Only text that still reads as the panel saw it may change; anything else has moved on.
      const current = checks.every((check) => check.to <= doc.length && doc.sliceString(check.from, check.to) === check.text)
        && edits.every((edit) => edit.from >= 0 && edit.to <= doc.length && edit.from <= edit.to);
      if (!current) {
        toast(t.inspector.catchingUp, { tone: "warning", key: "inspector-stale" });
        return false;
      }
      suppressFollow = true;
      view.dispatch({
        changes: [...edits].sort((a, b) => a.from - b.from).map(({ from, to, insert }) => ({ from, to, insert })),
        userEvent: "input.inspector",
      });
      return true;
    },
    reveal: (position) => revealPosition(position),
    choosePicture: () => choosePicture(),
    duplicateObject: (object) => duplicateInspected(object),
    objectMenu: (object, x, y, keyboard) => showContextMenu(x, y, inspectedObjectEntries(object), {
      label: t.objects.menuLabel(1),
      keyboard,
    }),
    deleteObjects: (objects) => {
      const doc = view.state.doc;
      const ranges: Array<{ from: number; to: number }> = [];
      for (const object of objects) {
        const statement = object.statement;
        const start = object.source.start;
        if (!statement || start === undefined) {
          toast(t.inspector.cannotDelete, { tone: "warning" });
          return;
        }
        if (statement.end > doc.length || doc.sliceString(start, start + object.type.length) !== object.type) {
          toast(t.inspector.catchingUp, { tone: "warning", key: "inspector-stale" });
          return;
        }
        // A statement on lines of its own takes its lines with it, and the comments above it,
        // as a deletion in the preview does.
        const first = doc.lineAt(statement.start);
        const last = doc.lineAt(statement.end);
        const alone = !doc.sliceString(first.from, statement.start).trim() && !doc.sliceString(statement.end, last.to).trim();
        ranges.push(alone
          ? { from: blockStart(doc, statement.start), to: Math.min(last.to + 1, doc.length) }
          : { from: statement.start, to: statement.end });
      }
      const ordered = ranges.sort((a, b) => a.from - b.from)
        .reduce<Array<{ from: number; to: number }>>((merged, range) => {
          const previous = merged[merged.length - 1];
          if (previous && range.from <= previous.to) previous.to = Math.max(previous.to, range.to);
          else merged.push({ ...range });
          return merged;
        }, []);
      suppressFollow = true;
      view.dispatch({
        changes: ordered.map((range) => ({ ...range, insert: "" })),
        selection: EditorSelection.cursor(ordered[0].from),
        userEvent: "delete.inspector",
      });
      const name = t.inspector.kinds[objects[0].type] ?? objects[0].type;
      toast(objects.length > 1 ? t.inspector.deletedWith(name, objects.length - 1) : t.inspector.deleted(name), {
        tone: "info",
        actions: [{ label: t.inspector.undo, run: () => { undo(view); } }],
      });
    },
  });

  /** The slides, or the master pages while the master view shows them, as the outline reads them. */
  function pages(source: InspectReport | undefined = report): InspectSlide[] {
    return (masterView ? source?.masters : source?.slides) ?? [];
  }

  /**
   * The outline of the slide the preview shows: the statement whose lines hold the slide's own
   * slide() call, which for a loop is the loop and for a helper the helper's body.
   */
  function inspectedSlide(): { slide?: InspectSlide; note: string } | undefined {
    if (!report || reportText !== editorText()) return undefined;
    const doc = view.state.doc;
    const map = slideMap();
    if (!map) {
      if (outline) return undefined;
      const index = slideIndexAt(view.state.selection.main.head);
      return { slide: index === undefined ? undefined : pages()[index], note: "" };
    }
    const groupIndex = map.groupOf[previewSlide];
    const group = groupIndex === undefined ? undefined : map.groups[groupIndex];
    if (!group) return { note: t.inspector.madeOutside(previewSlide + 1, session.name) };
    const call = map.calls[previewSlide];
    const callLine = call === undefined ? undefined : doc.lineAt(call).number;
    const slide = (callLine === undefined ? undefined : pages().find((candidate) => (
      callLine >= candidate.source.line && callLine <= candidate.source.endLine
    ))) ?? pages().find((candidate) => {
      const line = doc.line(Math.min(candidate.source.line, doc.lines));
      return line.from >= group.from && line.from < group.to;
    });
    const anchorLine = doc.lineAt(group.anchor).number;
    const inGroup = call !== undefined && call >= group.from && call < group.to;
    const note = !inGroup && slide
      ? t.inspector.madeByHelper(anchorLine)
      : (group.slides.length > 1 ? t.inspector.madeWithOthers(anchorLine, group.slides.length - 1) : "");
    return slide ? { slide, note } : { note: t.inspector.madeByStatement(previewSlide + 1, anchorLine) };
  }

  /**
   * Show the notes of the slide in the preview. They can be typed when one plain string in the
   * slide's own statement holds them, or when it has none yet; otherwise they show as rendered.
   */
  function refreshNotes(): void {
    const map = slideMap();
    const current = map ? inspectedSlide() : undefined;
    const shown = notes.slide === previewSlide ? notes.text : "";
    const rendered = previewNotes === undefined ? shown : notesText(previewNotes);
    if (!map || !current) {
      // The outline is catching up with the editor; a slide already showing keeps its notes.
      if (notes.slide !== previewSlide) notes.show({ slide: previewSlide, text: rendered, reason: t.notes.reading });
      return;
    }
    const doc = view.state.doc;
    const slide = current.slide;
    const sources = slide?.noteSources ?? [];
    const first = sources[0];
    const slideLine = slide ? doc.line(Math.min(slide.source.line, doc.lines)).from : undefined;
    const source = first
      ? { from: first.start, to: first.end }
      : (slideLine === undefined ? undefined : { from: slideLine, to: slideLine });
    const readOnly = (reason: string): void => notes.show({ slide: previewSlide, text: rendered, reason, source });
    const group = map.groups[map.groupOf[previewSlide] ?? -1];
    const call = map.calls[previewSlide];
    const alone = group !== undefined && group.slides.length === 1 && call !== undefined && call >= group.from && call < group.to;
    if (!slide) return readOnly(group ? t.notes.madeByCode : t.notes.outside(session.name));
    if (!alone) return readOnly(t.notes.madeByCode);
    if (sources.length > 1) return readOnly(t.notes.several(sources.length));
    if (first?.value === undefined && first) return readOnly(t.notes.computed);
    // Notes the slide's own statement does not write come from code elsewhere, such as a helper.
    if (!first && previewNotes?.trim()) return readOnly(t.notes.elsewhere);
    if (!first && slide.notesAt === undefined) return readOnly(t.notes.computed);
    const code = first ? doc.sliceString(first.start, first.end) : "";
    const written = first?.value === undefined ? undefined : readNotes(code, first.value);
    notes.show({
      slide: previewSlide,
      text: written?.text ?? "",
      source,
      literal: first && written ? { from: first.start, to: first.end, code, form: written.form } : undefined,
      insertAt: slide.notesAt,
    });
  }

  function refreshInspector(): void {
    refreshNotes();
    const current = inspectedSlide();
    if (!current) return;
    inspector.show(current.slide, current.note);
    const label = outline?.[previewSlide]?.label
      ?? (masterView ? t.masters.label(current.slide?.master ?? "") : current.slide?.label) ?? "";
    slot("inspector-meta").textContent = renderedCount > 0
      ? `${previewSlide + 1} / ${renderedCount}${label ? ` · ${label}` : ""}`
      : (label ? label : "");
    inspector.highlight(objectAt(view.state.selection.main.head) as InspectObject | undefined);
  }

  // ── Saving ──────────────────────────────────────────────────────────────────────────────
  function editorText(): string {
    return view.state.doc.toString();
  }

  function isDirty(): boolean {
    return editorText() !== syncedText;
  }

  function setSaveState(state: SaveState, detail?: string): void {
    saveState = state;
    const labels: Record<SaveState, string> = {
      saved: t.save.saved,
      dirty: autosave ? t.save.editing : t.save.unsaved,
      saving: t.save.saving,
      blocked: t.save.blocked,
      conflict: t.save.conflict,
      error: t.save.error,
      offline: t.save.offline,
    };
    const pill = slot("save-state");
    pill.dataset.state = state;
    required<HTMLElement>(pill, "span").textContent = labels[state];
    pill.title = detail ?? (state === "blocked" ? t.save.blockedDetail : labels[state]);
    const unsaved = state !== "saved" && state !== "saving";
    document.title = `${unsaved ? "● " : ""}${session.name} · FrameSeq Studio`;
  }

  function markSynced(text: string, version: string): void {
    syncedText = text;
    syncedDoc = Text.of(text.split("\n"));
    baseVersion = version;
    // Give the server a moment to see the new file, then restart any frame that never ran.
    const changedAt = Date.now();
    setTimeout(() => frames.restartStalled(changedAt), 400);
  }

  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer);
    if (!autosave) return;
    saveTimer = setTimeout(() => void save({ auto: true }), autosaveDelay);
  }

  /**
   * Write the editor's text to the slide document. An automatic save only writes text that
   * parses; an explicit one always writes. Either is refused if the file changed on disk since
   * the editor last read it, and then the Studio asks which version to keep.
   */
  async function save({ auto, force = false }: { auto: boolean; force?: boolean }): Promise<boolean> {
    if (saveTimer) clearTimeout(saveTimer);
    if (saving) {
      saveAgain = true;
      return saving;
    }
    const text = editorText();
    if (text === syncedText && !force) {
      setSaveState("saved");
      return true;
    }
    if (saveState === "conflict" && !force) return false;
    setSaveState("saving");
    sinceSaveStart = ChangeSet.empty(text.length);
    saving = (async () => {
      try {
        const result = await call<SaveResponse>("PUT", "source", {
          text: toFileText(text, format),
          analysisText: text,
          base: baseVersion,
          checkSyntax: auto,
          force,
        });
        if (result.ok && result.version) {
          markSynced(text, result.version);
          sinceSync = sinceSaveStart ?? ChangeSet.empty(view.state.doc.length);
          hideBanner();
          setSaveState(isDirty() ? "dirty" : "saved");
          return true;
        }
        if (result.conflict) {
          setSaveState("conflict");
          showConflict();
          return false;
        }
        setSaveState("blocked");
        return false;
      } catch (error) {
        setSaveState("error", error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        sinceSaveStart = undefined;
      }
    })();
    const saved = await saving;
    saving = undefined;
    if (saveAgain) {
      saveAgain = false;
      if (isDirty()) scheduleSave();
    }
    return saved;
  }

  /** Make the file on disk match the editor before something reads the file. */
  async function flushSave(): Promise<boolean> {
    if (saving) await saving;
    return isDirty() ? save({ auto: false }) : true;
  }

  // ── The file changing underneath the editor ─────────────────────────────────────────────
  async function onDiskChange(payload: { version?: string; missing?: boolean }): Promise<void> {
    if (payload.missing) {
      showBanner(t.save.removed(session.name), []);
      return;
    }
    if (!payload.version || payload.version === baseVersion) return;
    if (saving) await saving;
    if (payload.version === baseVersion) return;
    let latest: SourceResponse;
    try {
      latest = await call<SourceResponse>("GET", "source");
    } catch {
      return;
    }
    const text = toEditorText(latest.text);
    if (text === editorText()) {
      format = detectFormat(latest.text);
      markSynced(text, latest.version);
      sinceSync = ChangeSet.empty(text.length);
      setSaveState("saved");
      return;
    }
    if (isDirty()) {
      setSaveState("conflict");
      showConflict();
      return;
    }
    replaceFromDisk(latest);
    // The assistant's own edits say so in its panel and in the review.
    if (!assistantBusy && reviewBase === undefined) toast(t.save.reloaded(session.name), { tone: "info", timeout: 2600, key: "disk-reload" });
  }

  function replaceFromDisk(latest: SourceResponse): void {
    const text = toEditorText(latest.text);
    format = detectFormat(latest.text);
    view.dispatch({
      changes: minimalChange(editorText(), text),
      userEvent: "input.reload",
    });
    markSynced(text, latest.version);
    sinceSync = ChangeSet.empty(text.length);
    hideBanner();
    setSaveState("saved");
    // The agent's last edit can reach the editor after the agent has finished.
    if (reviewBase !== undefined && !assistantBusy && !reviewing) showReview();
  }

  function showConflict(): void {
    showBanner(t.save.conflictBanner(session.name), [
      {
        label: t.save.useDisk,
        run: async () => {
          const latest = await call<SourceResponse>("GET", "source");
          replaceFromDisk(latest);
        },
      },
      {
        label: t.save.keepMine,
        primary: true,
        run: async () => {
          setSaveState("dirty");
          await save({ auto: false, force: true });
        },
      },
    ]);
  }

  function showBanner(message: string, actions: Array<{ label: string; run: () => void | Promise<void>; primary?: boolean }>): void {
    slot("banner-text").textContent = message;
    slot("banner-actions").replaceChildren(...actions.map((action) => {
      const button = element("button", `studio-button${action.primary ? " is-primary" : ""}`, action.label);
      button.type = "button";
      button.addEventListener("click", () => void action.run());
      return button;
    }));
    slot("banner").hidden = false;
  }

  function hideBanner(): void {
    slot("banner").hidden = true;
  }

  // ── Offsets between the preview, the file, and the editor ───────────────────────────────
  /** An editor range for file offsets the preview reported against the saved document. */
  function editorRange(target: { start: number; end: number }): { from: number; to: number } | undefined {
    const from = fromFileOffset(syncedDoc, target.start, format);
    const to = fromFileOffset(syncedDoc, target.end, format);
    if (from > syncedDoc.length || to > syncedDoc.length) return undefined;
    return { from: sinceSync.mapPos(from, 1), to: sinceSync.mapPos(to, -1) };
  }

  /** The line and column of a file offset in the saved document, which the preview ran. */
  function savedLineOf(offset: number): { line: number; column: number } | undefined {
    const position = fromFileOffset(syncedDoc, offset, format);
    if (position > syncedDoc.length) return undefined;
    const line = syncedDoc.lineAt(position);
    return { line: line.number, column: position - line.from + 1 };
  }

  /**
   * The statements a failed run stopped in, underlined where they are now in the editor. The
   * preview reports them against the saved text, so typing since then only moves them.
   */
  function documentDiagnostics(): Diagnostic[] {
    return [...runtimeDiagnostics(), ...namesDiagnostics(), ...formulaDiagnostics()];
  }

  /**
   * Formulas in quoted strings whose backslashes became escapes, which TypeScript accepts and the
   * slide then shows broken. Each offers to write the string so it keeps what was typed.
   */
  function formulaDiagnostics(): Diagnostic[] {
    const doc = view.state.doc;
    const found = formulaEscapes(doc.toString());
    const fixLabel = (item: FormulaEscape): string => (
      item.fix.kind === "template" ? t.formulas.toTemplate(item.command) : t.formulas.toDouble
    );
    const hint = (item: FormulaEscape): string => (
      item.fix.kind === "template" ? t.formulas.template(item.command) : t.formulas.double
    );
    problems.set("formulas", found.map((item): Problem => ({
      source: "formulas",
      severity: "warning",
      message: t.formulas.lost(item.escapes),
      detail: hint(item),
      from: item.start,
      to: item.end,
      line: doc.lineAt(item.start).number,
      slideIndex: slideIndexAt(item.start),
      fix: { label: fixLabel(item), run: () => fixFormula(item.start) },
    })));
    return found.map((item): Diagnostic => ({
      from: item.start,
      to: item.end,
      severity: "warning",
      message: `${t.formulas.lost(item.escapes)} ${hint(item)}`,
      source: "FrameSeq",
      actions: [{ name: fixLabel(item), apply: (_view, from) => fixFormula(from) }],
    }));
  }

  /** Rewrite the string that starts here, as the text reads now, so a stale fix cannot land. */
  function fixFormula(start: number): void {
    const item = formulaEscapes(view.state.doc.toString()).find((candidate) => candidate.start === start);
    if (!item) return;
    view.dispatch({
      changes: { from: item.fix.start, to: item.fix.end, insert: item.fix.text },
      userEvent: "input.fix",
    });
    view.focus();
  }

  /**
   * Names that refer to nothing on their slide, read from the text as it is typed. They join the
   * Problems list beside TypeScript's, which cannot see inside the strings that hold them.
   */
  function namesDiagnostics(): Diagnostic[] {
    const doc = view.state.doc;
    const found = nameDiagnostics(doc.toString());
    problems.set("names", found.map((item): Problem => ({
      source: "names",
      severity: item.severity,
      message: item.message,
      code: "names",
      from: item.start,
      to: item.end,
      line: doc.lineAt(item.start).number,
      slideIndex: slideIndexAt(item.start),
    })));
    return found.map((item) => ({
      from: item.start,
      to: Math.max(item.end, item.start + 1),
      severity: item.severity,
      message: item.message,
      source: "FrameSeq",
    }));
  }

  function runtimeDiagnostics(): Diagnostic[] {
    return runtimeFailures.flatMap((failure): Diagnostic[] => {
      if (failure.start === undefined || failure.end === undefined) return [];
      const range = editorRange({ start: failure.start, end: failure.end });
      if (!range || range.to <= range.from) return [];
      // A statement over several lines is marked on its first, where it starts.
      const firstLine = view.state.doc.lineAt(range.from);
      return [{
        from: range.from,
        to: Math.min(range.to, firstLine.to),
        severity: "error",
        message: failure.message,
        source: "FrameSeq",
      }];
    });
  }

  /** Where an editor position was in the saved document, which the preview is drawn from. */
  function savedLocation(position: number): { line: number; column: number } {
    const saved = Math.min(sinceSync.invertedDesc.mapPos(position, 1), syncedDoc.length);
    const line = syncedDoc.lineAt(saved);
    return { line: line.number, column: saved - line.from + 1 };
  }

  /**
   * Apply a drag from the preview to the editor rather than to the file, so it becomes an
   * ordinary undoable edit, then save it so the preview redraws from it.
   */
  async function applyPreviewEdit(request: Record<string, unknown>): Promise<boolean> {
    const doc = view.state.doc;
    const changes: ChangeSpec[] = [];
    if (Array.isArray(request.edits)) {
      if (request.edits.length === 0 || request.edits.length > 100) return false;
      for (const candidate of request.edits as Array<Record<string, unknown>>) {
        const { start, end, expected, value } = candidate ?? {};
        if (!Number.isInteger(start) || !Number.isInteger(end) || typeof expected !== "string"
          || typeof value !== "number" || !Number.isFinite(value)) return false;
        const range = editorRange({ start: start as number, end: end as number });
        if (!range || doc.sliceString(range.from, range.to) !== expected) return false;
        changes.push({ from: range.from, to: range.to, insert: String(Math.round(value)) });
      }
      view.dispatch({ changes, userEvent: "input.preview" });
    } else if (request.move && typeof request.move === "object") {
      const { start, end, expected, at } = request.move as Record<string, unknown>;
      if (!Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(at)
        || typeof expected !== "string") return false;
      const range = editorRange({ start: start as number, end: end as number });
      const target = editorRange({ start: at as number, end: at as number });
      if (!range || !target) return false;
      const block = doc.sliceString(range.from, range.to);
      if (block !== toEditorText(expected)) return false;
      if (target.from === range.from || target.from === range.to) return true;
      if (target.from > range.from && target.from < range.to) return false;
      view.dispatch({
        changes: [
          { from: range.from, to: range.to, insert: "" },
          { from: target.from, insert: block },
        ].sort((a, b) => a.from - b.from),
        userEvent: "move.preview",
      });
    } else if (Array.isArray(request.remove)) {
      // Objects deleted in the preview: each one's whole lines, only while they still read as
      // the preview saw them.
      if (request.remove.length === 0 || request.remove.length > 100) return false;
      for (const candidate of request.remove as Array<Record<string, unknown>>) {
        const { start, end, expected } = candidate ?? {};
        if (!Number.isInteger(start) || !Number.isInteger(end) || typeof expected !== "string") return false;
        const range = editorRange({ start: start as number, end: end as number });
        if (!range || doc.sliceString(range.from, range.to) !== toEditorText(expected)) return false;
        changes.push({ from: range.from, to: range.to, insert: "" });
      }
      const ordered = (changes as Array<{ from: number; to: number }>).sort((a, b) => a.from - b.from);
      if (ordered.some((change, index) => index > 0 && change.from < ordered[index - 1].to)) return false;
      suppressFollow = true;
      view.dispatch({ changes: ordered, userEvent: "delete.preview" });
    } else {
      return false;
    }
    return save({ auto: false });
  }

  // ── Outline: which slide and object the cursor is in ────────────────────────────────────
  function scheduleInspect(delay = 220): void {
    if (inspectTimer) clearTimeout(inspectTimer);
    inspectTimer = setTimeout(() => void inspect(), delay);
  }

  async function inspect(): Promise<InspectReport | undefined> {
    const text = editorText();
    if (report && reportText === text) return report;
    try {
      const next = await call<InspectReport>("POST", "inspect", { text });
      if (editorText() !== text) return undefined;
      report = next;
      reportText = text;
      showMarks();
      refreshInspector();
      showCursor();
      return next;
    } catch {
      return undefined;
    }
  }

  /**
   * How the slides the rail rendered line up with the editor's text: which top-level statement
   * made each one, and which lines belong to it. Only available while the rail and the outline
   * describe the same text, and nothing that rearranges slides works without it.
   */
  function slideMap(): SlideMap | undefined {
    if (!outline || !report || reportText !== editorText()) return undefined;
    return buildSlideMap(view.state.doc, report.statements, outline, editorRange);
  }

  /**
   * The slide map once the rail has drawn the text the editor holds. Right after a save the
   * rail is still redrawing, so an action taken then waits a moment rather than refusing.
   */
  async function settledSlideMap(): Promise<SlideMap | undefined> {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await inspect();
      const map = slideMap();
      if (map) return map;
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    return undefined;
  }

  /** Number the statements that make slides, in the gutter, with the slides they make. */
  function showMarks(): void {
    const map = slideMap();
    const doc = view.state.doc;
    let marks: SlideMark[] | undefined;
    if (map) {
      marks = map.groups.map((group) => ({
        indices: group.slides,
        line: doc.lineAt(group.anchor).number,
        endLine: doc.lineAt(Math.max(group.from, group.to - 1)).number,
        label: outline?.[group.slides[0]]?.label ?? "",
      }));
    } else if (!outline && report && reportText === editorText()) {
      // Until the rail has rendered, the static outline is the best guess.
      marks = pages().map((slide) => ({
        indices: [slide.index - 1],
        line: slide.source.line,
        endLine: slide.source.endLine,
        label: slide.label,
      }));
    }
    if (marks) showSlideMarks(view, marks);
    showPreviewSlide(view, previewSlide);
  }

  function slideIndexAt(position: number, prefer?: number): number | undefined {
    const map = slideMap();
    if (map && report) return slideAt(map, report.statements, position, prefer);
    if (!report || reportText !== editorText() || outline) return undefined;
    const line = view.state.doc.lineAt(position).number;
    const slide = pages().find((candidate) => line >= candidate.source.line && line <= candidate.source.endLine);
    return slide ? slide.index - 1 : undefined;
  }

  /** The innermost object written at an editor position, on a slide or a master page. */
  function objectAt(position: number) {
    return [...(report?.slides ?? []), ...(report?.masters ?? [])]
      .flatMap((slide) => slide.objects)
      .filter((object) => (object.source.start ?? Infinity) <= position && position <= (object.source.end ?? -1))
      .sort((a, b) => ((a.source.end ?? 0) - (a.source.start ?? 0)) - ((b.source.end ?? 0) - (b.source.start ?? 0)))[0];
  }

  /** Show the slide that holds the cursor, and outline the object written where it stands. */
  function followCursor(): void {
    if (!follow || !report || reportText !== editorText()) return;
    const head = view.state.selection.main.head;
    const index = slideIndexAt(head, previewSlide);
    if (index === undefined) return;
    const object = objectAt(head);
    if (object?.source.start !== undefined) {
      frames.focus({ slideIndex: index, ...savedLocation(object.source.start) });
    } else {
      frames.focus({ slideIndex: index });
    }
  }

  /**
   * Show a slide and put the cursor on the code that made it: its own slide() call when that is
   * among the group's lines, as in a loop, otherwise the statement that ran, such as a helper
   * call, since the helper's slide() line is shared by every slide it makes.
   */
  function goToSlide(index: number, { focusEditor }: { focusEditor: boolean }): void {
    const map = slideMap();
    const groupIndex = map?.groupOf[index];
    const group = groupIndex === undefined ? undefined : map?.groups[groupIndex];
    const call = map?.calls[index];
    let position = group
      ? (call !== undefined && call >= group.from && call < group.to ? call : group.anchor)
      : call;
    if (position === undefined && !outline && report && reportText === editorText()) {
      const slide = pages()[index];
      if (slide) position = view.state.doc.line(Math.min(slide.source.line, view.state.doc.lines)).from;
    }
    if (position !== undefined) {
      suppressFollow = true;
      // A slide reads from its first line down, so that line goes near the top of the editor.
      view.dispatch({
        selection: EditorSelection.cursor(position),
        effects: EditorView.scrollIntoView(position, { y: "start", yMargin: 36 }),
      });
    }
    frames.focus({ slideIndex: index });
    if (focusEditor) view.focus();
  }

  function goToSource(index: number): void {
    showEditor(true);
    goToSlide(index, { focusEditor: true });
  }

  // ── Editor updates ──────────────────────────────────────────────────────────────────────
  function handleUpdate(update: ViewUpdate): void {
    if (update.docChanged) {
      for (const transaction of update.transactions) {
        if (!transaction.docChanged) continue;
        sinceSync = sinceSync.compose(transaction.changes);
        if (sinceSaveStart) sinceSaveStart = sinceSaveStart.compose(transaction.changes);
        notes.map(transaction.changes);
      }
      previewNotes = undefined;
      if (saveState !== "conflict") setSaveState(isDirty() ? "dirty" : "saved");
      if (isDirty()) scheduleSave();
      scheduleInspect();
    }
    if (reviewing) refreshReview();
    if (update.selectionSet || update.docChanged) {
      assistant?.refreshContext();
      showCursor();
      if (suppressFollow) {
        suppressFollow = false;
      } else if (update.selectionSet) {
        if (followTimer) clearTimeout(followTimer);
        followTimer = setTimeout(followCursor, 140);
      }
    }
  }

  function showCursor(): void {
    const selection = view.state.selection.main;
    const line = view.state.doc.lineAt(selection.head);
    const selected = selection.to - selection.from;
    slot("status-cursor").textContent = t.status.cursor(line.number, selection.head - line.from + 1) + (selected ? t.status.selected(selected) : "");
    const index = slideIndexAt(selection.head, previewSlide);
    const crumb = slot("breadcrumb");
    if (index === undefined) {
      crumb.textContent = "";
      return;
    }
    // The rail names a master page as the Studio does; the outline only knows its name.
    const label = outline?.[index]?.label
      ?? (masterView ? t.masters.label(pages()[index]?.master ?? "") : pages()[index]?.label) ?? "";
    const object = objectAt(selection.head);
    const place = masterView ? label : `${t.status.slide(index + 1)}${label ? ` · ${label}` : ""}`;
    crumb.textContent = `${place}${object ? ` › ${object.type}` : ""}`;
    inspector.highlight(object);
  }

  function showPreviewPosition(): void {
    const text = renderedCount > 0 ? `${previewSlide + 1} / ${renderedCount}${previewLabel ? ` · ${previewLabel}` : ""}` : "";
    slot("preview-slide").textContent = text;
    slot("status-slide").textContent = renderedCount > 0
      ? (masterView ? t.masters.slideOf : t.status.slideOf)(previewSlide + 1, renderedCount)
      : "";
    slot("slide-count").textContent = renderedCount > 0 ? String(renderedCount) : "";
  }

  // ── Problems ────────────────────────────────────────────────────────────────────────────
  function handleDiagnostics(diagnostics: LanguageDiagnostic[], text: string): void {
    if (text !== editorText()) return;
    const doc = view.state.doc;
    problems.set("typescript", diagnostics.map((diagnostic): Problem => {
      const from = Math.min(diagnostic.from, doc.length);
      return {
        source: "typescript",
        severity: diagnostic.severity,
        message: diagnostic.message.split("\n")[0],
        detail: diagnostic.message.includes("\n") ? diagnostic.message.split("\n").slice(1).join(" ").trim() : undefined,
        code: `ts(${diagnostic.code})`,
        from,
        to: Math.min(diagnostic.to, doc.length),
        line: doc.lineAt(from).number,
        slideIndex: slideIndexAt(from),
      };
    }));
  }

  function showCounts(errors: number, warnings: number): void {
    const badge = slot("problem-badge");
    badge.textContent = String(errors + warnings);
    badge.dataset.tone = errors > 0 ? "error" : (warnings > 0 ? "warning" : "clean");
    const status = slot("status-problems");
    status.textContent = `● ${errors}  ▲ ${warnings}`;
    status.dataset.tone = badge.dataset.tone;
    status.title = t.status.problemCounts(errors, warnings);
  }

  function selectProblem(problem: Problem): void {
    if (problem.from !== undefined || problem.line !== undefined) showEditor(true);
    if (problem.from !== undefined) {
      view.dispatch({
        selection: EditorSelection.range(problem.from, problem.to ?? problem.from),
        scrollIntoView: true,
      });
      view.focus();
      return;
    }
    if (problem.slideIndex !== undefined) {
      frames.focus(problem.path
        ? { slideIndex: problem.slideIndex, path: problem.path }
        : { slideIndex: problem.slideIndex });
    }
    if (problem.line !== undefined) {
      const savedLine = syncedDoc.line(Math.min(Math.max(problem.line, 1), syncedDoc.lines));
      const position = sinceSync.mapPos(Math.min(savedLine.from + Math.max((problem.column ?? 1) - 1, 0), savedLine.to));
      suppressFollow = true;
      view.dispatch({ selection: EditorSelection.cursor(position), scrollIntoView: true });
      view.focus();
    }
  }

  let checkTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleLayoutCheck(frame: HTMLIFrameElement): void {
    if (checkTimer) clearTimeout(checkTimer);
    checkTimer = setTimeout(() => void runLayoutCheck(frame), 120);
  }

  /**
   * Run `frameseq check`'s own rules against the print-mode copy of the deck, which the server
   * keeps current exactly like the visible preview.
   */
  async function runLayoutCheck(frame: HTMLIFrameElement): Promise<void> {
    const target = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!target || !doc || doc.documentElement.dataset.ready !== "true") return;
    const state = slot("check-state");
    state.textContent = t.check.checking;
    try {
      await doc.fonts.ready;
      await Promise.race([
        Promise.all([...doc.images].filter((image) => !image.complete).map((image) => new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        }))),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      const result = collectLayoutIssues(target);
      problems.set("layout", result.issues.map((issue): Problem => ({
        source: "layout",
        severity: issue.severity,
        message: issue.message,
        detail: issue.suggestions[0],
        code: issue.rule,
        slideIndex: issue.slide.index - 1,
        slideLabel: issue.slide.label,
        line: issue.element.source?.line,
        column: issue.element.source?.column,
        path: issue.element.path,
      })));
      state.textContent = t.check.checked(result.slides);
    } catch (error) {
      state.textContent = t.check.failed;
      appendOutput(`${t.check.failedOutput(error instanceof Error ? error.message : String(error))}\n`);
    }
  }

  function onBuildError(payload: unknown): void {
    const error = (payload as { err?: { message?: string; frame?: string; loc?: { file?: string; line?: number; column?: number }; plugin?: string } })?.err;
    if (!error?.message) return;
    const file = error.loc?.file?.replaceAll("\\", "/").toLowerCase();
    const ours = file === session.entry.replaceAll("\\", "/").toLowerCase();
    problems.set("build", [{
      source: "build",
      severity: "error",
      message: error.message.split("\n")[0].replace(/^\[[^\]]+\]\s*/, ""),
      detail: error.frame?.trim() || error.message.split("\n").slice(1, 4).join(" ").trim() || undefined,
      line: ours ? error.loc?.line : undefined,
      column: ours ? (error.loc?.column ?? 0) + 1 : undefined,
    }]);
    // The status bar counts it either way; a terminal in use keeps the panel.
    if (root.classList.contains("is-panel-collapsed") || panelTab !== "terminal") showPanel("problems", false);
  }

  // ── Slides: insert, duplicate, delete, move ─────────────────────────────────────────────
  /**
   * Rearrange slides by rewriting the lines that make them. A loop or a helper call makes
   * several slides from one statement, and those can only be moved, repeated, or removed
   * together; the Studio says so whenever an action touches more than the slide it was asked
   * about. `to` is a position among the rendered slides, before which a moved slide lands, and
   * `layout` is what an inserted slide starts as.
   */
  async function rearrange(
    action: "insert" | "duplicate" | "delete" | "move",
    index: number,
    to = 0,
    layout?: SlideLayout,
  ): Promise<void> {
    const map = await settledSlideMap();
    if (!map) {
      toast(t.rail.catchingUp, { tone: "warning" });
      return;
    }
    const doc = view.state.doc;
    const groupIndex = map.groupOf[index];
    const group = groupIndex === undefined ? undefined : map.groups[groupIndex];
    if (!group && action !== "insert") {
      toast(t.rail.notHere(index + 1, session.name), { tone: "warning" });
      return;
    }
    const size = group?.slides.length ?? 0;
    const first = group?.slides[0] ?? 0;
    const last = group?.slides[size - 1] ?? -1;
    const together = group && size > 1
      ? t.rail.groupFromLine(size, doc.lineAt(group.anchor).number)
      : t.rail.single(index + 1);
    let spec: TransactionSpec | undefined;
    let landing = index;
    if (action === "insert") {
      spec = insertSlide(doc, map.groups, groupIndex ?? -1, layout);
      landing = group ? last + 1 : 0;
    } else if (action === "duplicate" && group) {
      spec = duplicateSlide(doc, group);
      landing = last + 1;
    } else if (action === "delete" && group) {
      spec = deleteSlide(group);
      landing = Math.max(0, Math.min(first, renderedCount - size - 1));
    } else if (action === "move" && group && groupIndex !== undefined) {
      const target = to >= renderedCount ? map.groups.length : map.groupOf[to];
      if (target === undefined) {
        toast(t.rail.moveOutside, { tone: "warning" });
        return;
      }
      spec = moveSlide(doc, map.groups, groupIndex, target);
      const targetFirst = target < map.groups.length ? map.groups[target].slides[0] : renderedCount;
      landing = target > groupIndex ? targetFirst - size : targetFirst;
    }
    if (!spec) return;
    suppressFollow = true;
    view.dispatch(spec);
    view.focus();
    await save({ auto: false });
    frames.focus({ slideIndex: landing });
    if (action === "delete") {
      toast(t.rail.deleted(together), {
        tone: "info",
        actions: [{ label: t.rail.undo, run: () => { undo(view); } }],
      });
    } else if (size > 1 && action !== "insert") {
      toast(action === "move" ? t.rail.moved(together) : t.rail.duplicated(together), { tone: "info" });
    }
  }

  /**
   * Bind objects selected in the preview into one named region, so they move together: their
   * lines are wrapped in at("name").column() and followed by a return to where they were.
   */
  async function bindSelection(targets: SourceTarget[]): Promise<void> {
    const current = await inspect();
    if (!current) return;
    const starts = targets
      .map(editorRange)
      .filter((range): range is { from: number; to: number } => Boolean(range))
      .map((range) => range.from);
    const plan = planBinding(view.state.doc, pages(current), starts);
    if (typeof plan === "string") {
      toast(plan, { tone: "warning" });
      return;
    }
    const path = await askText({
      title: t.bind.title,
      message: t.bind.message,
      value: plan.suggestion,
      confirm: t.bind.confirm,
      validate: (value) => {
        if (!/^[A-Za-z_][A-Za-z0-9_-]*(?:\/[A-Za-z_][A-Za-z0-9_-]*)*$/.test(value)) {
          return t.bind.badPath;
        }
        return plan.taken.has(value) ? t.bind.taken(value) : undefined;
      },
    });
    if (!path || editorText() !== reportText) return;
    suppressFollow = true;
    view.dispatch(bindRegion(view.state.doc, plan, path));
    view.focus();
    await save({ auto: false });
  }

  // ── Drawing objects onto a slide ───────────────────────────────────────────────────────────
  let placingHint: ReturnType<typeof toast> | undefined;

  /** The group of statements that made the slide in the preview, when objects can be added to it. */
  async function placeableGroup(): Promise<{ map: SlideMap; group: SlideMap["groups"][number] } | undefined> {
    const map = await settledSlideMap();
    if (!map) {
      toast(t.rail.catchingUp, { tone: "warning" });
      return undefined;
    }
    const groupIndex = map.groupOf[previewSlide];
    const group = groupIndex === undefined ? undefined : map.groups[groupIndex];
    if (!group) {
      toast(t.rail.notHere(previewSlide + 1, session.name), { tone: "warning" });
      return undefined;
    }
    if (group.slides.length > 1) {
      toast(t.insert.madeInCode(previewSlide + 1), { tone: "warning" });
      return undefined;
    }
    return { map, group };
  }

  /** Let the next drag on the preview draw an object of this kind. */
  async function startPlacing(kind: InsertKind): Promise<void> {
    // A placeholder belongs on a master page.
    if (isPlaceholderKind(kind) && !masterView) return;
    if (isContentKind(kind)) {
      await insertContent(kind);
      return;
    }
    if (kind !== "connector" && !await placeableGroup()) return;
    const name = insertName(kind);
    const hint = kind === "connector"
      ? t.insert.hintConnector
      : kind === "polygon"
        ? t.insert.hintPolygon
        : (kind === "line" || kind === "arrow" ? t.insert.hintLine(name) : t.insert.hintDraw(name));
    placingHint = toast(hint, {
      tone: "info",
      timeout: 0,
      key: "placing",
      actions: [{ label: t.insert.cancel, run: () => frames.cancelPlace() }],
    });
    frames.place(kind);
  }

  /** The content object a drag on a canvas will place, with its picture already chosen. */
  let placingContent: ContentCode | undefined;

  /** The quote the document writes its strings with, so inserted code reads like the rest. */
  function documentQuote(): string {
    const text = editorText();
    return (text.match(/'/g)?.length ?? 0) > (text.match(/"/g)?.length ?? 0) ? "'" : '"';
  }

  /** The indent of the line a position is on. */
  function indentAt(position: number): string {
    return /^[ \t]*/.exec(view.state.doc.lineAt(position).text)?.[0] ?? "";
  }

  /**
   * Where content goes on a slide that flows: after the statement holding the editor's cursor,
   * which is the object selected in the preview or the panel, or after the slide's last line.
   */
  function flowPoint(group: SlideGroup): { after: number; indent: string } {
    const head = view.state.selection.main.head;
    const statements = report && reportText === editorText()
      ? report.statements.filter((statement) => statement.start >= group.from && statement.start < group.to)
      : [];
    const holding = head >= group.from && head <= group.to
      ? statements.filter((statement) => statement.start <= head).pop()
      : undefined;
    const statement = holding ?? statements[statements.length - 1];
    if (!statement) return { after: slideEnd(view.state.doc, group), indent: indentAt(group.anchor) };
    return { after: statement.end, indent: indentAt(statement.start) };
  }

  /**
   * The slide content goes into, and its layout. While the slides are still redrawing, as they
   * are while a formula compiles, the outline of the editor's own text stands in for them, so
   * one insertion can follow another without waiting: the slide in the preview when every slide
   * is written once, as the outline then counts them alike, or else the one the cursor is in.
   */
  async function contentTarget(): Promise<{ group: SlideGroup; layout: string } | undefined> {
    const doc = view.state.doc;
    const current = await inspect();
    const layoutAt = (position: number): string => {
      const line = doc.lineAt(position).number;
      return pages(current).find((slide) => slide.source.line === line)?.layout ?? "default";
    };
    if (slideMap()) {
      const target = await placeableGroup();
      return target && { group: target.group, layout: layoutAt(target.group.anchor) };
    }
    const line = doc.lineAt(view.state.selection.main.head).number;
    const slide = (current && pages(current).length === renderedCount ? pages(current)[previewSlide] : undefined)
      ?? pages(current).find((candidate) => line >= candidate.source.line && line <= candidate.source.endLine);
    if (!slide) {
      toast(t.rail.catchingUp, { tone: "warning" });
      return undefined;
    }
    const from = doc.line(Math.min(slide.source.line, doc.lines)).from;
    const to = doc.line(Math.min(slide.source.endLine, doc.lines)).to;
    return { group: { slides: [], statement: 0, from, to, anchor: from }, layout: slide.layout };
  }

  /** A picture from this computer, copied beside the presentation, or a web address. */
  async function choosePicture(): Promise<string | undefined> {
    let path: string | undefined;
    if (session.dialogs) {
      try {
        const chosen = await call<ChooseResponse>("POST", "files/choose", { kind: "image", folder: session.directory });
        if (chosen.cancelled) return undefined;
        path = chosen.path;
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error), { tone: "warning" });
      }
    }
    path ??= (await askText({
      title: t.insert.chooseImage,
      message: t.insert.imagePathPrompt,
      value: "",
      confirm: t.insert.names.image,
      validate: (value) => (value.trim() ? undefined : t.insert.imagePathPrompt),
    }))?.trim();
    if (!path) return undefined;
    if (/^https?:\/\//i.test(path)) return path;
    try {
      const imported = await call<{ path: string; copied: boolean }>("POST", "assets/import", { path, language });
      if (imported.copied) toast(t.insert.imageCopied(imported.path), { tone: "info" });
      return imported.path;
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), { tone: "error" });
      return undefined;
    }
  }

  /**
   * Put a content object on the slide in the preview: after the selected object when the slide
   * flows, or where it is drawn on a canvas. Its settings then open in Current slide with its
   * words selected, ready to be typed over; with that panel folded, the editor takes them.
   */
  async function insertContent(kind: ContentKind): Promise<void> {
    if (!await contentTarget()) return;
    const image = kind === "image" ? await choosePicture() : undefined;
    if (kind === "image" && !image) return;
    // An icon is chosen by its picture before it goes on the slide.
    const icon = kind === "icon" ? await chooseIcon(required<HTMLElement>(root, "[data-action='insert']")) : undefined;
    if (kind === "icon" && !icon) return;
    const target = await contentTarget();
    if (!target) return;
    const content = contentCode(kind, { quote: documentQuote(), image, icon });
    if (target.layout === "canvas") {
      placingContent = content;
      placingHint = toast(t.insert.hintDraw(insertName(kind)), {
        tone: "info",
        timeout: 0,
        key: "placing",
        actions: [{ label: t.insert.cancel, run: () => frames.cancelPlace() }],
      });
      frames.place(kind);
      return;
    }
    const { after, indent } = flowPoint(target.group);
    await writeContent(kind, insertAfter(view.state.doc, after, indent, content));
  }

  async function writeContent(kind: ContentKind, spec: TransactionSpec & { at: number }): Promise<void> {
    const { at, ...transaction } = spec;
    suppressFollow = true;
    view.dispatch(transaction);
    const panel = !root.classList.contains("is-inspector-collapsed");
    if (panel) {
      inspector.focusContentAt(at);
    } else {
      showEditor(true);
      view.focus();
    }
    const line = view.state.doc.lineAt(at).number;
    await save({ auto: false });
    toast(panel ? t.insert.flowAdded(insertName(kind), line) : t.insert.added(insertName(kind), line), { tone: "success" });
  }

  /** Write an object drawn in the preview into the slide document, as one undoable step. */
  async function insertPlaced(message: Record<string, unknown>): Promise<void> {
    placingHint?.close();
    placingHint = undefined;
    const kind = message.kind as InsertKind;
    if (kind === "connector") {
      const current = await inspect();
      if (!current) return;
      const slide = inspectedSlide()?.slide;
      const taken = new Set<string>([
        ...(slide?.objects ?? []).map((object) => object.name).filter((name): name is string => Boolean(name)),
        ...(slide?.regions ?? []).map((region) => region.path),
      ]);
      const plan = connectorChanges(
        view.state.doc,
        [message.from as ConnectorEnd, message.to as ConnectorEnd],
        editorRange,
        reportText === editorText() ? current.statements.map((statement) => ({ from: statement.start, to: statement.end })) : [],
        taken,
      );
      if (typeof plan === "string") {
        toast(plan, { tone: "warning" });
        return;
      }
      suppressFollow = true;
      view.dispatch(plan.spec);
      view.focus();
      await save({ auto: false });
      toast(t.insert.connected(...plan.names), { tone: "success" });
      return;
    }

    if (isContentKind(kind)) {
      const target = await contentTarget();
      if (!target) return;
      const placed = placedContent(placingContent ?? contentCode(kind, { quote: documentQuote() }), message as unknown as Placement);
      placingContent = undefined;
      // The preview measured from the slide's first region, as for a shape: step back to it if
      // the lines before moved elsewhere.
      const last = [...(inspectedSlide()?.slide?.objects ?? [])]
        .filter((object) => !object.parentId)
        .sort((a, b) => (a.source.start ?? 0) - (b.source.start ?? 0))
        .at(-1);
      const content = last && last.region !== "main"
        ? { lines: ["main();", ...placed.lines], select: placed.select && { ...placed.select, line: placed.select.line + 1 } }
        : placed;
      const end = slideEnd(view.state.doc, target.group);
      await writeContent(kind, insertAfter(view.state.doc, end, indentAt(target.group.anchor), content));
      return;
    }
    const target = await placeableGroup();
    if (!target) return;
    const { code, select } = placementCode(message as unknown as Placement);
    // The preview measured from the slide's first region; step back to it if the lines before
    // moved elsewhere.
    const slide = inspectedSlide()?.slide;
    const last = [...(slide?.objects ?? [])]
      .filter((object) => !object.parentId)
      .sort((a, b) => (a.source.start ?? 0) - (b.source.start ?? 0))
      .at(-1);
    const elsewhere = Boolean(last && last.region !== "main");
    suppressFollow = true;
    view.dispatch(appendToSlide(view.state.doc, target.group, code, elsewhere, select));
    view.focus();
    const line = view.state.doc.lineAt(view.state.selection.main.head).number;
    await save({ auto: false });
    toast(t.insert.added(insertName(kind), line), { tone: "success" });
  }

  /** Pick a layout at a point on the page, and add a slide made from it after slide `index`. */
  function chooseLayout(index: number, x: number, y: number): void {
    showLayoutPicker(x, y, (layout) => void rearrange("insert", index, 0, layout));
  }

  function showSlideMenu(index: number, x: number, y: number): void {
    if (masterView) {
      const map = slideMap();
      const movable = !map || map.groupOf[index] !== undefined;
      showMenu(x, y, [
        { label: t.masters.add, run: () => showMenu(x, y, newMasterItems(), t.masters.add) },
        "separator",
        { label: t.rail.goToSource, run: () => goToSource(index) },
        "separator",
        { label: t.rail.delete, shortcut: "Del", danger: true, disabled: !movable, run: () => void rearrange("delete", index) },
      ], outline?.[index]?.label ?? t.masters.panel);
      return;
    }
    const map = slideMap();
    const groupIndex = map?.groupOf[index];
    const groups = map?.groups ?? [];
    const group = groupIndex === undefined ? undefined : groups[groupIndex];
    // While the rail is redrawing there is no map yet; the action itself waits for one, so only a
    // map that positively says a slide cannot be changed disables anything.
    const movable = !map || Boolean(group);
    // Move up lands before the group above; move down lands after the group below.
    const upTo = !map
      ? (index > 0 ? index - 1 : undefined)
      : (groupIndex !== undefined && groupIndex > 0 ? groups[groupIndex - 1].slides[0] : undefined);
    const downTo = !map
      ? (index < renderedCount - 1 ? Math.min(index + 2, renderedCount) : undefined)
      : (groupIndex !== undefined && groupIndex < groups.length - 1
        ? (groups[groupIndex + 2]?.slides[0] ?? renderedCount)
        : undefined);
    const items: Array<MenuItem | "separator" | { note: string }> = [];
    if (group && group.slides.length > 1) {
      const others = group.slides.length - 1;
      items.push({
        note: t.rail.groupNote(view.state.doc.lineAt(group.anchor).number, others),
      });
    } else if (map && !group) {
      items.push({ note: t.rail.outsideNote(session.name) });
    }
    items.push(
      { label: t.rail.newAfter, icon: "newSlide", run: () => chooseLayout(index, x, y) },
      { label: t.rail.duplicate, icon: "duplicate", disabled: !movable, run: () => void rearrange("duplicate", index) },
      "separator",
      { label: t.rail.moveUp, icon: "up", disabled: upTo === undefined, run: () => void rearrange("move", index, upTo ?? 0) },
      { label: t.rail.moveDown, icon: "down", disabled: downTo === undefined, run: () => void rearrange("move", index, downTo ?? 0) },
      "separator",
      { label: t.rail.goToSource, icon: "code", run: () => goToSource(index) },
      { label: t.rail.presentFromHere, icon: "present", shortcut: "F5", run: () => present(index) },
      { label: t.rail.editMaster, icon: "master", run: () => openMasterOf(index) },
      "separator",
      { label: t.rail.delete, icon: "delete", shortcut: "Del", danger: true, disabled: !movable, run: () => void rearrange("delete", index) },
    );
    showMenu(x, y, items, t.rail.menuLabel(index + 1));
  }

  // ── Copying objects ─────────────────────────────────────────────────────────────────────
  /**
   * The objects last copied or cut: the lines that write them, the slide they came from, and how
   * often they were pasted back onto it, which moves each copy a step further over.
   */
  let copied: { code: string; slide: number; cut: boolean; pasted: number } | undefined;

  /** How far a copy pasted onto its own slide moves down and to the right, so both show. */
  const copyShift = 24;

  type Block = { from: number; to: number };

  /**
   * The editor ranges of the lines that write the objects selected in the preview, comments above
   * them included, while they still read as the preview saw them. An object inside another one
   * selected with it goes with that one.
   */
  function selectedBlocks(selection: PreviewSelection): Block[] | undefined {
    if (selection.objects.length === 0) return undefined;
    if (selection.objects.some((object) => !object.statement)) {
      toast(t.objects.insideAnother, { tone: "warning" });
      return undefined;
    }
    const doc = view.state.doc;
    const blocks: Block[] = [];
    for (const { statement } of selection.objects) {
      const range = statement && editorRange(statement);
      if (!statement || !range || doc.sliceString(range.from, range.to) !== toEditorText(statement.text)) {
        toast(t.inspector.catchingUp, { tone: "warning", key: "inspector-stale" });
        return undefined;
      }
      blocks.push(range);
    }
    return blocks.sort((a, b) => a.from - b.from)
      .reduce<Block[]>((kept, block) => (kept.length && block.from < kept[kept.length - 1].to ? kept : [...kept, block]), []);
  }

  /**
   * The editor range of the lines that write an object listed in Current slide, comments above
   * included; only the statement itself when it shares its line with other code.
   */
  function inspectedBlocks(object: InspectObject): Block[] | undefined {
    const doc = view.state.doc;
    const statement = object.statement;
    const start = object.source.start;
    if (!statement || start === undefined) {
      toast(t.objects.insideAnother, { tone: "warning" });
      return undefined;
    }
    if (statement.end > doc.length || doc.sliceString(start, start + object.type.length) !== object.type) {
      toast(t.inspector.catchingUp, { tone: "warning", key: "inspector-stale" });
      return undefined;
    }
    const first = doc.lineAt(statement.start);
    const last = doc.lineAt(statement.end);
    const alone = !doc.sliceString(first.from, statement.start).trim() && !doc.sliceString(statement.end, last.to).trim();
    return [alone ? { from: blockStart(doc, statement.start), to: last.to } : { from: statement.start, to: statement.end }];
  }

  /** Write a copy of an object listed in Current slide after it, and say where. */
  function duplicateInspected(object: InspectObject): void {
    const blocks = inspectedBlocks(object);
    if (!blocks) return;
    const at = writeCopy(blocks);
    toast(t.inspector.duplicated(t.inspector.kinds[object.type] ?? object.type, view.state.doc.lineAt(at).number), {
      tone: "info",
      actions: [{ label: t.inspector.undo, run: () => { undo(view); } }],
    });
  }

  /**
   * Write lines after the line holding `after`, as one undoable step, with the cursor on the
   * first that writes something rather than a comment, and have Current slide list what they
   * wrote at once rather than after a pause. Returns where the cursor went.
   */
  function writeLines(after: number, lines: string[], userEvent: string): number {
    const line = view.state.doc.lineAt(after);
    const first = Math.max(0, lines.findIndex((text) => text.trim() && !/^(\/\/|\/\*|\*)/.test(text.trim())));
    const at = line.to + 1 + lines.slice(0, first).reduce((sum, text) => sum + text.length + 1, 0)
      + (/^[ \t]*/.exec(lines[first] ?? "")?.[0].length ?? 0);
    suppressFollow = true;
    view.dispatch({
      changes: { from: line.to, insert: `\n${lines.join("\n")}` },
      selection: EditorSelection.cursor(at),
      scrollIntoView: true,
      userEvent,
    });
    void inspect();
    return at;
  }

  /**
   * Write a copy of the blocks after the last of them, with the names they give made new on the
   * slide and coordinates moved over, so the copy shows beside the original.
   */
  function writeCopy(blocks: Block[]): number {
    const doc = view.state.doc;
    const code = copiedCode(blocks.map(({ from, to }) => doc.sliceString(from, to)));
    const last = blocks[blocks.length - 1];
    const lines = pastedLines(code, namesAt(doc.toString(), blocks[0].from), copyShift);
    return writeLines(Math.max(last.from, last.to - 1), lines, "input.duplicate");
  }

  /**
   * Keep the blocks' lines for Paste, and put them on the clipboard as text too, so they can be
   * pasted into the code or another program. Copied with the keys, the preview has done that.
   */
  function copyBlocks(blocks: Block[], cut: boolean, clipboard = true): void {
    const doc = view.state.doc;
    const code = copiedCode(blocks.map(({ from, to }) => doc.sliceString(from, to)));
    copied = { code, slide: previewSlide, cut, pasted: 0 };
    if (clipboard) void writeClipboard(code);
  }

  /** Put text on the clipboard, as a click on a menu item may. */
  async function writeClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Without the clipboard API, or without the focus it asks for, the copy event carries it.
      const write = (event: ClipboardEvent): void => {
        event.clipboardData?.setData("text/plain", text);
        event.preventDefault();
      };
      document.addEventListener("copy", write, { once: true });
      document.execCommand("copy");
      document.removeEventListener("copy", write);
    }
  }

  /**
   * Write the copied objects onto the slide in the preview, after its selected object or at its
   * end, as Insert writes content. Pasted back onto the slide they came from, they move over a
   * step each time, unless they were cut from it.
   */
  async function pasteObjects(): Promise<void> {
    const clip = copied;
    if (!clip) {
      toast(t.objects.nothingCopied, { tone: "info" });
      return;
    }
    const target = await contentTarget();
    if (!target) return;
    const steps = clip.slide === previewSlide ? clip.pasted + (clip.cut ? 0 : 1) : 0;
    if (clip.slide === previewSlide) clip.pasted += 1;
    const { after } = flowPoint(target.group);
    writeLines(after, pastedLines(clip.code, namesAt(editorText(), after), copyShift * steps), "input.paste");
    await save({ auto: false });
  }

  function duplicateSelected(selection: PreviewSelection): void {
    const blocks = selectedBlocks(selection);
    if (!blocks) return;
    writeCopy(blocks);
    void save({ auto: false });
  }

  function copySelected(selection: PreviewSelection, cut: boolean, clipboard = true): void {
    const blocks = selectedBlocks(selection);
    if (!blocks) return;
    copyBlocks(blocks, cut, clipboard);
    // The preview deletes them as Delete does, which keeps an object that another is placed by.
    if (cut) frames.selectionAction("delete");
  }

  function runObjectCommand(command: ObjectCommand, selection: PreviewSelection): void {
    if (command === "paste") void pasteObjects();
    else if (command === "duplicate") duplicateSelected(selection);
    else copySelected(selection, command === "cut", false);
  }

  // ── Right-click menus ───────────────────────────────────────────────────────────────────
  /** Put the editor's cursor on a position, and show the code there. */
  function revealPosition(position: number): void {
    if (position > view.state.doc.length) return;
    showEditor(true);
    suppressFollow = true;
    view.dispatch({
      selection: EditorSelection.cursor(position),
      effects: EditorView.scrollIntoView(position, { y: "center" }),
    });
    view.focus();
  }

  /** Put the editor's cursor on the code that drew an object in the preview, and show it. */
  function revealTarget(target: SourceTarget): void {
    const range = editorRange(target);
    if (!range) return;
    showEditor(true);
    view.dispatch({ selection: EditorSelection.cursor(range.from), scrollIntoView: true });
    view.focus();
  }

  /**
   * Say why a drag in the preview changed nothing: the layout is locked, with the way to unlock
   * it, or the code works out where the object goes or how big it is, with the way to that code.
   */
  async function explainBlockedDrag(target: SourceTarget, reason: BlockedDrag, code: string): Promise<void> {
    if (reason === "locked") {
      toast(t.objects.layoutLocked, {
        tone: "info",
        key: "layout-blocked",
        actions: [{ label: t.objects.unlock, run: () => frames.setLayoutLock(false) }],
      });
      return;
    }
    if (reason === "shared") {
      toast(t.objects.sharedObject, {
        tone: "warning",
        key: "layout-blocked",
        actions: [{ label: t.objects.goToCode, run: () => revealTarget(target) }],
      });
      return;
    }
    const object = await inspectedObject(target);
    const names = reason === "size" ? ["width", "height"] : ["x", "y"];
    const computed = object?.computed?.find((value) => names.includes(value.name));
    toast(reason === "size" ? t.objects.computedSize(code) : t.objects.computedPosition(code), {
      tone: "warning",
      key: "layout-blocked",
      actions: [{
        label: t.objects.goToCode,
        run: () => (computed ? revealPosition(computed.source.start) : revealTarget(target)),
      }],
    });
  }

  /** The object Current slide lists for one the preview drew, once the outline has caught up. */
  async function inspectedObject(target: SourceTarget): Promise<InspectObject | undefined> {
    const range = editorRange(target);
    if (!range || !await inspect()) return undefined;
    return objectAt(range.from) as InspectObject | undefined;
  }

  /** Open Current slide at an object's settings, with its words selected when `words` asks. */
  function openSettings(object: InspectObject, words: boolean): void {
    if (root.classList.contains("is-inspector-collapsed")) toggleInspector();
    inspector.openSettings(object, words);
  }

  const pasteEntry = (): MenuEntry => ({
    command: "paste",
    label: t.objects.paste,
    icon: "paste",
    shortcut: `${mod}+V`,
    disabled: () => !copied,
    run: () => void pasteObjects(),
  });

  /** What one object's menu ends with: its words and settings, and its code. */
  const objectEnds = (object: InspectObject | undefined, reveal: () => void): MenuEntry[] => [
    "separator",
    ...(object && inspector.hasWords(object)
      ? [{ command: "edit-text", label: t.objects.editText, icon: "text" as const, run: () => openSettings(object, true) }]
      : []),
    ...(object ? [{ command: "format", label: t.objects.format, icon: "format" as const, run: () => openSettings(object, false) }] : []),
    { command: "go-to-code", label: t.objects.goToCode, icon: "code", shortcut: isMac ? "⌥Click" : "Alt+Click", run: reveal },
  ];

  /**
   * The menu of objects selected in the preview: cut, copy, and paste them, duplicate or delete
   * them, stack one, align several or bind them into a region, and reach one's settings or code.
   */
  function selectionEntries(selection: PreviewSelection, object: InspectObject | undefined): MenuEntry[] {
    const { objects, arrange, stacking } = selection;
    const whole = objects.every((item) => item.statement);
    const act = (command: SelectionAction, label: string, icon: MenuIcon, enabled = true): MenuEntry => ({
      command,
      label,
      icon,
      disabled: () => !enabled,
      run: () => frames.selectionAction(command),
    });
    const entries: MenuEntry[] = [
      { command: "cut", label: t.objects.cut, icon: "cut", shortcut: `${mod}+X`, disabled: () => !whole, run: () => copySelected(selection, true) },
      { command: "copy", label: t.objects.copy, icon: "copy", shortcut: `${mod}+C`, disabled: () => !whole, run: () => copySelected(selection, false) },
      pasteEntry(),
      "separator",
      { command: "duplicate", label: t.objects.duplicate, icon: "duplicate", shortcut: `${mod}+D`, disabled: () => !whole, run: () => duplicateSelected(selection) },
      { command: "delete", label: t.objects.delete, icon: "delete", shortcut: "Del", danger: true, run: () => frames.selectionAction("delete") },
      "separator",
    ];
    if (stacking) {
      entries.push(stacking.layered
        ? {
          command: "order",
          label: t.objects.order,
          icon: "layers",
          submenu: () => [
            act("bring-to-front", t.objects.bringToFront, "bringToFront", stacking.forward),
            act("bring-forward", t.objects.bringForward, "up", stacking.forward),
            act("send-backward", t.objects.sendBackward, "down", stacking.backward),
            act("send-to-back", t.objects.sendToBack, "sendToBack", stacking.backward),
          ],
        }
        : {
          command: "order",
          label: t.objects.flowOrder,
          icon: "order",
          submenu: () => [
            act("send-to-back", t.objects.moveToStart, "toStart", stacking.backward),
            act("send-backward", t.objects.moveEarlier, "up", stacking.backward),
            act("bring-forward", t.objects.moveLater, "down", stacking.forward),
            act("bring-to-front", t.objects.moveToEnd, "toEnd", stacking.forward),
          ],
        });
    }
    if (objects.length > 1) {
      entries.push(
        {
          command: "align",
          label: t.objects.align,
          icon: "alignLeft",
          disabled: () => !arrange.x && !arrange.y,
          submenu: () => [
            act("align-left", t.objects.alignLeft, "alignLeft", arrange.x),
            act("align-center", t.objects.alignCenter, "alignCenter", arrange.x),
            act("align-right", t.objects.alignRight, "alignRight", arrange.x),
            "separator",
            act("align-top", t.objects.alignTop, "alignTop", arrange.y),
            act("align-middle", t.objects.alignMiddle, "alignMiddle", arrange.y),
            act("align-bottom", t.objects.alignBottom, "alignBottom", arrange.y),
            "separator",
            act("distribute-horizontal", t.objects.distributeHorizontally, "distributeHorizontally", arrange.distributeX),
            act("distribute-vertical", t.objects.distributeVertically, "distributeVertically", arrange.distributeY),
          ],
        },
        {
          command: "bind-region",
          label: t.objects.bindRegion,
          icon: "group",
          run: () => void bindSelection(objects.map((item) => item.target)),
        },
        "separator",
        { command: "go-to-code", label: t.objects.goToCode, icon: "code", run: () => revealTarget(objects[0].target) },
      );
    } else {
      entries.push(...objectEnds(object, () => revealTarget(objects[0].target)));
    }
    return entries;
  }

  /** The menu of the slide itself, where a right-click lands on no object. */
  function slideEntries(selection: PreviewSelection): MenuEntry[] {
    return [
      pasteEntry(),
      "separator",
      { command: "insert", label: t.menus.insert, icon: "insert", submenu: insertEntries },
      { command: "new-slide", label: t.menu.newSlide, icon: "newSlide", submenu: newSlideEntries },
      "separator",
      {
        command: "lock-layout",
        label: t.objects.lockLayout,
        icon: "move",
        checked: () => selection.locked,
        run: () => frames.setLayoutLock(!selection.locked),
      },
      "separator",
      { ...slideCommand("go-to-source", t.menu.goToSource, () => goToSource(previewSlide)), icon: "code" },
      { command: "present-here", label: t.rail.presentFromHere, icon: "present", shortcut: "F5", run: () => present() },
    ];
  }

  /** A right-click in the preview: the menu of the objects it selected, or of the slide. */
  async function showPreviewMenu(x: number, y: number, selection: PreviewSelection, keyboard: boolean): Promise<void> {
    const count = selection.objects.length;
    if (count === 0) {
      showContextMenu(x, y, slideEntries(selection), { label: t.rail.menuLabel(previewSlide + 1), keyboard });
      return;
    }
    // Current slide's picture of the object says whether it has words to edit.
    const object = count === 1 ? await inspectedObject(selection.objects[0].target) : undefined;
    showContextMenu(x, y, selectionEntries(selection, object), { label: t.objects.menuLabel(count), keyboard });
  }

  /** The menu of an object listed in Current slide. */
  function inspectedObjectEntries(object: InspectObject): MenuEntry[] {
    const whole = Boolean(object.statement);
    const copyObject = (cut: boolean): void => {
      const blocks = inspectedBlocks(object);
      if (!blocks) return;
      copyBlocks(blocks, cut);
      if (cut) inspector.remove(object);
    };
    return [
      { command: "cut", label: t.objects.cut, icon: "cut", shortcut: `${mod}+X`, disabled: () => !whole, run: () => copyObject(true) },
      { command: "copy", label: t.objects.copy, icon: "copy", shortcut: `${mod}+C`, disabled: () => !whole, run: () => copyObject(false) },
      pasteEntry(),
      "separator",
      { command: "duplicate", label: t.objects.duplicate, icon: "duplicate", shortcut: `${mod}+D`, disabled: () => !whole, run: () => duplicateInspected(object) },
      { command: "delete", label: t.objects.delete, icon: "delete", shortcut: "Del", danger: true, disabled: () => !whole, run: () => inspector.remove(object) },
      ...objectEnds(object, () => {
        if (object.source.start !== undefined) revealPosition(object.source.start);
      }),
    ];
  }

  /** Open the master view on the master a slide is drawn on. */
  function openMasterOf(index: number): void {
    const map = slideMap();
    const call = map?.calls[index];
    const line = call === undefined ? undefined : view.state.doc.lineAt(call).number;
    const slide = line === undefined ? report?.slides[index] : report?.slides.find((candidate) => line >= candidate.source.line && line <= candidate.source.endLine);
    const chosen = slide?.masterChoice?.value;
    setMasterView(true, typeof chosen === "string" ? chosen : usualMaster(slide));
  }

  // ── Slide masters ─────────────────────────────────────────────────────────────────────────
  /** The slide the preview showed before the master view opened, to return to when it closes. */
  let slideBeforeMasters = 0;

  /**
   * Show the master pages in the preview and the rail, where they are edited as slides are, or
   * the slides again. `focus` names the master to open on.
   */
  function setMasterView(on: boolean, focus?: string): void {
    const names = masterNames(report?.masters);
    if (on === masterView) {
      if (on && focus && names.includes(focus)) goToSlide(names.indexOf(focus), { focusEditor: false });
      return;
    }
    if (on) slideBeforeMasters = previewSlide;
    masterView = on;
    outline = undefined;
    renderedCount = 0;
    previewLabel = "";
    previewSlide = on ? Math.max(0, focus ? names.indexOf(focus) : 0) : slideBeforeMasters;
    root.classList.toggle("is-master-view", on);
    slot("master-bar").hidden = !on;
    slot("rail-title").textContent = on ? t.masters.panel : t.shell.slides;
    slot("inspector-title").textContent = on ? t.masters.current : t.shell.currentSlide;
    required<HTMLElement>(root, "[data-action='new-slide']").title = on ? t.masters.addTitle : t.shell.newSlideTitle;
    frames.cancelPlace();
    frames.setMasters(on, previewSlide);
    showPreviewPosition();
    showMarks();
    refreshInspector();
    if (on && names.length > 0) toast(t.masters.hint, { tone: "info", key: "master-hint" });
  }

  /** The canvas and the theme's margins, as the preview has them, for a new master to start from. */
  function pageGeometry(): PageGeometry {
    const page = frames.preview.contentDocument?.documentElement;
    const read = (name: string, fallback: number): number => {
      const value = page ? Number.parseFloat(getComputedStyle(page).getPropertyValue(name)) : Number.NaN;
      return Number.isFinite(value) ? value : fallback;
    };
    return {
      width: read("--slide-width", 1280),
      height: read("--slide-height", 720),
      slideX: read("--frameseq-slide-x", 84),
      slideY: read("--frameseq-slide-y", 68),
      coverX: read("--frameseq-cover-x", 96),
      coverY: read("--frameseq-cover-y", 84),
      gap: read("--frameseq-content-gap", 24),
    };
  }

  /** Write a new master page, starting from where the theme puts things, and show it. */
  async function addMaster(name?: string): Promise<void> {
    const current = await inspect();
    if (!current || reportText !== editorText()) {
      toast(t.rail.catchingUp, { tone: "warning" });
      return;
    }
    const taken = masterNames(current.masters);
    let chosen = name;
    if (!chosen) {
      chosen = (await askText({
        title: t.masters.nameTitle,
        message: t.masters.nameMessage,
        value: taken.includes("section") ? "" : "section",
        confirm: t.masters.add,
        validate: (value) => (!masterName.test(value) ? t.masters.badName : taken.includes(value) ? t.masters.taken(value) : undefined),
      }))?.trim();
      if (!chosen) return;
    }
    if (taken.includes(chosen)) {
      toast(t.masters.exists(t.masters.label(chosen)), { tone: "warning" });
      setMasterView(true, chosen);
      return;
    }
    const doc = view.state.doc;
    suppressFollow = true;
    view.dispatch(insertMaster(doc, masterInsertion(doc, current.statements), starterMaster(chosen, pageGeometry())));
    await save({ auto: false });
    await inspect();
    if (masterView) {
      // The rail redraws with the new master among the others; show it once it is there.
      const index = masterNames(report?.masters).indexOf(chosen);
      if (index >= 0) setTimeout(() => goToSlide(index, { focusEditor: false }), 400);
    } else {
      setMasterView(true, chosen);
    }
    toast(t.masters.added(t.masters.label(chosen)), { tone: "success" });
  }

  /** The masters that can be added from a menu: the two used by default, then any other. */
  function newMasterItems(): Array<{ label: string; run: () => void; disabled?: boolean }> {
    const taken = masterNames(report?.masters);
    return [
      { label: t.masters.cover, disabled: taken.includes("cover"), run: () => void addMaster("cover") },
      { label: t.masters.content, disabled: taken.includes("content"), run: () => void addMaster("content") },
      { label: t.masters.other, run: () => void addMaster() },
    ];
  }

  /** The master a slide is drawn on: the one it names, or its usual one. */
  function usualMaster(slide: InspectSlide | undefined): string {
    return slide?.layout === "cover" ? "cover" : "content";
  }

  /**
   * Draw the slide in the preview on another master: one by name, none with false, or its usual
   * one with undefined. The choice is the slide() call's .master(), written, changed, or removed.
   */
  async function chooseMaster(choice: string | false | undefined): Promise<void> {
    const current = await inspect();
    const slide = current && reportText === editorText() ? inspectedSlide()?.slide : undefined;
    if (!slide) {
      toast(t.rail.catchingUp, { tone: "warning" });
      return;
    }
    const code = choice === undefined ? "" : `.master(${choice === false ? "false" : JSON.stringify(choice)})`;
    const existing = slide.masterChoice;
    let change: ChangeSpec | undefined;
    if (existing) change = { from: existing.start, to: existing.end, insert: code };
    else if (slide.notesAt !== undefined && code) change = { from: slide.notesAt, insert: code };
    else if (code) {
      toast(t.masters.cannotChoose, { tone: "warning" });
      return;
    }
    if (!change) return;
    suppressFollow = true;
    view.dispatch({ changes: change, userEvent: "input.master" });
    await save({ auto: false });
    const index = previewSlide + 1;
    toast(choice === undefined
      ? t.masters.chosenAutomatic(index)
      : choice === false ? t.masters.chosenNone(index) : t.masters.chosen(t.masters.label(choice), index), { tone: "success" });
  }

  /** Slide › Master: the masters this slide can be drawn on, with the one it is drawn on checked. */
  function masterChoices(): MenuEntry[] {
    const slide = inspectedSlide()?.slide;
    const chosen = slide?.masterChoice?.value;
    const names = masterNames(report?.masters);
    return [
      { command: "master-automatic", label: t.masters.automatic, checked: () => chosen === undefined, run: () => void chooseMaster(undefined) },
      "separator",
      ...names.map((name): MenuEntry => ({
        command: `master-${name}`,
        label: t.masters.label(name),
        checked: () => chosen === name,
        run: () => void chooseMaster(name),
      })),
      ...(names.length > 0 ? ["separator" as const] : []),
      { command: "master-none", label: t.masters.none, checked: () => chosen === false, run: () => void chooseMaster(false) },
      "separator",
      { command: "edit-master", label: t.rail.editMaster, icon: "master", run: () => setMasterView(true, typeof chosen === "string" ? chosen : usualMaster(slide)) },
    ];
  }

  // ── Templates of one's own ──────────────────────────────────────────────────────────────
  /**
   * Keep this presentation as a template, masters and theme included, so new ones can start
   * from it. One of the same name is replaced only once that is confirmed.
   */
  async function saveAsTemplate(): Promise<void> {
    await flushSave();
    const mine = await ownTemplates();
    const title = report?.presentation.title;
    const name = await askText({
      title: t.files.saveTitle,
      message: t.files.saveMessage(mine.folder),
      value: title && title !== "FrameSeq" ? title : session.name.replace(/\.slides\.ts$|\.ts$/i, ""),
      confirm: t.files.saveConfirm,
      validate: templateNameProblem,
    });
    if (!name) return;
    type Saved = { path: string; assets: string[]; same?: boolean };
    const send = (overwrite: boolean): Promise<Saved> => call<Saved>("POST", "templates/save", { name, overwrite, language });
    let saved: Saved;
    try {
      saved = await send(false);
    } catch (error) {
      if (!(error instanceof StudioRequestError && error.status === 409 && error.data.exists)) {
        toast(error instanceof Error ? error.message : String(error), { tone: "error" });
        return;
      }
      const replace = await askChoice({
        title: t.files.replaceTitle(name),
        message: t.files.replaceMessage,
        choices: [{ label: t.files.replace, value: "replace", primary: true }],
      });
      if (replace !== "replace") return;
      try {
        saved = await send(true);
      } catch (again) {
        toast(again instanceof Error ? again.message : String(again), { tone: "error" });
        return;
      }
    }
    toast(saved.same ? t.files.savedSame : t.files.saved(name, saved.assets.length), {
      tone: "success",
      actions: [{ label: t.files.showTemplate, run: () => void call("POST", "templates/reveal", { name }) }],
    });
  }

  // ── Other presentations ─────────────────────────────────────────────────────────────────
  /** Set once the person chose to drop unsaved edits, so leaving the page no longer warns. */
  let leaving = false;

  /** Settle unsaved edits before another presentation takes this one's place. */
  async function confirmLeave(): Promise<boolean> {
    if (saving) await saving;
    if (!isDirty()) return true;
    if (saveState === "conflict") {
      toast(t.save.resolveFirst(session.name), { tone: "warning" });
      return false;
    }
    const choice = await askChoice({
      title: t.save.askTitle,
      message: t.save.askMessage(session.name),
      choices: [
        { label: t.save.dontSave, value: "discard" },
        { label: t.save.saveButton, value: "save", primary: true },
      ],
    });
    if (choice === "save") return save({ auto: false });
    leaving = choice === "discard";
    return leaving;
  }

  // In the app's own window, closing it settles unsaved edits as opening another presentation
  // does; with auto-save on, the edits of the last moment are saved first, as they would be.
  guardWindowClose(async () => {
    if (autosave && saveState === "dirty") await save({ auto: true });
    return confirmLeave();
  });

  const presentations = new Presentations(session, {
    leave: confirmLeave,
    stay: () => {
      leaving = false;
    },
  });

  // ── Exports and presenting ──────────────────────────────────────────────────────────────
  // PDF, PowerPoint, and Typst can take some of the slides; HTML is a whole presentation to show.
  const exportFormats: Array<{ format: ExportFormat; label: string; hint: string; some?: boolean }> = [
    { format: "pdf", label: t.exports.pdf, hint: "output/pdf", some: true },
    { format: "pptx", label: t.exports.pptx, hint: "output/pptx", some: true },
    { format: "pptx-flat", label: t.exports.pptxFlat, hint: "output/pptx", some: true },
    { format: "html-single", label: t.exports.htmlSingle, hint: "dist/index.html" },
    { format: "html", label: t.exports.html, hint: "dist/" },
    { format: "typst", label: t.exports.typst, hint: "output/typst", some: true },
  ];

  async function exportDeck(format: ExportFormat, label: string, some = false): Promise<void> {
    if (exporting) return;
    let slides: string | undefined;
    if (some && renderedCount > 1) {
      const answer = await askExportSlides({ label, count: renderedCount, current: previewSlide });
      if (!answer || exporting) return;
      slides = answer.slides;
    }
    exporting = true;
    const progress = toast(t.exports.exporting(label), { tone: "busy" });
    try {
      if (!await flushSave()) {
        progress.update(t.exports.saveFirst, { tone: "warning" });
        return;
      }
      appendOutput(`\n${t.exports.output(label)}\n`);
      const result = await call<ExportResult>("POST", "export", { format, slides });
      appendOutput(result.log.endsWith("\n") ? result.log : `${result.log}\n`);
      if (result.ok && result.job) {
        const job = result.job;
        progress.update(t.exports.saved(label, result.display, formatDuration(result.duration)), {
          tone: "success",
          timeout: 15000,
          actions: [
            ...(result.directory ? [] : [{ label: t.exports.download, run: () => download(job) }]),
            { label: t.exports.showInFolder, run: () => void call("POST", "reveal", { job }) },
          ],
        });
      } else {
        progress.update(t.exports.failed(label), {
          tone: "error",
          actions: [{ label: t.exports.showOutput, run: () => showPanel("output") }],
        });
      }
    } catch (error) {
      progress.update(t.exports.error(error instanceof Error ? error.message : String(error)), { tone: "error" });
    } finally {
      exporting = false;
    }
  }

  function download(job: string): void {
    const link = element("a");
    link.href = downloadUrl(job);
    link.download = "";
    document.body.append(link);
    link.click();
    link.remove();
  }

  // The show fills this window, or with a second screen, that one, while presenter view takes
  // this one; the Studio comes back on the slide it ended on.
  let usePresenterView = readPreference("presenter-view", true);
  const show = new SlideShow((index) => {
    if (index !== previewSlide) goToSlide(index, { focusEditor: false });
  }, {
    language,
    remote: session.phoneRemote ? remoteSession() : undefined,
    presenterView: () => usePresenterView,
  });
  resumePairing(session);

  function present(index = previewSlide): void {
    void flushSave();
    // A show presents the slides; from the master view it starts from the slide left for it.
    if (masterView) {
      const slide = slideBeforeMasters;
      setMasterView(false);
      show.start(index === 0 ? 0 : slide);
      return;
    }
    show.start(index);
  }

  // The screens are known before Present › Show screen first opens.
  void refreshScreens();

  /** Present › Show screen: Automatic, then each screen, told apart by where it is from this one. */
  function showScreenItems(): MenuEntry[] {
    const screens = knownScreens();
    const chosen = chosenScreen(screens);
    const items: MenuEntry[] = [
      { command: "show-screen-auto", label: t.menu.showScreenAuto, checked: () => !chosen, run: () => chooseScreen(undefined) },
      "separator",
    ];
    if (screens.length > 1) {
      for (const [index, screen] of screens.entries()) {
        items.push({
          command: `show-screen-${index + 1}`,
          label: t.menu.screenLabel(screenName(screen), direction(screen, screens), screen.pixels.width, screen.pixels.height, screen.primary),
          checked: () => screen === chosen,
          run: () => chooseScreen(screen.key),
        });
      }
    } else if (hasScreens()) {
      // A browser tells the Studio about the other screens only once it may.
      items.push({
        command: "show-screen-find",
        label: t.menu.findScreens,
        run: () => void allowScreens().then((allowed) => {
          if (allowed) toast(t.show.listed);
          else toast(t.show.notListed, { tone: "warning" });
        }),
      });
    } else {
      items.push({ command: "show-screen-none", label: t.menu.noOtherScreen, disabled: () => true });
    }
    return items;
  }

  /** Presenter view, with the notes, the next slide, and a timer, for a second screen. */
  function openPresenterView(): void {
    void flushSave();
    window.open(`/?presenter=1&lang=${language}#${previewSlide + 1}`, "frameseq-presenter");
  }

  // ── Panel, output, and layout ───────────────────────────────────────────────────────────
  let panelTab: PanelTab = "problems";

  function selectTab(tab: PanelTab, focus: boolean): void {
    panelTab = tab;
    root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.tab === tab));
    });
    root.querySelectorAll<HTMLElement>("[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab;
    });
    required<HTMLElement>(root, "[data-action='kill-terminal']").hidden = tab !== "terminal";
    storePreference("terminal-tab", tab === "terminal");
    if (tab === "terminal") void terminal.show(focus);
  }

  /** Open the panel on a tab. A panel opened by itself, for a build error, folds again on the next start. */
  function showPanel(tab: PanelTab, remember = true): void {
    root.classList.remove("is-panel-collapsed");
    if (remember) storePreference("panel-collapsed", false);
    selectTab(tab, true);
  }

  function togglePanel(): void {
    const leaving = required<HTMLElement>(root, ".studio-panel").contains(document.activeElement);
    const collapsed = root.classList.toggle("is-panel-collapsed");
    storePreference("panel-collapsed", collapsed);
    // A folded panel cannot keep the focus, so the editor takes it back.
    if (collapsed && leaving) view.focus();
    else if (!collapsed && panelTab === "terminal") void terminal.show(true);
  }

  /** Ctrl+`: show the terminal, focus it if it shows already, and fold it away if it has the focus. */
  function toggleTerminal(): void {
    const showing = !root.classList.contains("is-panel-collapsed") && panelTab === "terminal";
    if (!showing) showPanel("terminal");
    else if (terminal.hasFocus()) togglePanel();
    else terminal.focus();
  }

  function appendOutput(text: string): void {
    const output = required<HTMLElement>(root, "[data-panel='output']");
    output.textContent = `${output.textContent ?? ""}${text}`.slice(-200_000);
    output.scrollTop = output.scrollHeight;
  }

  const workspace = required<HTMLElement>(root, ".studio-workspace");
  splitter(required(root, "[data-splitter='rail']"), {
    host: root,
    variable: "--studio-rail-width",
    axis: "x",
    fallback: 240,
    minimum: 150,
    maximum: () => Math.max(160, workspace.clientWidth * 0.3),
  });
  const rail = required<HTMLElement>(root, ".studio-rail");
  splitter(required(root, "[data-splitter='inspector']"), {
    host: root,
    variable: "--studio-inspector-height",
    axis: "y",
    fallback: 340,
    minimum: 110,
    maximum: () => Math.max(120, rail.clientHeight - 140),
    invert: true,
  });
  if (readPreference("inspector-collapsed", false)) root.classList.add("is-inspector-collapsed");
  const previewPane = required<HTMLElement>(root, ".studio-preview-pane");
  splitter(required(root, "[data-splitter='notes']"), {
    host: root,
    variable: "--studio-notes-height",
    axis: "y",
    fallback: 130,
    minimum: 70,
    maximum: () => Math.max(80, previewPane.clientHeight - 180),
    invert: true,
  });
  if (readPreference("notes-collapsed", false)) toggleNotes();
  splitter(required(root, "[data-splitter='preview']"), {
    host: root,
    variable: "--studio-preview-width",
    axis: "x",
    fallback: Math.round(Math.max(420, innerWidth * 0.42)),
    minimum: 280,
    maximum: () => Math.max(300, workspace.clientWidth - 420),
    invert: true,
  });
  splitter(required(root, "[data-splitter='assistant']"), {
    host: root,
    variable: "--studio-assistant-width",
    axis: "x",
    fallback: 380,
    minimum: 300,
    maximum: () => Math.max(320, workspace.clientWidth * 0.45),
    invert: true,
  });
  splitter(required(root, "[data-splitter='panel']"), {
    host: root,
    variable: "--studio-panel-height",
    axis: "y",
    fallback: 190,
    minimum: 90,
    maximum: () => Math.max(120, innerHeight * 0.6),
    invert: true,
  });
  // The problems panel starts folded: the status bar counts problems, the editor underlines
  // them, and a build error opens the panel by itself.
  if (readPreference("panel-collapsed", true)) root.classList.add("is-panel-collapsed");
  if (readPreference("rail-collapsed", false)) root.classList.add("is-rail-collapsed");
  if (readPreference("editor-collapsed", false)) showEditor(false);
  // The terminal comes back where it was, with the shell that ran before the page reloaded.
  if (readPreference("terminal-tab", false) && !root.classList.contains("is-panel-collapsed")) selectTab("terminal", false);

  // ── Controls ────────────────────────────────────────────────────────────────────────────
  function setAutosave(enabled: boolean): void {
    autosave = enabled;
    storePreference("autosave", autosave);
    if (autosave && isDirty()) scheduleSave();
    setSaveState(isDirty() ? "dirty" : saveState === "dirty" ? "saved" : saveState);
  }
  const followControl = required<HTMLInputElement>(root, "[data-control='follow']");
  followControl.checked = follow;
  function setFollow(enabled: boolean): void {
    follow = enabled;
    followControl.checked = enabled;
    storePreference("follow", follow);
    if (follow) followCursor();
  }
  followControl.addEventListener("change", () => setFollow(followControl.checked));

  function toggleRail(): void {
    root.classList.toggle("is-rail-collapsed");
    storePreference("rail-collapsed", root.classList.contains("is-rail-collapsed"));
  }

  function toggleInspector(): void {
    const collapsed = root.classList.toggle("is-inspector-collapsed");
    required<HTMLElement>(root, "[data-action='toggle-inspector']").setAttribute("aria-expanded", String(!collapsed));
    storePreference("inspector-collapsed", collapsed);
  }

  function toggleNotes(): void {
    const collapsed = root.classList.toggle("is-notes-collapsed");
    required<HTMLElement>(root, "[data-action='toggle-notes']").setAttribute("aria-expanded", String(!collapsed));
    storePreference("notes-collapsed", collapsed);
  }

  /** Fold the code away to work on the slides alone in the preview, or bring it back. */
  function showEditor(shown: boolean): void {
    if (shown !== root.classList.contains("is-editor-collapsed")) return;
    // A folded editor cannot keep the focus, so it lets it go rather than leave it nowhere.
    if (!shown && view.hasFocus) view.contentDOM.blur();
    root.classList.toggle("is-editor-collapsed", !shown);
    required<HTMLElement>(root, "[data-action='toggle-editor']").setAttribute("aria-pressed", String(shown));
    storePreference("editor-collapsed", !shown);
    // The cursor followed what was picked in the preview meanwhile, so the code opens there.
    if (shown) view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "center" }) });
  }

  function toggleEditor(): void {
    const shown = root.classList.contains("is-editor-collapsed");
    showEditor(shown);
    if (shown) view.focus();
  }

  function stepSlide(step: number): void {
    const count = renderedCount || pages().length;
    goToSlide(Math.min(Math.max(previewSlide + step, 0), Math.max(count - 1, 0)), { focusEditor: true });
  }

  /**
   * Run an editor command from a menu, with the editor focused as its keyboard shortcut would have
   * it. A command about the code itself, unlike undo, first brings a folded editor back.
   */
  function inEditor(command: (target: EditorView) => boolean, { reveal = true } = {}): () => void {
    return () => {
      if (reveal) showEditor(true);
      view.focus();
      command(view);
    };
  }

  const docsBase = `https://pride7.github.io/frameseq/${t.help.docsPath}`;

  function showShortcuts(): void {
    const table = element("table", "studio-shortcuts");
    for (const [keys, action] of t.help.shortcuts) {
      const row = element("tr");
      const keyCell = element("td");
      keyCell.append(element("kbd", "", isMac ? keys.replace("Ctrl+`", terminalKey).replaceAll("Ctrl", "⌘") : keys));
      row.append(keyCell, element("td", "", action));
      table.append(row);
    }
    showInfo(t.help.shortcutsTitle, [table]);
  }

  function showAbout(): void {
    const about = element("div", "studio-about");
    about.innerHTML = logo;
    about.append(
      element("strong", "", t.help.aboutVersion(session.frameseq ?? "")),
      element("p", "", t.help.aboutText),
    );
    showInfo(t.help.aboutTitle, [about]);
  }

  // ── The menu bar ──────────────────────────────────────────────────────────────────────────
  function slideCommand(command: string, label: string, run: () => void, disabled?: () => boolean, shortcut?: string): MenuCommand {
    return { command, label, run, shortcut, disabled: () => renderedCount === 0 || Boolean(disabled?.()) };
  }

  /** The layouts a new slide after the one in the preview can start from. */
  function newSlideEntries(): MenuEntry[] {
    return slideLayouts().map((layout) => ({
      command: `new-slide-${layout.id}`,
      label: layout.name,
      drawing: layoutSketch(layout),
      run: () => void rearrange("insert", previewSlide, 0, layout),
    }));
  }

  /** What Insert puts on the slide: the gallery, content by group, and the drawing tools. */
  function insertEntries(): MenuEntry[] {
    // Insert's own items have icons; the kinds inside its groups are drawn as the gallery draws them.
    const pictures: Partial<Record<string, MenuIcon>> = {
      writing: "text",
      formulas: "formula",
      media: "picture",
      text: "textBox",
      line: "line",
      arrow: "arrow",
      connector: "connector",
      polygon: "polygon",
      basic: "shapes",
      diagram: "diagram",
      arrows: "arrows",
    };
    const kinds = (list: InsertKind[], pictured = false): MenuEntry[] => list.map((kind) => ({
      command: `insert-${kind}`,
      label: insertName(kind),
      icon: pictured ? pictures[kind] : undefined,
      drawing: pictured ? undefined : insertPicture(kind),
      run: () => void startPlacing(kind),
    }));
    return [
      {
        command: "insert-gallery",
        label: t.insert.gallery,
        icon: "gallery",
        run: () => showInsertGallery(required<HTMLElement>(root, "[data-action='insert']"), (kind) => void startPlacing(kind), { placeholders: masterView }),
      },
      "separator",
      // A master page takes the boxes the slides drawn on it put their own text into.
      ...(masterView ? [{
        command: "insert-placeholders",
        label: t.insert.groups.placeholders,
        icon: "master",
        submenu: () => kinds(placeholderGroup.kinds),
      } satisfies MenuEntry, "separator" as const] : []),
      ...contentGroups.map((group): MenuEntry => ({
        command: `insert-${group.id}`,
        label: t.insert.groups[group.id],
        icon: pictures[group.id],
        submenu: () => kinds(group.kinds),
      })),
      "separator",
      ...kinds(insertGroups[0].kinds, true),
      "separator",
      ...insertGroups.slice(1).map((group): MenuEntry => ({
        command: `insert-${group.id}`,
        label: t.insert.groups[group.id],
        icon: pictures[group.id],
        submenu: () => kinds(group.kinds),
      })),
    ];
  }
  const menuBar = new MenuBar(slot("menubar"), [
    {
      id: "file",
      label: t.menus.file,
      accessKey: "f",
      items: () => [
        { command: "new-presentation", label: t.menu.newPresentation, run: () => void presentations.create() },
        { command: "open", label: t.menu.open, shortcut: `${mod}+O`, run: () => void presentations.open() },
        { command: "open-recent", label: t.menu.openRecent, submenu: () => recentEntries() },
        { command: "show-in-folder", label: t.menu.showInFolder, run: () => void call("POST", "files/reveal").catch((error) => toast(String(error instanceof Error ? error.message : error), { tone: "error" })) },
        "separator",
        { command: "save", label: t.menu.save, shortcut: `${mod}+S`, run: () => void save({ auto: false }) },
        { command: "autosave", label: t.menu.autoSave, checked: () => autosave, run: () => setAutosave(!autosave) },
        "separator",
        { command: "save-template", label: t.files.saveTemplate, run: () => void saveAsTemplate() },
        { command: "open-templates", label: t.files.openTemplatesFolder, run: () => void call("POST", "templates/reveal", {}).catch((error) => toast(String(error instanceof Error ? error.message : error), { tone: "error" })) },
        "separator",
        {
          command: "export",
          label: t.menu.export,
          submenu: () => exportFormats.map((item) => ({
            command: `export-${item.format}`,
            label: item.some ? `${item.label}…` : item.label,
            shortcut: item.hint,
            disabled: () => exporting,
            run: () => void exportDeck(item.format, item.label, item.some),
          })),
        },
      ],
    },
    {
      id: "edit",
      label: t.menus.edit,
      accessKey: "e",
      items: () => [
        { command: "undo", label: t.menu.undo, shortcut: `${mod}+Z`, run: inEditor(undo, { reveal: false }) },
        { command: "redo", label: t.menu.redo, shortcut: isMac ? "⇧⌘Z" : "Ctrl+Y", run: inEditor(redo, { reveal: false }) },
        "separator",
        { command: "find", label: t.menu.find, shortcut: `${mod}+F`, run: inEditor(openSearchPanel) },
        { command: "select-all", label: t.menu.selectAll, shortcut: `${mod}+A`, run: inEditor(selectAll) },
        "separator",
        { command: "go-to-definition", label: t.menu.goToDefinition, shortcut: "F12", run: inEditor(goToNameDefinition) },
        { command: "rename-name", label: t.menu.renameName, shortcut: "F2", run: inEditor(renameNameAtCursor) },
      ],
    },
    {
      id: "view",
      label: t.menus.view,
      accessKey: "v",
      items: () => [
        { command: "toggle-rail", label: t.menu.slidesPanel, shortcut: `${mod}+B`, checked: () => !root.classList.contains("is-rail-collapsed"), run: toggleRail },
        { command: "toggle-inspector", label: t.menu.inspectorPanel, checked: () => !root.classList.contains("is-inspector-collapsed"), run: toggleInspector },
        { command: "toggle-notes", label: t.menu.notesPanel, checked: () => !root.classList.contains("is-notes-collapsed"), run: toggleNotes },
        { command: "toggle-editor", label: t.menu.codeEditor, shortcut: `${mod}+E`, checked: () => !root.classList.contains("is-editor-collapsed"), run: toggleEditor },
        { command: "toggle-panel", label: t.menu.bottomPanel, shortcut: `${mod}+J`, checked: () => !root.classList.contains("is-panel-collapsed"), run: togglePanel },
        { command: "toggle-assistant", label: t.menu.assistant, shortcut: `${mod}+Alt+I`, checked: () => root.classList.contains("is-assistant-open"), run: () => toggleAssistant(), disabled: () => !session.assistant },
        { command: "show-problems", label: t.menu.showProblems, run: () => showPanel("problems") },
        { command: "show-output", label: t.menu.showOutput, run: () => showPanel("output") },
        { command: "toggle-terminal", label: t.menu.terminal, shortcut: terminalKey, checked: () => !root.classList.contains("is-panel-collapsed") && panelTab === "terminal", run: toggleTerminal },
        "separator",
        { command: "follow", label: t.menu.followCursor, checked: () => follow, run: () => setFollow(!follow), disabled: () => root.classList.contains("is-editor-collapsed") },
        "separator",
        { command: "slide-master", label: t.masters.view, icon: "master", checked: () => masterView, run: () => setMasterView(!masterView) },
        "separator",
        {
          command: "theme",
          label: t.menu.theme,
          submenu: () => ([
            ["system", t.menu.themeSystem],
            ["light", t.menu.themeLight],
            ["dark", t.menu.themeDark],
          ] as Array<[ThemeChoice, string]>).map(([choice, label]) => ({
            command: `theme-${choice}`,
            label,
            checked: () => themeChoice === choice,
            run: () => chooseTheme(choice),
          })),
        },
        {
          command: "language",
          label: t.menu.language,
          submenu: () => (["en", "zh"] as Language[]).map((choice) => ({
            command: `language-${choice}`,
            label: t.languages[choice],
            checked: () => language === choice,
            run: () => {
              if (choice === language) return;
              writeStash();
              switchLanguage(choice);
            },
          })),
        },
      ],
    },
    {
      id: "slide",
      label: t.menus.slide,
      accessKey: "s",
      items: () => masterView ? [
        {
          command: "new-master",
          label: t.masters.add,
          submenu: () => newMasterItems().map((item, position) => ({
            command: `new-master-${position}`,
            label: item.label,
            disabled: () => Boolean(item.disabled),
            run: item.run,
          })),
        },
        slideCommand("delete-master", t.rail.delete, () => void rearrange("delete", previewSlide)),
        "separator",
        slideCommand("previous-master", t.menu.previousSlide, () => stepSlide(-1), () => previewSlide === 0, `${mod}+PgUp`),
        slideCommand("next-master", t.menu.nextSlide, () => stepSlide(1), () => previewSlide >= renderedCount - 1, `${mod}+PgDn`),
        slideCommand("go-to-source", t.menu.goToSource, () => goToSource(previewSlide)),
        "separator",
        { command: "close-masters", label: t.masters.close, run: () => setMasterView(false) },
      ] : [        { command: "new-slide", label: t.menu.newSlide, submenu: newSlideEntries },
        slideCommand("duplicate-slide", t.menu.duplicateSlide, () => void rearrange("duplicate", previewSlide)),
        slideCommand("move-slide-up", t.menu.moveSlideUp, () => void rearrange("move", previewSlide, previewSlide - 1), () => previewSlide === 0),
        slideCommand("move-slide-down", t.menu.moveSlideDown, () => void rearrange("move", previewSlide, previewSlide + 2), () => previewSlide >= renderedCount - 1),
        slideCommand("delete-slide", t.menu.deleteSlide, () => void rearrange("delete", previewSlide)),
        "separator",
        slideCommand("previous-slide", t.menu.previousSlide, () => stepSlide(-1), () => previewSlide === 0, `${mod}+PgUp`),
        slideCommand("next-slide", t.menu.nextSlide, () => stepSlide(1), () => previewSlide >= renderedCount - 1, `${mod}+PgDn`),
        slideCommand("go-to-source", t.menu.goToSource, () => goToSource(previewSlide)),
        "separator",
        { command: "slide-master-choice", label: t.masters.choose, icon: "master", submenu: () => masterChoices(), disabled: () => renderedCount === 0 },
      ],
    },
    {
      id: "insert",
      label: t.menus.insert,
      accessKey: "i",
      items: insertEntries,
    },
    {
      id: "present",
      label: t.menus.present,
      accessKey: "p",
      items: () => {
        void refreshScreens();
        return [
          { command: "present-beginning", label: t.menu.fromBeginning, shortcut: "⇧F5", run: () => present(0) },
          { command: "present-current", label: t.menu.fromCurrent, shortcut: "F5", run: () => present() },
          "separator",
          {
            command: "use-presenter-view",
            label: t.menu.usePresenterView,
            checked: () => usePresenterView,
            run: () => {
              usePresenterView = !usePresenterView;
              storePreference("presenter-view", usePresenterView);
            },
          },
          { command: "show-screen", label: t.menu.showScreen, submenu: showScreenItems },
          { command: "presenter-view", label: t.menu.presenterView, run: openPresenterView },
          { command: "phone-remote", label: t.menu.phoneRemote, run: () => void pairPhone(session, flushSave) },
          { command: "open-browser", label: t.menu.openInBrowser, run: () => openOutside(`/#${previewSlide + 1}`) },
        ];
      },
    },
    {
      id: "help",
      label: t.menus.help,
      accessKey: "h",
      items: () => [
        { command: "documentation", label: t.menu.documentation, run: () => openOutside(docsBase) },
        { command: "language-tour", label: t.menu.languageTour, run: () => openOutside(`${docsBase}language.html`) },
        { command: "shortcuts", label: t.menu.shortcuts, run: showShortcuts },
        "separator",
        ...updateMenu(),
        "separator",
        { command: "report-issue", label: t.menu.reportIssue, run: () => openOutside("https://github.com/pride7/frameseq/issues") },
        { command: "about", label: t.menu.about, run: showAbout },
      ],
    },
  ], { showAccessKeys: language === "zh" });
  void menuBar;

  /** The recent presentations, refreshed each time the submenu opens. */
  let recent: Array<{ path: string; name: string; folder: string }> = [];
  const refreshRecent = (): void => {
    void presentations.files().then((files) => {
      recent = files.recent.filter((item) => item.path !== session.entry);
    }).catch(() => undefined);
  };
  refreshRecent();
  function recentEntries(): MenuEntry[] {
    refreshRecent();
    if (recent.length === 0) return [{ command: "no-recent", label: t.menu.noRecent, disabled: () => true }];
    return recent.slice(0, 10).map((item) => ({
      command: `recent:${item.name}`,
      label: `${item.name}  —  ${item.folder}`,
      run: () => void presentations.openPath(item.path),
    }));
  }

  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-action], [data-tab]") : null;
    if (!target) return;
    if (target.dataset.tab === "problems" || target.dataset.tab === "output" || target.dataset.tab === "terminal") showPanel(target.dataset.tab);
    switch (target.dataset.action) {
      case "file-menu":
        void presentations.showMenu(target);
        break;
      case "present":
        present();
        break;
      case "new-slide": {
        const box = target.getBoundingClientRect();
        if (masterView) showMenu(box.left, box.bottom + 6, newMasterItems(), t.masters.add);
        else chooseLayout(previewSlide, box.left, box.bottom + 6);
        break;
      }
      case "close-masters":
        setMasterView(false);
        break;
      case "open-browser":
        openOutside(`/#${previewSlide + 1}`);
        break;
      case "insert":
        showInsertGallery(target, (kind) => void startPlacing(kind), { placeholders: masterView });
        break;
      case "toggle-panel":
        togglePanel();
        break;
      case "toggle-assistant":
        toggleAssistant();
        break;
      case "toggle-editor":
        toggleEditor();
        break;
      case "review-accept":
        settleReview(true);
        break;
      case "review-reject":
        settleReview(false);
        break;
      case "review-next":
        goToChange(view, 1);
        break;
      case "review-previous":
        goToChange(view, -1);
        break;
      case "toggle-inspector":
        toggleInspector();
        break;
      case "toggle-notes":
        toggleNotes();
        break;
      case "kill-terminal":
        terminal.kill();
        terminal.focus();
        break;
      case "show-problems":
        showPanel("problems");
        break;
      default:
        break;
    }
  });

  // A file dropped where nothing takes it is not opened in the Studio's place, as a browser would
  // show it and the desktop app would hand it to another program. The assistant takes dropped
  // files, and the editor reads dropped text, each of its own accord.
  const takesFiles = (event: DragEvent) => event.defaultPrevented || !event.dataTransfer?.types.includes("Files")
    || (event.target instanceof Element && event.target.closest(".cm-editor") !== null);
  addEventListener("dragover", (event) => {
    if (takesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = "none";
  });
  addEventListener("drop", (event) => {
    if (!takesFiles(event)) event.preventDefault();
  });

  addEventListener("keydown", (event) => {
    const primary = isMac ? event.metaKey : event.ctrlKey;
    if (event.key === "F5") {
      event.preventDefault();
      present(event.shiftKey ? 0 : previewSlide);
    } else if (event.ctrlKey && !event.altKey && !event.metaKey && event.code === "Backquote") {
      event.preventDefault();
      toggleTerminal();
    } else if (primary && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "j") {
      event.preventDefault();
      togglePanel();
    } else if (primary && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "b") {
      event.preventDefault();
      toggleRail();
    } else if (primary && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "e") {
      event.preventDefault();
      toggleEditor();
    } else if (primary && !event.altKey && !event.defaultPrevented && !typesText(event.target)
      && (event.key.toLowerCase() === "z" || (event.key.toLowerCase() === "y" && !event.shiftKey))) {
      // Outside a text field, as with the code folded away, the keys still undo the slides.
      event.preventDefault();
      if (event.key.toLowerCase() === "z" && !event.shiftKey) undo(view);
      else redo(view);
    } else if (primary && event.altKey && !event.shiftKey && event.code === "KeyI" && session.assistant) {
      // By the key's place, since Alt changes the letter it types on some layouts and on macOS.
      event.preventDefault();
      toggleAssistant();
    } else if (primary && !event.altKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save({ auto: false });
    } else if (primary && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "o") {
      event.preventDefault();
      void presentations.open();
    } else if (primary && (event.key === "PageDown" || event.key === "PageUp")) {
      event.preventDefault();
      stepSlide(event.key === "PageDown" ? 1 : -1);
    }
  });

  /** The editor's menu, as a code editor has one: names, the clipboard, and the text. */
  function editorEntries(): MenuEntry[] {
    const { state } = view;
    const text = state.doc.toString();
    const head = state.selection.main.head;
    const locked = state.readOnly;
    const named = Boolean(nameDefinition(text, head));
    const renamable = !("error" in prepareNameRename(text, head));
    return [
      { command: "go-to-definition", label: t.menu.goToDefinition, icon: "definition", shortcut: "F12", disabled: () => !named, run: inEditor(goToNameDefinition) },
      { command: "rename-name", label: t.menu.renameName, icon: "rename", shortcut: "F2", disabled: () => !renamable || locked, run: inEditor(renameNameAtCursor) },
      "separator",
      // With nothing selected, the editor cuts and copies the whole line, as it does with the keys.
      { command: "cut", label: t.editor.cut, icon: "cut", shortcut: `${mod}+X`, disabled: () => locked, run: () => editorClipboard("cut") },
      { command: "copy", label: t.editor.copy, icon: "copy", shortcut: `${mod}+C`, run: () => editorClipboard("copy") },
      { command: "paste", label: t.editor.paste, icon: "paste", shortcut: `${mod}+V`, disabled: () => locked, run: () => void pasteIntoEditor() },
      "separator",
      { command: "toggle-comment", label: t.editor.toggleComment, icon: "comment", shortcut: `${mod}+/`, disabled: () => locked, run: inEditor(toggleComment) },
      { command: "select-all", label: t.menu.selectAll, icon: "selectAll", shortcut: `${mod}+A`, run: inEditor(selectAll) },
      { command: "find", label: t.menu.find, icon: "find", shortcut: `${mod}+F`, run: inEditor(openSearchPanel) },
    ];
  }

  /** Cut or copy through the editor's own handling of the clipboard, as the keys do. */
  function editorClipboard(command: "cut" | "copy"): void {
    view.focus();
    document.execCommand(command);
  }

  /** Paste the clipboard's text, which a page may only read when the browser allows it. */
  async function pasteIntoEditor(): Promise<void> {
    view.focus();
    try {
      const text = await navigator.clipboard.readText();
      view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true, userEvent: "input.paste" });
    } catch {
      toast(t.editor.pasteBlocked(mod), { tone: "info", key: "paste-blocked" });
    }
  }

  // A right-click in the code outside the selection moves the cursor there first, so the menu's
  // commands act where it landed. The search panel's fields keep the browser's menu.
  view.dom.addEventListener("contextmenu", (event) => {
    if (event.shiftKey || !(event.target instanceof Node)) return;
    if (typesText(event.target) && !view.contentDOM.contains(event.target)) return;
    event.preventDefault();
    const keyboard = event.button !== 2 && !event.ctrlKey;
    if (!keyboard) {
      const at = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const inside = at !== null && view.state.selection.ranges.some((range) => range.from <= at && at <= range.to);
      if (at !== null && !inside) view.dispatch({ selection: EditorSelection.cursor(at) });
    }
    view.focus();
    const corner = keyboard ? view.coordsAtPos(view.state.selection.main.head) : null;
    showContextMenu(corner?.left ?? event.clientX, corner?.bottom ?? event.clientY, editorEntries(), {
      label: t.editor.label,
      keyboard,
    });
  });

  // Elsewhere a right-click opens no menu: the browser's own, with Back and Reload, would only
  // take the Studio away. Fields that take text, the terminal, links, and selected text keep it,
  // and Shift keeps it anywhere.
  addEventListener("contextmenu", (event) => {
    if (event.defaultPrevented || event.shiftKey || typesText(event.target)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-owns-keys], a[href]")) return;
    const selected = getSelection();
    if (target && selected && !selected.isCollapsed && selected.containsNode(target, true)) return;
    event.preventDefault();
  });

  // ── The assistant ───────────────────────────────────────────────────────────────────────
  const assistantWorking = slot("assistant-working");
  required<HTMLElement>(root, "[data-action='toggle-assistant']").hidden = !session.assistant;

  /** Where the person is: the slide in the preview, the lines they selected, and what is wrong. */
  function assistantContext(): AssistantContext {
    const context: AssistantContext = { summary: "" };
    const parts: string[] = [];
    if (renderedCount > 0) {
      // Line numbers when the source writes the slides one by one, as they render.
      const written = report && report.slides.length === renderedCount ? report.slides[previewSlide] : undefined;
      context.slide = {
        index: previewSlide + 1,
        label: previewLabel || written?.label || undefined,
        lines: written ? [written.source.line, written.source.endLine] : undefined,
      };
      parts.push(t.assistant.summary.slide(context.slide.index, context.slide.label));
    }
    const selection = view.state.selection.main;
    if (!selection.empty) {
      const from = view.state.doc.lineAt(selection.from).number;
      const to = view.state.doc.lineAt(selection.to).number;
      context.selection = { from, to, text: view.state.sliceDoc(selection.from, selection.to).slice(0, 4000) };
      parts.push(t.assistant.summary.selection(to - from + 1));
    }
    const found = (["build", "runtime", "typescript", "names", "formulas", "layout"] as const)
      .flatMap((source) => problems.get(source))
      .filter((problem) => problem.severity !== "info");
    if (found.length > 0) {
      context.problems = found.slice(0, 20).map((problem) => `${problem.line ? `line ${problem.line}: ` : ""}${problem.message}`);
      parts.push(t.assistant.summary.problems(found.length));
    }
    context.summary = parts.length > 0 ? parts.join(" · ") : t.assistant.summary.nothing;
    return context;
  }

  function toggleAssistant(force?: boolean): void {
    if (!session.assistant) return;
    const open = force ?? !root.classList.contains("is-assistant-open");
    root.classList.toggle("is-assistant-open", open);
    storePreference("assistant-open", open);
    if (!open) return;
    assistant ??= new AssistantPanel(slot("assistant"), {
      context: assistantContext,
      beforeSend: async () => {
        if (saveState === "conflict") {
          toast(t.assistant.resolveFirst, { tone: "warning" });
          return false;
        }
        if (!await flushSave()) return false;
        // Changes are reviewed against the text before the first request since the last review.
        if (reviewBase === undefined) {
          reviewBase = editorText();
          storeReviewBase();
        }
        return true;
      },
      // The file is the agent's while it works: typing waits, its edits arrive as reloads, and
      // the review waits until it has finished.
      onBusy: (busy) => {
        assistantBusy = busy;
        setEditorLocked(view, busy);
        notes.lock(busy);
        assistantWorking.hidden = !busy;
        if (busy) pauseReview();
        else showReview(true);
      },
      review: (keep) => settleReview(keep),
      onClose: () => toggleAssistant(false),
    });
    void assistant.show();
  }
  if (readPreference("assistant-open", false)) toggleAssistant(true);

  // ── Reviewing the assistant's changes ───────────────────────────────────────────────────
  const reviewKey = `frameseq-studio-review:${session.entry}`;
  const reviewBar = slot("review");
  function storeReviewBase(): void {
    try {
      if (reviewBase === undefined) sessionStorage.removeItem(reviewKey);
      else sessionStorage.setItem(reviewKey, reviewBase);
    } catch {
      // A reload then forgets what to compare with, and the changes simply stay.
    }
  }

  /**
   * Show the changes since the review began, each to accept or reject, once the agent is done.
   * Just after it finishes, its last edit may still be on its way from the disk, so an unchanged
   * text is looked at once more before the review is given up.
   */
  function showReview(settling = false): void {
    if (reviewBase === undefined || assistantBusy) return;
    if (editorText() === reviewBase) {
      if (settling) setTimeout(() => showReview(), 1500);
      else finishReview();
      return;
    }
    if (reviewing) {
      refreshReview();
      return;
    }
    startReview(view, reviewBase, { accept: t.review.accept, reject: t.review.reject });
    reviewing = true;
    refreshReview();
  }

  // Each sets \`reviewing\` before the view changes, since the change is itself an update.
  function pauseReview(): void {
    const shown = reviewing;
    reviewing = false;
    if (shown) endReview(view);
    reviewBar.hidden = true;
    assistant?.setReview(undefined);
  }

  /** Count what is left to review; with nothing left, the review is over. */
  function refreshReview(): void {
    const count = reviewChanges(view);
    if (count === undefined) return;
    if (count === 0) {
      finishReview();
      return;
    }
    reviewBar.hidden = false;
    slot("review-count").textContent = t.review.changes(count);
    assistant?.setReview(count);
  }

  function finishReview(): void {
    const shown = reviewing;
    reviewing = false;
    if (shown) endReview(view);
    reviewBase = undefined;
    storeReviewBase();
    reviewBar.hidden = true;
    assistant?.setReview(undefined);
  }

  /** Keep every change, or put the text back as it was, as one step `Ctrl+Z` can take back. */
  function settleReview(keep: boolean): void {
    if (reviewBase === undefined) return;
    const base = reviewBase;
    finishReview();
    if (!keep && editorText() !== base) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: base } });
    view.focus();
  }

  // A review left open before a reload goes on where it was.
  try {
    reviewBase = sessionStorage.getItem(reviewKey) ?? undefined;
  } catch {
    reviewBase = undefined;
  }
  showReview();

  // ── The development server ──────────────────────────────────────────────────────────────
  function writeStash(): void {
    if (leaving) return;
    try {
      sessionStorage.setItem(stashKey, JSON.stringify({
        entry: session.entry,
        base: baseVersion,
        text: editorText(),
        anchor: view.state.selection.main.anchor,
        head: view.state.selection.main.head,
        slide: previewSlide,
      }));
    } catch {
      // Only a convenience across reloads.
    }
  }

  addEventListener("beforeunload", (event) => {
    writeStash();
    if (isDirty() && !leaving) event.preventDefault();
  });

  if (import.meta.hot) {
    import.meta.hot.on("frameseq:studio-source", (payload: { version?: string; missing?: boolean }) => {
      void onDiskChange(payload);
    });
    import.meta.hot.on("vite:error", onBuildError);
    import.meta.hot.on("vite:beforeFullReload", writeStash);
    import.meta.hot.on("vite:ws:disconnect", () => {
      setSaveState("offline", t.save.offlineDetail);
      slot("status-connection").textContent = t.shell.disconnected;
      slot("status-connection").dataset.tone = "error";
    });
    import.meta.hot.on("vite:ws:connect", () => {
      slot("status-connection").textContent = "";
      if (saveState === "offline") setSaveState(isDirty() ? "dirty" : "saved");
    });
  }

  slot("status-format").textContent = `${format.crlf ? "CRLF" : "LF"}${format.bom ? " · BOM" : ""}`;
  setSaveState(isDirty() ? "dirty" : "saved");
  if (isDirty()) scheduleSave();
  showCursor();
  await inspect();
  view.focus();

  // For tests and automation: the editor only draws the lines in view, so its text is read here.
  Object.defineProperty(window, "frameseqStudio", {
    configurable: true,
    value: {
      view,
      get text() { return editorText(); },
      get saved() { return !isDirty(); },
      terminal,
      /** How the rendered slides line up with the text, or why they do not yet. */
      get slides() {
        const map = slideMap();
        return {
          outline: outline?.map((slide) => slide.statement ?? null) ?? null,
          outlineCurrent: Boolean(report && reportText === editorText()),
          statements: report?.statements.length ?? null,
          groups: map?.groups.map((group) => group.slides) ?? null,
        };
      },
    },
  });
}

interface Stash {
  entry: string;
  base: string;
  text: string;
  anchor: number;
  head: number;
  slide: number;
}

/**
 * What the editor held before the page last reloaded, if it still applies to the same file. Two
 * new presentations start with the same text, so the document is matched as well as its text.
 */
function readStash(entry: string, version: string): Stash | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(stashKey) ?? "null") as Partial<Stash> | null;
    sessionStorage.removeItem(stashKey);
    if (!value || value.entry !== entry || value.base !== version || typeof value.text !== "string") return undefined;
    return {
      entry: value.entry,
      base: value.base,
      text: value.text,
      anchor: Number(value.anchor) || 0,
      head: Number(value.head) || 0,
      slide: Number(value.slide) || 0,
    };
  } catch {
    return undefined;
  }
}

void start();
