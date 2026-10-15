import "katex/dist/katex.min.css";
import "../index.css";
import { templates } from "virtual:frameseq-templates";
import { mountSlides } from "../renderer";

/**
 * One template's cover, rendered by the same runtime as any presentation, for the Studio's
 * new-presentation dialog. The query names the template and the language of its placeholders;
 * the page has no controls, since the dialog only shows it.
 */
const query = new URLSearchParams(location.search);
const run = templates[`${query.get("template")}:${query.get("language") === "zh" ? "zh" : "en"}`];
const app = document.querySelector<HTMLElement>("#app");
if (app && run) {
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
  mountSlides(run(), app);
}
