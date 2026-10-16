/** Where a preview object came from, as the preview reports it: file offsets and a line. */
export interface SourceTarget {
  line: number;
  column: number;
  start: number;
  end: number;
}

import { language, t } from "./i18n";
import type { RenderedSlide } from "./outline";
import type { TextPart } from "./typing";

function readPart(value: unknown): TextPart {
  if (!value || typeof value !== "object") return {};
  const { argument, item, cell, label } = value as Record<string, unknown>;
  return {
    ...(Number.isInteger(argument) ? { argument: argument as number } : {}),
    ...(Number.isInteger(item) ? { item: item as number } : {}),
    ...(Array.isArray(cell) && cell.length === 2 && cell.every(Number.isInteger) ? { cell: [cell[0], cell[1]] as [number, number] } : {}),
    ...(label === true ? { label: true } : {}),
  };
}

/** One reason the slide document could not run, with the offsets of the code that caused it. */
export interface PreviewFailure {
  message: string;
  start?: number;
  end?: number;
}

function readFailures(value: unknown): PreviewFailure[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): PreviewFailure[] => {
    if (!item || typeof item !== "object") return [];
    const { message, start, end } = item as Record<string, unknown>;
    const located = Number.isInteger(start) && Number.isInteger(end);
    return [{
      message: typeof message === "string" ? message : "",
      ...(located ? { start: start as number, end: end as number } : {}),
    }];
  });
}

/** An object selected in the preview, as the preview describes it. */
export interface PreviewObject {
  target: SourceTarget;
  /** The whole lines that write it, comments above included, when it is a statement of its own. */
  statement?: { start: number; end: number; text: string };
}

/** The objects selected in the preview, and what can be done with them there. */
export interface PreviewSelection {
  slideIndex: number;
  /** Layout editing is on. */
  editing: boolean;
  /** The layout is locked: objects can be selected and typed into, not moved. */
  locked: boolean;
  objects: PreviewObject[];
  arrange: { x: boolean; y: boolean; distributeX: boolean; distributeY: boolean };
  /** For one object written on its own: whether it is drawn by coordinates, and can go further back or forward. */
  stacking?: { layered: boolean; backward: boolean; forward: boolean };
  /** One of the presentation's details selected alone, such as a cover's "title". */
  detail?: string;
  /** The cell of a table a menu was opened on, by row and column. */
  cell?: [number, number];
}

/** What the preview can do to its selection, when the Studio's menu asks. */
export type SelectionAction =
  | "delete"
  | "bring-to-front" | "bring-forward" | "send-backward" | "send-to-back"
  | "align-left" | "align-center" | "align-right" | "align-top" | "align-middle" | "align-bottom"
  | "distribute-horizontal" | "distribute-vertical";

/** What a key pressed on the preview's objects asks of the Studio. */
export type ObjectCommand = "copy" | "cut" | "paste" | "duplicate";

/** Why a drag in the preview changed nothing. */
export type BlockedDrag = "locked" | "position" | "size" | "rotation" | "shared";

const blockedDrags: ReadonlySet<unknown> = new Set<BlockedDrag>(["locked", "position", "size", "rotation", "shared"]);

const objectCommands: ReadonlySet<unknown> = new Set<ObjectCommand>(["copy", "cut", "paste", "duplicate"]);

function readSelection(message: Record<string, unknown>): PreviewSelection {
  const flags = (value: unknown): Record<string, boolean> => (
    value && typeof value === "object" ? value as Record<string, boolean> : {}
  );
  const arrange = flags(message.arrange);
  const stacking = message.stacking && typeof message.stacking === "object" ? flags(message.stacking) : undefined;
  const objects = Array.isArray(message.objects) ? message.objects : [];
  return {
    slideIndex: typeof message.slideIndex === "number" ? message.slideIndex : -1,
    editing: message.editing === true,
    locked: message.locked === true,
    objects: objects.flatMap((item): PreviewObject[] => {
      if (!item || typeof item !== "object") return [];
      const { target, statement } = item as Record<string, unknown>;
      const [read] = readTargets([target]);
      if (!read) return [];
      const lines = statement as { start?: unknown; end?: unknown; text?: unknown } | undefined;
      const whole = lines && Number.isInteger(lines.start) && Number.isInteger(lines.end) && typeof lines.text === "string";
      return [{
        target: read,
        ...(whole ? { statement: { start: lines.start as number, end: lines.end as number, text: lines.text as string } } : {}),
      }];
    }),
    arrange: {
      x: arrange.x === true,
      y: arrange.y === true,
      distributeX: arrange.distributeX === true,
      distributeY: arrange.distributeY === true,
    },
    ...(stacking ? {
      stacking: { layered: stacking.layered === true, backward: stacking.backward === true, forward: stacking.forward === true },
    } : {}),
    ...(typeof message.detail === "string" ? { detail: message.detail } : {}),
    ...(Array.isArray(message.cell) && message.cell.length === 2 && message.cell.every(Number.isInteger)
      ? { cell: [message.cell[0], message.cell[1]] as [number, number] }
      : {}),
  };
}

