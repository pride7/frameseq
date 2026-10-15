import { t } from "./i18n";
import { element } from "./ui";

/**
 * The slide show, in the Studio's own window: the slides fill the screen from a slide on, as
 * PowerPoint shows them, and `Esc` brings the Studio back. The FrameSeq app's window goes full
 * screen with them, since its web view hands the page's full screen to the window. Where full
 * screen is refused, the show still covers the whole window.
 */
export class SlideShow {
  private layer: HTMLElement | undefined;
  private frame: HTMLIFrameElement | undefined;
  /** The slide on screen, as the show last reported it. */
  private shown = 0;
  /** Where the keyboard was before the show, as the editor or the preview. */
  private returnFocus: HTMLElement | undefined;
  /** Whether this show went full screen, so that leaving it ends the show. */
  private fullScreen = false;
  /** The last show's way out of full screen, while it is still on its way. */
  private leaving: Promise<unknown> | undefined;

  constructor(private readonly ended: (index: number) => void) {
    addEventListener("message", (event: MessageEvent<unknown>) => this.receive(event));
    // Leaving full screen, by the browser's own Escape or otherwise, ends the show as well. The
    // last show's late way out, as when F5 follows Escape at once, is no reason to end this one.
    document.addEventListener("fullscreenchange", () => {
      if (!this.layer) return;
      if (document.fullscreenElement === this.layer) this.fullScreen = true;
      else if (this.fullScreen) this.stop();
    });
    // A key that reaches the Studio's page while the show runs, as after a click outside the
    // slides, goes back to the show; Escape ends it.
    addEventListener("keydown", (event) => {
      if (!this.layer) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") this.stop();
      else this.focus();
    }, { capture: true });
  }

  /** Show the slides from this one on. Call it from the key press or click that asks for it,
   * which is what lets the page go full screen. */
  start(index: number): void {
    if (this.layer) {
      this.focus();
      return;
    }
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const layer = element("div", "studio-show");
    const frame = element("iframe", "studio-show-frame");
    frame.title = t.frames.show;
    frame.allow = "fullscreen";
    frame.src = `/?show=1#${index + 1}`;
    // The page is blank until its slides are drawn, so the black layer shows meanwhile.
    frame.style.visibility = "hidden";
    frame.addEventListener("load", () => {
      this.focus();
      // A page that cannot draw its slides says why, so it shows after a moment all the same.
      setTimeout(() => this.reveal(frame), 2000);
    }, { once: true });
    layer.append(frame);
    document.body.append(layer);
    this.layer = layer;
    this.frame = frame;
    this.shown = index;
    this.fullScreen = false;
    const enter = () => {
      if (this.layer === layer) void layer.requestFullscreen?.().catch(() => undefined);
    };
    if (this.leaving) void this.leaving.then(enter);
    else enter();
    this.focus();
  }

  /** End the show and hand the Studio back, on the slide shown last. */
  stop(): void {
    const { layer } = this;
    if (!layer) return;
    this.layer = undefined;
    this.frame = undefined;
    if (document.fullscreenElement === layer) {
      const leaving = document.exitFullscreen().catch(() => undefined);
      this.leaving = leaving;
      void leaving.then(() => {
        if (this.leaving === leaving) this.leaving = undefined;
      });
    }
    layer.remove();
    this.ended(this.shown);
    if (this.returnFocus?.isConnected) this.returnFocus.focus();
    this.returnFocus = undefined;
  }

  private focus(): void {
    this.frame?.focus();
    this.frame?.contentWindow?.focus();
  }

  private reveal(frame: HTMLIFrameElement): void {
    frame.style.visibility = "";
  }

  private receive(event: MessageEvent<unknown>): void {
    const { frame } = this;
    if (!frame || event.source !== frame.contentWindow) return;
    const message = event.data as Record<string, unknown> | null;
    if (message?.type === "frameseq.rendered" || message?.type === "frameseq.render-failed") this.reveal(frame);
    if (message?.type === "frameseq.slide" && typeof message.index === "number") this.shown = message.index;
    if (message?.type === "frameseq.show-end") this.stop();
  }
}
