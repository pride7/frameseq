/** Where a preview object came from, as the preview reports it: file offsets and a line. */
export interface SourceTarget {
  line: number;
  column: number;
  start: number;
  end: number;
}

import type { RenderedSlide } from "./outline";

export interface FrameEvents {
  previewRendered: () => void;
  /** The slide document threw while it was being run, so the preview still shows the last deck. */
  previewFailed: (message: string) => void;
  slide: (index: number, count: number, label: string) => void;
  reveal: (target: SourceTarget) => void;
  select: (targets: SourceTarget[]) => void;
  edit: (request: Record<string, unknown>) => Promise<boolean>;
  bind: (targets: SourceTarget[]) => void;
  command: (command: "save" | "undo" | "redo") => void;
  railRendered: () => void;
  /** The slides the rail rendered, with the statement and the call each one came from. */
  outline: (slides: RenderedSlide[]) => void;
  thumbnail: (index: number) => void;
  thumbnailMove: (from: number, to: number) => void;
  thumbnailMenu: (index: number, x: number, y: number) => void;
  thumbnailDelete: (index: number) => void;
  checkRendered: (frame: HTMLIFrameElement) => void;
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
    this.preview = frame("Live preview", `/?frameseq-preview=studio#${initialSlide + 1}`, "studio-preview-frame");
    this.rail = frame("Slides", `/?thumbnails=1&frameseq-preview=studio-rail&studio-theme=${theme}`, "studio-rail-frame");
    this.check = frame("Layout check", "/?print=1&frameseq-preview=studio-check", "studio-check-frame");
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
        const page = this.preview.contentWindow as (Window & { __frameseqError?: string }) | null;
        if (!page || page.document.documentElement.dataset.ready === "true") return;
        this.events.previewFailed(page.__frameseqError || this.lastError
          || "The slide document could not be run. Save a fix and the preview restarts.");
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
        case "frameseq.render-failed":
          events.previewFailed(this.lastError || "The slide document threw an error while it was being run.");
          return;
        case "frameseq.slide":
          if (typeof message.index === "number" && typeof message.count === "number") {
            events.slide(message.index, message.count, typeof message.label === "string" ? message.label : "");
          }
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
        case "frameseq.edit":
          void events.edit(message).then((ok) => {
            this.preview.contentWindow?.postMessage({ type: "frameseq.edit-result", ok }, "*");
          });
          return;
        case "frameseq.command":
          if (message.command === "save" || message.command === "undo" || message.command === "redo") {
            events.command(message.command);
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
          if (message.command === "save" || message.command === "undo" || message.command === "redo") {
            events.command(message.command);
          }
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
   * Reload the frames whose page never started a deck. A page that failed while starting has
   * no hot-update handler, so a fixed document would otherwise never reach it.
   */
  restartStalled(): void {
    for (const target of [this.preview, this.rail, this.check]) {
      const page = target.contentDocument;
      if (!page || this.started.has(page) || page.readyState !== "complete") continue;
      try {
        target.contentWindow?.location.reload();
      } catch {
        target.src = target.src;
      }
    }
  }
}
