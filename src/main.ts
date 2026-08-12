import "katex/dist/katex.min.css";
import "./index.css";
import slides from "virtual:frameseq-entry";
import { mountSlides } from "./renderer";
import type { SlidesRootDefinition } from "./core";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app element");
const appRoot = app;

mountSlides(slides, appRoot);
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
  mountSlides(nextSlides, stage);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if (version !== replacementVersion) {
    stage.remove();
    return;
  }
  appRoot.replaceChildren(...stage.childNodes);
  stage.remove();
  if (appRoot.querySelector(".is-frameseq-selected")) {
    appRoot.querySelector<HTMLElement>(".frameseq-slides")?.focus({ preventScroll: true });
  }
  dispatchEvent(new Event("resize"));
}

if (import.meta.hot) {
  import.meta.hot.accept("virtual:frameseq-entry", (entry) => {
    if (entry?.default) void replaceSlides(entry.default);
  });
}
