import "katex/dist/katex.min.css";
import "./index.css";
import slides from "virtual:frameseq-entry";
import { mountSlides } from "./renderer";
import type { SlidesRootDefinition } from "./core";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app element");
const appRoot = app;

/** Where an error came from in the slide document, as character offsets. */
interface FailureLocation {
  message: string;
  start?: number;
  end?: number;
}

/**
 * The statement the document was running when it stopped. The runtime keeps it on the page
 * while a preview is served, so an error thrown by a command or by plain TypeScript in the
 * document can still be traced to the line that caused it.
 */
function failedStatement(): { start: number; end: number } | undefined {
  const statement = (globalThis as { __frameseqStatement?: { start: number; end: number } }).__frameseqStatement;
  return statement && Number.isInteger(statement.start) && Number.isInteger(statement.end)
    ? statement
    : undefined;
}

/** Each problem an error describes, with the offsets of the command it concerns when known. */
function failureLocations(error: unknown): FailureLocation[] {
  const problems = (error as { problems?: unknown } | null)?.problems;
  if (Array.isArray(problems) && problems.length > 0) {
    return problems.filter((problem): problem is FailureLocation => (
      Boolean(problem) && typeof (problem as FailureLocation).message === "string"
    ));
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return [{ message, ...failedStatement() }];
}

/**
 * Tell an embedding host, such as FrameSeq Studio, that the deck on screen is new, or that the
 * slide document could not be run and the previous deck is still showing.
 */
function announce(type: "frameseq.rendered"): void;
function announce(type: "frameseq.render-failed", error?: unknown): void;
function announce(type: "frameseq.rendered" | "frameseq.render-failed", error?: unknown): void {
  if (!import.meta.hot || window.parent === window) return;
  window.parent.postMessage(type === "frameseq.render-failed"
    ? { type, problems: error === undefined ? [{ message: "", ...failedStatement() }] : failureLocations(error) }
    : { type }, "*");
}

try {
  mountSlides(slides, appRoot);
  announce("frameseq.rendered");
} catch (error) {
  announce("frameseq.render-failed", error);
  throw error;
}
let replacementVersion = 0;

/**
 * Source-backed layout edits update the entry module frequently. Render the replacement at
 * full viewport size while it is hidden, then swap it in only after layout and scaling have
 * settled. The old canvas stays visible throughout, so saving a drag never exposes an empty
 * page or a native-size frame.
 */
async function replaceSlides(nextSlides: SlidesRootDefinition): Promise<void> {
  const version = ++replacementVersion;
  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  Object.assign(stage.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    minWidth: "320px",
    visibility: "hidden",
    pointerEvents: "none",
  });
  document.body.append(stage);
  try {
    mountSlides(nextSlides, stage);
  } catch (error) {
    stage.remove();
    announce("frameseq.render-failed", error);
    throw error;
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if (version !== replacementVersion) {
    stage.remove();
    return;
  }
  appRoot.replaceChildren(...stage.childNodes);
  stage.remove();
  // Words being typed on the slide keep the keys.
  if (appRoot.querySelector(".is-frameseq-selected") && !appRoot.querySelector(".is-frameseq-typing")) {
    appRoot.querySelector<HTMLElement>(".frameseq-slides")?.focus({ preventScroll: true });
  }
  dispatchEvent(new Event("resize"));
  announce("frameseq.rendered");
}

if (import.meta.hot) {
  import.meta.hot.accept("virtual:frameseq-entry", (entry) => {
    // Vite hands over no module when the new one threw while it was being run.
    if (entry?.default) void replaceSlides(entry.default).catch((error: unknown) => console.error(error));
    else announce("frameseq.render-failed");
  });
}