/** What a key pressed in the preview or the rail asks of the Studio around it. */
export type FrameCommand = "save" | "undo" | "redo" | "present" | "present-beginning";

const frameCommands: ReadonlySet<unknown> = new Set<FrameCommand>(["save", "undo", "redo", "present", "present-beginning"]);

export interface FrameEvents {
  previewRendered: () => void;
  /** The slide document threw while it was being run, so the preview still shows the last deck. */
  previewFailed: (failures: PreviewFailure[]) => void;
  /**
   * The slide the preview shows, with its speaker notes as they rendered, and whether it draws
   * the presentation's details: a "cover" drawn from them, a poster's "header", or neither.
   */
  slide: (index: number, count: number, label: string, notes: string, details: string) => void;
  /** One of the presentation's details clicked in the preview, or Alt-clicked to show its code. */
  detail: (field: string, action: "select" | "reveal") => void;
  /** A double-click on one of the presentation's details, asking to type it in place. */
  typeDetail: (request: number, field: string, asked: boolean) => void;
  reveal: (target: SourceTarget) => void;
  select: (targets: SourceTarget[]) => void;
  edit: (request: Record<string, unknown>) => Promise<boolean>;
  bind: (targets: SourceTarget[]) => void;
  /** An object was drawn onto the slide in the preview, ready to be written into the document. */
  placed: (placement: Record<string, unknown>) => void;
  /** Drawing was abandoned in the preview. */
  placeCancelled: () => void;
  command: (command: FrameCommand) => void;
  railRendered: () => void;
  /** The slides the rail rendered, with the statement and the call each one came from. */
  outline: (slides: RenderedSlide[]) => void;
  thumbnail: (index: number) => void;
  thumbnailMove: (from: number, to: number) => void;
  thumbnailMenu: (index: number, x: number, y: number) => void;
  thumbnailDelete: (index: number) => void;
  checkRendered: (frame: HTMLIFrameElement) => void;
  /** A right-click in the preview, at a point on the Studio's page, with the selection it left. */
  contextMenu: (x: number, y: number, selection: PreviewSelection, keyboard: boolean) => void;
  /** Copy, cut, duplicate, or paste, pressed on the preview's objects. */
  objectCommand: (command: ObjectCommand, selection: PreviewSelection) => void;
  /**
   * A drag in the preview that could change nothing: the layout is locked, the object's code
   * works out its place or size, written as `code`, or a loop or a helper drew it.
   */
  dragBlocked: (target: SourceTarget, reason: BlockedDrag, code: string) => void;
  /**
   * A double-click on an object's words in the preview, asking to type them in place: the
   * object, the part of it, whether a loop or a helper drew it, and whether the Studio asked
   * for it with typeAt(). The Studio answers with beginTyping() or refuseTyping().
   */
  typeRequest: (request: number, target: SourceTarget, part: TextPart, shared: boolean, asked: boolean) => void;
  /** Words typed in place, to be written into the code; resolves whether they were. */
  typed: (request: number, value: string) => Promise<boolean>;
}

function readTargets(value: unknown): SourceTarget[] {
  if (!Array.isArray(value)) return [];
  return value.filter((target): target is SourceTarget => (
    Boolean(target)
    && typeof target === "object"
    && Number.isInteger((target as SourceTarget).line)
    && Number.isInteger((target as SourceTarget).column)
    && Number.isInteger((target as SourceTarget).start)
    && Number.isInteger((target as SourceTarget).end)
  ));
}

function frame(title: string, src: string, className: string): HTMLIFrameElement {
  const created = document.createElement("iframe");
  created.className = className;
  created.title = title;
  created.src = src;
  created.allow = "fullscreen; clipboard-read; clipboard-write";
  return created;
}

