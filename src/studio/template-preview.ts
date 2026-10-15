import "katex/dist/katex.min.css";
import "../index.css";
import { templates } from "virtual:frameseq-templates";
import type { SlidesRootDefinition } from "../core";
import { mountSlides } from "../renderer";

/**
 * One template's cover, rendered by the same runtime as any presentation, for the Studio's
 * new-presentation dialog. The query names a template FrameSeq ships and the language of its
 * placeholders, or the file of one of the person's own; the page has no controls, since the
 * dialog only shows it.
 */
const query = new URLSearchParams(location.search);
const app = document.querySelector<HTMLElement>("#app");

function show(slides: SlidesRootDefinition): void {
  if (!app) return;
  const quiet = document.createElement("style");
  // The slide fills the page edge to edge, without the margins a browser tab leaves around it.
  quiet.textContent = `
    .frameseq-controls { display: none !important; }
    html, body { overflow: hidden; }
    .frameseq-slide-frame {
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }
  `;
  document.head.append(quiet);
  mountSlides(slides, app);
}

const file = query.get("file");
if (file) {
  // The server compiles a template of one's own as it compiles the presentation being edited.
  const path = file.replaceAll("\\", "/").replace(/^\/+/, "");
  void import(/* @vite-ignore */ `/@fs/${path}?frameseq-template`)
    .then((module: { default?: SlidesRootDefinition }) => {
      if (module.default) show(module.default);
    })
    .catch(() => document.documentElement.classList.add("frameseq-template-broken"));
} else {
  const run = templates[`${query.get("template")}:${query.get("language") === "zh" ? "zh" : "en"}`];
  if (run) show(run());
}
