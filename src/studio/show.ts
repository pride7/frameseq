import { desktop } from "./desktop";
import { t } from "./i18n";
import {
  allowScreens,
  chosenKey,
  hasScreens,
  knownScreens,
  placeShow,
  refreshScreens,
  windowManagement,
  type ShowPlacement,
} from "./screens";
import { askChoice, element, toast } from "./ui";

/**
 * The slide show, in the Studio's own window: the slides fill the screen from a slide on, as
 * PowerPoint shows them, and `Esc` brings the Studio back. The FrameSeq app's window goes full
 * screen with them. Where full screen is refused, the show still covers the whole window.
 *
 * On a computer with a second screen, as PowerPoint does with presenter view, the window takes
 * the slides to the other screen, or to the one chosen in Present › Show screen, and presenter
 * view opens on the Studio's; `Esc` in either ends the show. A browser asks once whether the
 * Studio may place windows on the screens.
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
  /** Whether the FrameSeq app's window, rather than the page, took this show full screen. */
  private appWindow = false;
  /** Presenter view, as a browser opened it beside this show on the other screen. */
  private presenter: Window | null = null;
  /** A show waiting on a question about the screens, which another F5 must not start again. */
  private asking = false;
  /** The last show's way out of full screen, while it is still on its way. */
  private leaving: Promise<unknown> | undefined;

  constructor(
    private readonly ended: (index: number) => void,
    private readonly options: {
      /** The language the end of the show is announced in. */
      language: string;
      /** The phone remote's pairing, if any. */
      remote?: string;
      /** Whether a second screen gets the slides while presenter view takes this one. */
      presenterView: () => boolean;
    },
  ) {
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
    if (this.asking) return;
    const presenterView = this.options.presenterView();
    const startShow = desktop?.startShow?.bind(desktop);
    if (startShow) {
      // The app's window goes full screen itself, onto the screen the slides go to.
      const layer = this.open(index);
      this.appWindow = true;
      const begin = async () => {
        const placement = placeShow(await refreshScreens(), presenterView);
        if (this.layer !== layer) return;
        await startShow({
          slides: placement ? { x: placement.show.left, y: placement.show.top } : null,
          presenter: placement?.presenter
            ? { address: this.presenterAddress(index), x: placement.presenter.left, y: placement.presenter.top }
            : null,
        });
      };
      const run = () => void begin().catch(() => undefined);
      if (this.leaving) void this.leaving.then(run);
      else run();
    } else if (hasScreens() && (presenterView || chosenKey())) {
      void this.startOnScreens(index, presenterView);
    } else {
      this.fill(this.open(index));
    }
  }

  /** End the show and hand the Studio back, on the slide shown last. */
  stop(): void {
    const { layer } = this;
    if (!layer) return;
    this.layer = undefined;
    this.frame = undefined;
    let leaving: Promise<unknown> | undefined;
    if (this.appWindow) {
      this.appWindow = false;
      leaving = desktop?.endShow?.().catch(() => undefined);
    } else if (document.fullscreenElement === layer) {
      leaving = document.exitFullscreen().catch(() => undefined);
    }
    if (leaving) {
      this.leaving = leaving;
      void leaving.then(() => {
        if (this.leaving === leaving) this.leaving = undefined;
      });
    }
    if (this.presenter && !this.presenter.closed) this.presenter.close();
    this.presenter = null;
    layer.remove();
    this.ended(this.shown);
    if (this.returnFocus?.isConnected) this.returnFocus.focus();
    this.returnFocus = undefined;
  }

  /** The slides, over the whole window, from this slide on. */
  private open(index: number): HTMLElement {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const layer = element("div", "studio-show");
    const frame = element("iframe", "studio-show-frame");
    frame.title = t.frames.show;
    frame.allow = "fullscreen";
    const query = new URLSearchParams({ show: "1", lang: this.options.language });
    if (this.options.remote) query.set("session", this.options.remote);
    frame.src = `/?${query}#${index + 1}`;
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
    this.focus();
    return layer;
  }

  /** Take the slides full screen, once the last show has left it. */
  private fill(layer: HTMLElement): void {
    const enter = () => {
      if (this.layer === layer) void layer.requestFullscreen?.().catch(() => undefined);
    };
    if (this.leaving) void this.leaving.then(enter);
    else enter();
  }

  /**
   * A show on two screens, from a browser that can place windows on them. The first time, the
   * Studio says what it is about to do and the browser asks whether it may; the answer can take
   * longer than the key press lets the page go full screen, and a click starts the show then.
   */
  private async startOnScreens(index: number, presenterView: boolean): Promise<void> {
    this.asking = true;
    try {
      const permission = await windowManagement();
      if (permission === "prompt") {
        const choice = await askChoice({
          title: t.show.screensTitle,
          message: t.show.screensMessage,
          choices: [
            { label: t.show.thisScreen, value: "one" },
            { label: t.show.bothScreens, value: "both", primary: true },
          ],
        });
        if (!choice) return;
        if (choice === "one") {
          this.fill(this.open(index));
          return;
        }
      }
      let placement: ShowPlacement | undefined;
      if (permission !== "denied") {
        if (await allowScreens()) placement = placeShow(knownScreens(), presenterView);
        else toast(t.show.denied, { tone: "warning" });
      }
      if (!placement) {
        this.fill(this.open(index));
        return;
      }
      if (navigator.userActivation?.isActive === false) {
        const choice = await askChoice({
          title: t.show.screensTitle,
          message: t.show.ready,
          choices: [{ label: t.show.start, value: "start", primary: true }],
        });
        if (!choice) return;
      }
      await this.leaving;
      await this.presentOn(index, placement);
    } finally {
      this.asking = false;
    }
  }

  /**
   * The slides full screen on one screen, and then presenter view over another, from one key
   * press. A window opened on the screen the slides are on would take them out of full screen,
   * so presenter view waits until they are there.
   */
  private async presentOn(index: number, placement: ShowPlacement): Promise<void> {
    const layer = this.open(index);
    try {
      await layer.requestFullscreen({ screen: placement.show.placed } as FullscreenOptions);
    } catch {
      return;
    }
    if (this.layer !== layer || !placement.presenter?.placed) return;
    const { availLeft, availTop, availWidth, availHeight } = placement.presenter.placed;
    this.presenter = window.open(
      this.presenterAddress(index),
      "frameseq-presenter",
      `popup,left=${availLeft},top=${availTop},width=${availWidth},height=${availHeight}`,
    );
  }

  /** Presenter view beside the show, which ends the show when it is done with, in the Studio's language. */
  private presenterAddress(index: number): string {
    return `/?presenter=1&show=1&lang=${this.options.language}#${index + 1}`;
  }

  private focus(): void {
    this.frame?.focus();
    this.frame?.contentWindow?.focus();
  }

  private reveal(frame: HTMLIFrameElement): void {
    frame.style.visibility = "";
    // A hidden frame cannot take the keys, which then stay where F5 was pressed, such as in the
    // preview, so the show takes them once it shows.
    if (frame === this.frame) this.focus();
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