/**
 * The three pages the Studio embeds, each an ordinary FrameSeq preview from the development
 * server: the live preview, the slide rail, and a print-mode copy that is never shown and only
 * exists to be measured by the layout check. They talk to the Studio with the same messages the
 * VS Code preview uses, so an edit made in either host follows the same rules.
 */
export class StudioFrames {
  readonly preview: HTMLIFrameElement;
  readonly rail: HTMLIFrameElement;
  readonly check: HTMLIFrameElement;
  private lastError = "";
  /** Pages that started a deck. A page that never did cannot be updated in place. */
  private readonly started = new WeakSet<Document>();

  constructor(
    hosts: { preview: HTMLElement; rail: HTMLElement; check: HTMLElement },
    private readonly events: FrameEvents,
    initialSlide: number,
    private theme: "light" | "dark",
  ) {
    this.preview = frame(t.frames.preview, `/?frameseq-preview=studio#${initialSlide + 1}`, "studio-preview-frame");
    this.rail = frame("Slides", `/?thumbnails=1&frameseq-preview=studio-rail&studio-theme=${theme}`, "studio-rail-frame");
    this.check = frame(t.frames.check, "/?print=1&frameseq-preview=studio-check", "studio-check-frame");
    this.check.tabIndex = -1;
    this.check.setAttribute("aria-hidden", "true");
    this.check.inert = true;
    hosts.preview.append(this.preview);
    hosts.rail.append(this.rail);
    hosts.check.append(this.check);

    this.preview.addEventListener("load", () => {
      this.watchConsole();
      // A deck that throws while the page starts never reports in, and leaves no running page
      // for later saves to update. Say why, and reload the frames once the document changes.
      setTimeout(() => {
        const page = this.preview.contentWindow as (Window & {
          __frameseqError?: string;
          __frameseqErrorStatement?: unknown;
        }) | null;
        if (!page || page.document.documentElement.dataset.ready === "true") return;
        const [failure] = readFailures([{
          message: page.__frameseqError || this.lastError
            || t.frames.couldNotRun,
          ...(page.__frameseqErrorStatement as object | undefined),
        }]);
        this.events.previewFailed([failure]);
      }, 1500);
    });
    // Build errors are listed in the Problems panel; a full-page overlay squeezed into the rail
    // would only hide the slides. The preview keeps its overlay, where there is room to read it.
    this.rail.addEventListener("load", () => this.applyTheme());
    for (const quiet of [this.rail, this.check]) {
      quiet.addEventListener("load", () => {
        const style = quiet.contentDocument?.createElement("style");
        if (!style) return;
        style.textContent = "vite-error-overlay { display: none !important; }";
        quiet.contentDocument?.head.append(style);
      });
    }
    addEventListener("message", (event: MessageEvent<unknown>) => this.receive(event));
  }

  /**
   * Remember what the preview last complained about. A failed hot update is only ever logged,
   * so this is the one place its reason can be read from.
   */
  private watchConsole(): void {
    const target = this.preview.contentWindow as (Window & typeof globalThis) | null;
    if (!target) return;
    try {
      const original = target.console.error.bind(target.console);
      target.console.error = (...values: unknown[]) => {
        original(...values);
        const error = values.find((value) => value && typeof value === "object" && "message" in value) as
          { message?: unknown; stack?: unknown } | undefined;
        if (error && typeof error.message === "string") this.lastError = error.message;
      };
      target.addEventListener("error", (event) => {
        if (event.message) this.lastError = event.message;
      });
    } catch {
      // A preview that cannot be reached simply reports failures without a reason.
    }
  }

