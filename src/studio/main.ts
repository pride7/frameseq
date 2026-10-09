import "./studio.css";
import { redo, undo } from "@codemirror/commands";
import { ChangeSet, EditorSelection, Text, type ChangeSpec, type TransactionSpec } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { collectLayoutIssues } from "../../scripts/layout-rules.mjs";
import {
  call,
  downloadUrl,
  openSession,
  StudioRequestError,
  type ExportFormat,
  type ExportResult,
  type InspectReport,
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
import { createEditor, setEditorDarkness, showPreviewSlide, showSlideMarks, type SlideMark } from "./editor";
import { buildSlideMap, slideAt, type RenderedSlide, type SlideMap } from "./outline";
import { StudioFrames, type SourceTarget } from "./frames";
import { ProblemsPanel, type Problem } from "./problems";
import { bindRegion, deleteSlide, duplicateSlide, insertSlide, moveSlide, planBinding } from "./slides";
import {
  askText,
  element,
  formatDuration,
  readPreference,
  required,
  showMenu,
  splitter,
  storePreference,
  toast,
  type MenuItem,
} from "./ui";

type SaveState = "saved" | "dirty" | "saving" | "blocked" | "conflict" | "error" | "offline";
type ThemeChoice = "system" | "light" | "dark";

const themeKey = "frameseq-studio-theme";
const themeLabels: Record<ThemeChoice, { glyph: string; title: string }> = {
  system: { glyph: "◐", title: "Theme: follow the system (click for light)" },
  light: { glyph: "☀", title: "Theme: light (click for dark)" },
  dark: { glyph: "☾", title: "Theme: dark (click to follow the system)" },
};

/** The palette chosen in this browser; the page applies it before anything is drawn. */
function readThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(themeKey);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

const stashKey = "frameseq-studio-stash";
const autosaveDelay = 450;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";

const logo = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#020617"/><path d="M15 15h35v9H25v8h21v9H25v17H15V15Z" fill="#22d3ee"/></svg>`;

const shell = `
  <header class="studio-topbar">
    <div class="studio-brand">${logo}<span>FrameSeq <b>Studio</b></span></div>
    <div class="studio-file">
      <span class="studio-file-name" data-slot="file"></span>
      <span class="studio-save-state" data-slot="save-state" data-state="saved"><i></i><span>Saved</span></span>
    </div>
    <div class="studio-actions">
      <button type="button" class="studio-icon-button studio-theme-button" data-action="theme"></button>
      <label class="studio-switch" title="Save as you type, so the preview follows every change">
        <input type="checkbox" data-control="autosave"><span class="studio-switch-track" aria-hidden="true"></span><span>Auto-save</span>
      </label>
      <button type="button" class="studio-button" data-action="export" aria-haspopup="menu">Export<span class="studio-caret" aria-hidden="true"></span></button>
      <button type="button" class="studio-button is-primary" data-action="present" title="Present from the current slide (F5)"><span aria-hidden="true">▶</span> Present</button>
    </div>
  </header>
  <div class="studio-banner" data-slot="banner" hidden>
    <span data-slot="banner-text"></span>
    <span class="studio-banner-actions" data-slot="banner-actions"></span>
  </div>
  <main class="studio-workspace">
    <section class="studio-rail" aria-label="Slides">
      <header class="studio-pane-header">
        <span class="studio-pane-title">Slides</span>
        <span class="studio-pane-meta" data-slot="slide-count"></span>
        <span class="studio-pane-spacer"></span>
        <button type="button" class="studio-icon-button" data-action="new-slide" title="New slide after the current one">+</button>
      </header>
      <div class="studio-rail-body" data-slot="rail"></div>
    </section>
    <div class="studio-splitter" data-splitter="rail"></div>
    <section class="studio-editor-pane" aria-label="Editor">
      <header class="studio-pane-header">
        <span class="studio-pane-title" data-slot="editor-title"></span>
        <span class="studio-breadcrumb" data-slot="breadcrumb"></span>
      </header>
      <div class="studio-editor" data-slot="editor"></div>
    </section>
    <div class="studio-splitter" data-splitter="preview"></div>
    <section class="studio-preview-pane" aria-label="Preview">
      <header class="studio-pane-header">
        <span class="studio-pane-title">Preview</span>
        <span class="studio-pane-meta" data-slot="preview-slide"></span>
        <span class="studio-pane-spacer"></span>
        <label class="studio-toggle" title="Show the slide that holds the cursor"><input type="checkbox" data-control="follow"><span>Follow cursor</span></label>
        <button type="button" class="studio-icon-button" data-action="open-browser" title="Open the preview in a browser tab">↗</button>
      </header>
      <div class="studio-preview-body" data-slot="preview"></div>
    </section>
  </main>
  <div class="studio-splitter is-horizontal" data-splitter="panel"></div>
  <section class="studio-panel" aria-label="Problems and output">
    <header class="studio-panel-tabs" role="tablist">
      <button type="button" role="tab" data-tab="problems" aria-selected="true">Problems<span class="studio-badge" data-slot="problem-badge">0</span></button>
      <button type="button" role="tab" data-tab="output" aria-selected="false">Output</button>
      <span class="studio-pane-spacer"></span>
      <span class="studio-check-state" data-slot="check-state"></span>
      <button type="button" class="studio-icon-button" data-action="toggle-panel" title="Hide or show the panel (${mod}+J)">⌄</button>
    </header>
    <div class="studio-panel-body">
      <div class="studio-problems" data-panel="problems"></div>
      <pre class="studio-output" data-panel="output" hidden></pre>
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
  let session: StudioSession;
  let source: SourceResponse;
  try {
    session = await openSession();
    source = await call<SourceResponse>("GET", "source");
  } catch (error) {
    // A plain `frameseq dev` server serves this page but not the Studio behind it.
    const notStudio = error instanceof StudioRequestError && error.status === 404;
    showFatal(
      notStudio ? "This server is a preview, not the Studio" : "FrameSeq Studio could not start",
      notStudio
        ? "It was started with frameseq dev, which never lets a page rewrite the slide document. Stop it and start the Studio instead:"
        : `${error instanceof Error ? error.message : String(error)} Start the Studio with:`,
    );
    return;
  }
  root.className = "studio";
  root.innerHTML = shell;
  document.title = `${session.name} · FrameSeq Studio`;
  slot("file").textContent = session.file;
  slot("file").title = session.entry;
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
  let previewSlide = 0;
  let previewLabel = "";
  let exporting = false;

  // ── Theme ───────────────────────────────────────────────────────────────────────────────
  let themeChoice = readThemeChoice();
  const systemLight = matchMedia("(prefers-color-scheme: light)");
  const resolvedTheme = (): "light" | "dark" => (
    themeChoice === "system" ? (systemLight.matches ? "light" : "dark") : themeChoice
  );

  const stash = readStash(session.version);
  const initialText = stash?.text ?? syncedText;

  // ── Editor ──────────────────────────────────────────────────────────────────────────────
  const view: EditorView = createEditor(slot("editor"), {
    doc: initialText,
    onUpdate: handleUpdate,
    onSave: () => void save({ auto: false }),
    onDiagnostics: handleDiagnostics,
    onSlideMarker: (index) => goToSlide(index, { focusEditor: false }),
    dark: resolvedTheme() === "dark",
  });
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
  const frames = new StudioFrames(
    { preview: slot("preview"), rail: slot("rail"), check: slot("check") },
    {
      previewRendered: () => {
        problems.set("build", []);
        problems.set("runtime", []);
      },
      previewFailed: (message) => {
        problems.set("runtime", [{
          source: "runtime",
          severity: "error",
          message,
          detail: "The preview still shows the last version that ran. Fix the error and save to update it.",
        }]);
      },
      slide: (index, count, label) => {
        previewSlide = index;
        previewLabel = label;
        renderedCount = count;
        showPreviewPosition();
        frames.markThumbnail(index);
        showPreviewSlide(view, index);
      },
      reveal: (target) => {
        const range = editorRange(target);
        if (!range) return;
        view.dispatch({ selection: EditorSelection.cursor(range.from), scrollIntoView: true });
        view.focus();
      },
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
      command: (command) => {
        if (command === "save") void save({ auto: false });
        if (command === "undo") undo(view);
        if (command === "redo") redo(view);
      },
      railRendered: () => frames.markThumbnail(previewSlide),
      outline: (slides) => {
        outline = slides;
        renderedCount = slides.length;
        showMarks();
        showCursor();
        showPreviewPosition();
      },
      thumbnail: (index) => goToSlide(index, { focusEditor: false }),
      thumbnailMove: (from, to) => void rearrange("move", from, to),
      thumbnailMenu: (index, x, y) => showSlideMenu(index, x, y),
      thumbnailDelete: (index) => void rearrange("delete", index),
      checkRendered: (frame) => scheduleLayoutCheck(frame),
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
    const button = required<HTMLButtonElement>(root, "[data-action='theme']");
    button.textContent = themeLabels[themeChoice].glyph;
    button.title = themeLabels[themeChoice].title;
    button.setAttribute("aria-label", themeLabels[themeChoice].title);
  }
  applyTheme();
  systemLight.addEventListener("change", () => {
    if (themeChoice === "system") applyTheme();
  });

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
      saved: "Saved",
      dirty: autosave ? "Editing…" : "Unsaved",
      saving: "Saving…",
      blocked: "Not saved: syntax error",
      conflict: "Changed on disk",
      error: "Save failed",
      offline: "Server offline",
    };
    const pill = slot("save-state");
    pill.dataset.state = state;
    required<HTMLElement>(pill, "span").textContent = labels[state];
    pill.title = detail ?? (state === "blocked"
      ? "Auto-save waits until the document parses, so the preview never runs broken code. Press Ctrl+S to save anyway."
      : labels[state]);
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
      showBanner(`${session.name} was removed or renamed on disk.`, []);
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
    toast(`${session.name} changed on disk and was reloaded.`, { tone: "info", timeout: 2600, key: "disk-reload" });
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
  }

  function showConflict(): void {
    showBanner(`${session.name} changed on disk while you had unsaved edits.`, [
      {
        label: "Use the file on disk",
        run: async () => {
          const latest = await call<SourceResponse>("GET", "source");
          replaceFromDisk(latest);
        },
      },
      {
        label: "Keep my version",
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
      marks = report.slides.map((slide) => ({
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
    const slide = report.slides.find((candidate) => line >= candidate.source.line && line <= candidate.source.endLine);
    return slide ? slide.index - 1 : undefined;
  }

  /** The innermost object written at an editor position. */
  function objectAt(position: number) {
    return (report?.slides ?? [])
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
      const slide = report.slides[index];
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

  // ── Editor updates ──────────────────────────────────────────────────────────────────────
  function handleUpdate(update: ViewUpdate): void {
    if (update.docChanged) {
      for (const transaction of update.transactions) {
        if (!transaction.docChanged) continue;
        sinceSync = sinceSync.compose(transaction.changes);
        if (sinceSaveStart) sinceSaveStart = sinceSaveStart.compose(transaction.changes);
      }
      if (saveState !== "conflict") setSaveState(isDirty() ? "dirty" : "saved");
      if (isDirty()) scheduleSave();
      scheduleInspect();
    }
    if (update.selectionSet || update.docChanged) {
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
    slot("status-cursor").textContent = `Ln ${line.number}, Col ${selection.head - line.from + 1}${selected ? ` (${selected} selected)` : ""}`;
    const index = slideIndexAt(selection.head, previewSlide);
    const crumb = slot("breadcrumb");
    if (index === undefined) {
      crumb.textContent = "";
      return;
    }
    const label = outline?.[index]?.label ?? report?.slides[index]?.label ?? "";
    const object = objectAt(selection.head);
    crumb.textContent = `Slide ${index + 1}${label ? ` · ${label}` : ""}${object ? ` › ${object.type}` : ""}`;
  }

  function showPreviewPosition(): void {
    const text = renderedCount > 0 ? `${previewSlide + 1} / ${renderedCount}${previewLabel ? ` · ${previewLabel}` : ""}` : "";
    slot("preview-slide").textContent = text;
    slot("status-slide").textContent = renderedCount > 0 ? `Slide ${previewSlide + 1} of ${renderedCount}` : "";
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
    status.title = `${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`;
  }

  function selectProblem(problem: Problem): void {
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
    state.textContent = "Checking layout…";
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
      state.textContent = `Layout checked · ${result.slides} slide${result.slides === 1 ? "" : "s"}`;
    } catch (error) {
      state.textContent = "Layout check failed";
      appendOutput(`Layout check failed: ${error instanceof Error ? error.message : String(error)}\n`);
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
    showPanel("problems");
  }

  // ── Slides: insert, duplicate, delete, move ─────────────────────────────────────────────
  /**
   * Rearrange slides by rewriting the lines that make them. A loop or a helper call makes
   * several slides from one statement, and those can only be moved, repeated, or removed
   * together; the Studio says so whenever an action touches more than the slide it was asked
   * about. `to` is a position among the rendered slides, before which a moved slide lands.
   */
  async function rearrange(action: "insert" | "duplicate" | "delete" | "move", index: number, to = 0): Promise<void> {
    const map = await settledSlideMap();
    if (!map) {
      toast("The slide rail is still catching up with the editor. Try again in a moment.", { tone: "warning" });
      return;
    }
    const doc = view.state.doc;
    const groupIndex = map.groupOf[index];
    const group = groupIndex === undefined ? undefined : map.groups[groupIndex];
    if (!group && action !== "insert") {
      toast(`Slide ${index + 1} is not made by a statement in ${session.name}, so it cannot be changed from the rail.`, { tone: "warning" });
      return;
    }
    const size = group?.slides.length ?? 0;
    const first = group?.slides[0] ?? 0;
    const last = group?.slides[size - 1] ?? -1;
    const together = group && size > 1
      ? `the ${size} slides made by line ${doc.lineAt(group.anchor).number}`
      : `slide ${index + 1}`;
    let spec: TransactionSpec | undefined;
    let landing = index;
    if (action === "insert") {
      spec = insertSlide(doc, map.groups, groupIndex ?? -1);
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
        toast("A slide can only be moved next to slides made by this document.", { tone: "warning" });
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
      toast(`Deleted ${together}.`, {
        tone: "info",
        actions: [{ label: "Undo", run: () => { undo(view); } }],
      });
    } else if (size > 1 && action !== "insert") {
      toast(`${action === "move" ? "Moved" : "Duplicated"} ${together}, which move as one.`, { tone: "info" });
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
    const plan = planBinding(view.state.doc, current.slides, starts);
    if (typeof plan === "string") {
      toast(plan, { tone: "warning" });
      return;
    }
    const path = await askText({
      title: "Bind to a named region",
      message: "The selected objects will move together when this region is positioned or anchored.",
      value: plan.suggestion,
      confirm: "Bind",
      validate: (value) => {
        if (!/^[A-Za-z_][A-Za-z0-9_-]*(?:\/[A-Za-z_][A-Za-z0-9_-]*)*$/.test(value)) {
          return "Use path segments of letters, digits, _ or -, each starting with a letter.";
        }
        return plan.taken.has(value) ? `The region “${value}” already exists on this slide.` : undefined;
      },
    });
    if (!path || editorText() !== reportText) return;
    suppressFollow = true;
    view.dispatch(bindRegion(view.state.doc, plan, path));
    view.focus();
    await save({ auto: false });
  }

  function showSlideMenu(index: number, x: number, y: number): void {
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
        note: `Made by line ${view.state.doc.lineAt(group.anchor).number} with ${others} other slide${others === 1 ? "" : "s"}; these act on all of them.`,
      });
    } else if (map && !group) {
      items.push({ note: `Made outside ${session.name}, so it can only be shown here.` });
    }
    items.push(
      { label: "New slide after", run: () => void rearrange("insert", index) },
      { label: "Duplicate", disabled: !movable, run: () => void rearrange("duplicate", index) },
      "separator",
      { label: "Move up", disabled: upTo === undefined, run: () => void rearrange("move", index, upTo ?? 0) },
      { label: "Move down", disabled: downTo === undefined, run: () => void rearrange("move", index, downTo ?? 0) },
      "separator",
      { label: "Go to source", run: () => goToSlide(index, { focusEditor: true }) },
      { label: "Present from here", shortcut: "F5", run: () => present(index) },
      "separator",
      { label: "Delete", shortcut: "Del", danger: true, disabled: !movable, run: () => void rearrange("delete", index) },
    );
    showMenu(x, y, items, `Slide ${index + 1}`);
  }

  // ── Exports and presenting ──────────────────────────────────────────────────────────────
  const exportFormats: Array<{ format: ExportFormat; label: string; hint: string }> = [
    { format: "pdf", label: "PDF", hint: "output/pdf" },
    { format: "pptx", label: "PowerPoint, editable", hint: "output/pptx" },
    { format: "pptx-flat", label: "PowerPoint, one image per slide", hint: "output/pptx" },
    { format: "html-single", label: "Single HTML file", hint: "dist/index.html" },
    { format: "html", label: "HTML site", hint: "dist/" },
    { format: "typst", label: "Typst source", hint: "output/typst" },
  ];

  function showExportMenu(): void {
    const button = required<HTMLButtonElement>(root, "[data-action='export']");
    const box = button.getBoundingClientRect();
    showMenu(box.left, box.bottom + 6, exportFormats.map((item) => ({
      label: item.label,
      shortcut: item.hint,
      disabled: exporting,
      run: () => void exportDeck(item.format, item.label),
    })), "Export");
  }

  async function exportDeck(format: ExportFormat, label: string): Promise<void> {
    if (exporting) return;
    exporting = true;
    const button = required<HTMLButtonElement>(root, "[data-action='export']");
    button.disabled = true;
    const progress = toast(`Exporting ${label}…`, { tone: "busy" });
    try {
      if (!await flushSave()) {
        progress.update("Save the document before exporting it.", { tone: "warning" });
        return;
      }
      appendOutput(`\n▶ Export ${label}\n`);
      const result = await call<ExportResult>("POST", "export", { format });
      appendOutput(result.log.endsWith("\n") ? result.log : `${result.log}\n`);
      if (result.ok && result.job) {
        const job = result.job;
        progress.update(`${result.label} saved to ${result.display} in ${formatDuration(result.duration)}.`, {
          tone: "success",
          timeout: 15000,
          actions: [
            ...(result.directory ? [] : [{ label: "Download", run: () => download(job) }]),
            { label: "Show in folder", run: () => void call("POST", "reveal", { job }) },
          ],
        });
      } else {
        progress.update(`${result.label} export failed.`, {
          tone: "error",
          actions: [{ label: "Show output", run: () => showPanel("output") }],
        });
      }
    } catch (error) {
      progress.update(`Export failed: ${error instanceof Error ? error.message : String(error)}`, { tone: "error" });
    } finally {
      exporting = false;
      button.disabled = false;
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

  function present(index = previewSlide): void {
    void flushSave();
    window.open(`/?presenter=1#${index + 1}`, "frameseq-presenter");
  }

  // ── Panel, output, and layout ───────────────────────────────────────────────────────────
  function showPanel(tab: "problems" | "output"): void {
    root.classList.remove("is-panel-collapsed");
    root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.tab === tab));
    });
    root.querySelectorAll<HTMLElement>("[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab;
    });
  }

  function togglePanel(): void {
    root.classList.toggle("is-panel-collapsed");
    storePreference("panel-collapsed", root.classList.contains("is-panel-collapsed"));
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
    fallback: 210,
    minimum: 150,
    maximum: () => Math.max(160, workspace.clientWidth * 0.3),
  });
  splitter(required(root, "[data-splitter='preview']"), {
    host: root,
    variable: "--studio-preview-width",
    axis: "x",
    fallback: Math.round(Math.max(420, innerWidth * 0.42)),
    minimum: 280,
    maximum: () => Math.max(300, workspace.clientWidth - 420),
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
  if (readPreference("panel-collapsed", false)) root.classList.add("is-panel-collapsed");
  if (readPreference("rail-collapsed", false)) root.classList.add("is-rail-collapsed");

  // ── Controls ────────────────────────────────────────────────────────────────────────────
  const autosaveControl = required<HTMLInputElement>(root, "[data-control='autosave']");
  autosaveControl.checked = autosave;
  autosaveControl.addEventListener("change", () => {
    autosave = autosaveControl.checked;
    storePreference("autosave", autosave);
    if (autosave && isDirty()) scheduleSave();
    setSaveState(isDirty() ? "dirty" : saveState === "dirty" ? "saved" : saveState);
  });
  const followControl = required<HTMLInputElement>(root, "[data-control='follow']");
  followControl.checked = follow;
  followControl.addEventListener("change", () => {
    follow = followControl.checked;
    storePreference("follow", follow);
    if (follow) followCursor();
  });

  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-action], [data-tab]") : null;
    if (!target) return;
    if (target.dataset.tab === "problems" || target.dataset.tab === "output") showPanel(target.dataset.tab);
    switch (target.dataset.action) {
      case "export":
        showExportMenu();
        break;
      case "present":
        present();
        break;
      case "theme":
        themeChoice = themeChoice === "system" ? "light" : (themeChoice === "light" ? "dark" : "system");
        try {
          localStorage.setItem(themeKey, themeChoice);
        } catch {
          // The choice simply lasts until the page closes.
        }
        applyTheme();
        break;
      case "new-slide":
        void rearrange("insert", previewSlide);
        break;
      case "open-browser":
        window.open(`/#${previewSlide + 1}`, "_blank");
        break;
      case "toggle-panel":
        togglePanel();
        break;
      case "show-problems":
        showPanel("problems");
        break;
      default:
        break;
    }
  });

  addEventListener("keydown", (event) => {
    const primary = isMac ? event.metaKey : event.ctrlKey;
    if (event.key === "F5") {
      event.preventDefault();
      present();
    } else if (primary && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "j") {
      event.preventDefault();
      togglePanel();
    } else if (primary && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "b") {
      event.preventDefault();
      root.classList.toggle("is-rail-collapsed");
      storePreference("rail-collapsed", root.classList.contains("is-rail-collapsed"));
    } else if (primary && !event.altKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save({ auto: false });
    } else if (primary && (event.key === "PageDown" || event.key === "PageUp")) {
      event.preventDefault();
      const count = renderedCount || (report?.slides.length ?? 0);
      const next = Math.min(Math.max(previewSlide + (event.key === "PageDown" ? 1 : -1), 0), Math.max(count - 1, 0));
      goToSlide(next, { focusEditor: true });
    }
  });

  // ── The development server ──────────────────────────────────────────────────────────────
  function writeStash(): void {
    try {
      sessionStorage.setItem(stashKey, JSON.stringify({
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
    if (isDirty()) event.preventDefault();
  });

  if (import.meta.hot) {
    import.meta.hot.on("frameseq:studio-source", (payload: { version?: string; missing?: boolean }) => {
      void onDiskChange(payload);
    });
    import.meta.hot.on("vite:error", onBuildError);
    import.meta.hot.on("vite:beforeFullReload", writeStash);
    import.meta.hot.on("vite:ws:disconnect", () => {
      setSaveState("offline", "The FrameSeq server stopped. Start it again with frameseq studio; your edits are kept.");
      slot("status-connection").textContent = "● Disconnected";
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
  base: string;
  text: string;
  anchor: number;
  head: number;
  slide: number;
}

/** What the editor held before the page last reloaded, if it still applies to the same file. */
function readStash(version: string): Stash | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(stashKey) ?? "null") as Partial<Stash> | null;
    sessionStorage.removeItem(stashKey);
    if (!value || value.base !== version || typeof value.text !== "string") return undefined;
    return {
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