  private receive(event: MessageEvent<unknown>): void {
    const message = event.data as Record<string, unknown> | null;
    if (!message || typeof message.type !== "string") return;
    const { events } = this;
    if (message.type === "frameseq.rendered") {
      const source = [this.preview, this.rail, this.check].find((target) => target.contentWindow === event.source);
      if (source?.contentDocument) this.started.add(source.contentDocument);
    }

    if (event.source === this.preview.contentWindow) {
      switch (message.type) {
        case "frameseq.rendered":
          this.lastError = "";
          events.previewRendered();
          return;
        case "frameseq.render-failed": {
          const fallback = this.lastError || t.frames.threw;
          const failures = readFailures(message.problems)
            .map((failure) => ({ ...failure, message: failure.message || fallback }));
          events.previewFailed(failures.length > 0 ? failures : [{ message: fallback }]);
          return;
        }
        case "frameseq.slide":
          if (typeof message.index === "number" && typeof message.count === "number") {
            events.slide(
              message.index,
              message.count,
              typeof message.label === "string" ? message.label : "",
              typeof message.notes === "string" ? message.notes : "",
              typeof message.details === "string" ? message.details : "",
            );
          }
          return;
        case "frameseq.detail":
          if (typeof message.field === "string") events.detail(message.field, message.action === "reveal" ? "reveal" : "select");
          return;
        case "frameseq.reveal": {
          const [target] = readTargets([message]);
          if (target) events.reveal(target);
          return;
        }
        case "frameseq.select":
          events.select(readTargets(message.targets));
          return;
        case "frameseq.bind-selection":
          events.bind(readTargets(message.targets));
          return;
        case "frameseq.placed":
          events.placed(message);
          return;
        case "frameseq.place-cancelled":
          events.placeCancelled();
          return;
        case "frameseq.edit":
          void events.edit(message).then((ok) => {
            this.preview.contentWindow?.postMessage({ type: "frameseq.edit-result", ok }, "*");
          });
          return;
        case "frameseq.command":
          if (frameCommands.has(message.command)) events.command(message.command as FrameCommand);
          return;
        case "frameseq.context-menu":
          if (typeof message.x === "number" && typeof message.y === "number") {
            const box = this.preview.getBoundingClientRect();
            events.contextMenu(box.left + message.x, box.top + message.y, readSelection(message), message.keyboard === true);
          }
          return;
        case "frameseq.object-command":
          if (objectCommands.has(message.command)) events.objectCommand(message.command as ObjectCommand, readSelection(message));
          return;
        case "frameseq.drag-blocked": {
          const [target] = readTargets([message.target]);
          if (target && blockedDrags.has(message.reason)) {
            events.dragBlocked(target, message.reason as BlockedDrag, typeof message.code === "string" ? message.code : "");
          }
          return;
        }
        case "frameseq.type-request": {
          if (typeof message.detail === "string" && Number.isInteger(message.request)) {
            events.typeDetail(message.request as number, message.detail, message.asked === true);
            return;
          }
          const [target] = readTargets([message.target]);
          if (target && Number.isInteger(message.request)) {
            events.typeRequest(message.request as number, target, readPart(message.part), message.shared === true, message.asked === true);
          }
          return;
        }
        case "frameseq.typed":
          if (Number.isInteger(message.request) && typeof message.value === "string") {
            const request = message.request as number;
            void events.typed(request, message.value).then((ok) => {
              this.preview.contentWindow?.postMessage({ type: "frameseq.typed-result", request, ok }, "*");
            });
          }
          return;
        default:
          return;
      }
    }

    if (event.source === this.rail.contentWindow) {
      const index = typeof message.index === "number" ? message.index : -1;
      switch (message.type) {
        case "frameseq.rendered":
          events.railRendered();
          return;
        case "frameseq.thumbnail":
          if (index >= 0) events.thumbnail(index);
          return;
        case "frameseq.thumbnail-outline":
          if (Array.isArray(message.slides)) events.outline(message.slides as RenderedSlide[]);
          return;
        case "frameseq.thumbnail-move":
          if (typeof message.from === "number" && typeof message.to === "number") {
            events.thumbnailMove(message.from, message.to);
          }
          return;
        case "frameseq.thumbnail-menu":
          if (index >= 0 && typeof message.x === "number" && typeof message.y === "number") {
            const box = this.rail.getBoundingClientRect();
            events.thumbnailMenu(index, box.left + message.x, box.top + message.y);
          }
          return;
        case "frameseq.thumbnail-delete":
          if (index >= 0) events.thumbnailDelete(index);
          return;
        case "frameseq.command":
          if (frameCommands.has(message.command)) events.command(message.command as FrameCommand);
          return;
        default:
          return;
      }
    }

    if (event.source === this.check.contentWindow && message.type === "frameseq.rendered") {
      events.checkRendered(this.check);
    }
  }

  /** Show a slide, and outline the object written at a line, a named region, or an object path. */
  focus(target: { slideIndex: number; line?: number; column?: number; name?: string; path?: string }): void {
    this.preview.contentWindow?.postMessage({
      type: "frameseq.focus-source",
      ...target,
      slideIndex: target.slideIndex + 1,
    }, "*");
  }

  /** Let the next press on the preview's slide draw an object of this kind. */
  place(kind: string): void {
    this.preview.contentWindow?.postMessage({ type: "frameseq.place", kind }, "*");
    this.preview.focus();
  }

  cancelPlace(): void {
    this.preview.contentWindow?.postMessage({ type: "frameseq.place-cancel" }, "*");
  }

  /** Have the preview act on the objects selected in it, as its menu or keys would. */
  selectionAction(action: SelectionAction): void {
    this.preview.contentWindow?.postMessage({ type: "frameseq.selection-action", action }, "*");
  }

  /** Let the preview type an object's words in place, starting from `value`, selected or not. */
  beginTyping(request: number, value: string, multiline: boolean, selectAll: boolean): void {
    this.preview.contentWindow?.postMessage({ type: "frameseq.type-begin", request, value, multiline, selectAll }, "*");
  }

  /**
   * Tell the preview its words cannot be typed in place; the Studio says why, or opens them
   * elsewhere. `retry` asks it to ask again of the drawing it shows next, as one older than the
   * code needs.
   */
  refuseTyping(request: number, retry = false): void {
    this.preview.contentWindow?.postMessage({ type: "frameseq.type-refused", request, retry }, "*");
  }

  /**
   * Have the preview start typing into the words of the object written at a line and column of
   * the saved document, once it shows it, as it does right after the object was inserted.
   */
  typeAt(slideIndex: number, line: number, column: number, part?: TextPart): void {
    this.preview.focus();
    this.preview.contentWindow?.postMessage({ type: "frameseq.type-at", slideIndex, line, column, part }, "*");
  }

  /** Have the preview type one of the presentation's details where the slide shows it. */
  typeDetail(field: string): void {
    this.preview.focus();
    this.preview.contentWindow?.postMessage({ type: "frameseq.type-detail", field }, "*");
  }

  /** Lock the preview's layout, so objects stay put while they are selected and typed into, or unlock it. */
  setLayoutLock(locked: boolean): void {
    this.preview.contentWindow?.postMessage({ type: "frameseq.layout-lock", locked }, "*");
  }

  /**
   * Show the master pages in the preview and the rail in place of the slides, or the slides
   * again. The layout check keeps measuring the slides.
   */
  setMasters(masters: boolean, slide = 0): void {
    // A placeholder's sample text is written in the Studio's language.
    const flag = masters ? `&masters=1&lang=${language}` : "";
    this.preview.src = `/?frameseq-preview=studio${flag}#${slide + 1}`;
    this.rail.src = `/?thumbnails=1&frameseq-preview=studio-rail${flag}&studio-theme=${this.theme}`;
  }

  /** Show the rail in the palette the Studio is showing. */
  setTheme(theme: "light" | "dark"): void {
    this.theme = theme;
    this.applyTheme();
  }

  private applyTheme(): void {
    const root = this.rail.contentDocument?.documentElement;
    if (root) root.dataset.studioTheme = this.theme;
  }

  markThumbnail(index: number): void {
    this.rail.contentWindow?.postMessage({ type: "frameseq.thumbnail-active", index }, "*");
  }

  /**
   * Reload the frames whose page never started a deck, after the slide document changed at
   * `changedAt`. A page that failed while starting has no hot-update handler, so the fixed
   * document would otherwise never reach it. A page still loading is judged once it has loaded,
   * and a page that began loading after the change already has it, which also keeps a deck that
   * is still broken from reloading over and over.
   */
  restartStalled(changedAt: number): void {
    for (const target of [this.preview, this.rail, this.check]) {
      const page = target.contentDocument;
      const view = target.contentWindow;
      if (!page || !view || this.started.has(page)) continue;
      // The server may take a moment to notice the change, so a page begun just after it may not.
      if (view.performance.timeOrigin > changedAt + 300) continue;
      // A frame whose first page has not arrived yet still shows the blank page it started with;
      // reloading that would cancel the page on its way.
      if (page.readyState !== "complete" || page.URL === "about:blank") {
        target.addEventListener("load", () => setTimeout(() => this.restartStalled(changedAt), 300), { once: true });
        continue;
      }
      try {
        view.location.reload();
      } catch {
        target.src = target.src;
      }
    }
  }
}
