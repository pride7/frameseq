import { slideLayoutSources, type SlideLayoutId, type SlideLayoutSource } from "../../scripts/slide-layouts.mjs";
import { language, t } from "./i18n";
import { element } from "./ui";

/** A slide to start from: its lines and the placeholder to select, with a name and a sketch. */
export interface SlideLayout extends SlideLayoutSource {
  name: string;
  sketch: string;
}

/**
 * Small drawings of each layout on a 64 × 36 page. `t` marks a title, `l` a line of text, `a` the
 * accent colour, `b` a filled block, `n` a step's number, and `frame` and `arrow` a diagram's
 * boxes and connectors, so the Studio's palette colours them.
 */
const title = '<rect class="t" x="5" y="5" width="24" height="3.6" rx="0.8"/>';
const line = (x: number, y: number, width: number): string => `<rect class="l" x="${x}" y="${y}" width="${width}" height="1.6" rx="0.8"/>`;
const sketches: Record<SlideLayoutId, string> = {
  "title-text": `${title}${line(5, 13, 50)}${line(5, 17.5, 44)}${line(5, 22, 36)}`,
  bullets: `${title}${line(5, 12.5, 34)}${[17, 22, 27].map((y) => `<circle class="a" cx="6.2" cy="${y + 0.8}" r="1.2"/>${line(9.5, y, 30)}`).join("")}`,
  section: `<rect class="a" x="5" y="11" width="10" height="1.6" rx="0.8"/><rect class="t" x="5" y="15" width="38" height="5" rx="1"/>${line(5, 24, 26)}`,
  "two-columns": `${title}${[5, 34].map((x) => `<rect class="t" x="${x}" y="12.5" width="18" height="2.2" rx="0.8"/>${line(x, 18, 24)}${line(x, 22, 20)}${line(x, 26, 22)}`).join("")}`,
  metrics: `${title}${[5, 25, 45].map((x) => `<rect class="t" x="${x}" y="15" width="11" height="6" rx="1"/>${line(x, 23.5, 14)}`).join("")}`,
  code: `${title}<rect class="b" x="5" y="11.5" width="29" height="19" rx="1.6"/>${line(8, 15, 18)}${line(8, 19, 22)}${line(8, 23, 14)}<rect class="t" x="38" y="12.5" width="20" height="2.2" rx="0.8"/>${line(38, 18, 20)}${line(38, 22, 16)}`,
  formula: `${title}<rect class="b" x="14" y="11.5" width="36" height="15" rx="1.6"/><text class="t" x="32" y="22.5" text-anchor="middle" font-size="9" font-family="Georgia, serif" font-style="italic">∑ xⁿ</text>${line(22, 29.5, 20)}`,
  table: `${title}<rect class="t" x="5" y="12" width="54" height="0.8"/><rect class="l" x="5" y="17.3" width="54" height="0.5"/><rect class="l" x="5" y="22.3" width="54" height="0.5"/><rect class="t" x="5" y="27.5" width="54" height="0.8"/>${[14.2, 19.4, 24.4].map((y) => `${line(7, y, 12)}${line(30, y, 8)}${line(47, y, 8)}`).join("")}`,
  chart: `${title}<rect class="a" x="10" y="22" width="7" height="9" rx="0.6"/><rect class="a" x="21" y="18" width="7" height="13" rx="0.6"/><rect class="a" x="32" y="14" width="7" height="17" rx="0.6"/><rect class="a" x="43" y="19" width="7" height="12" rx="0.6"/><rect class="l" x="7" y="31" width="47" height="0.6"/>`,
  flow: `${title}${[5, 26, 47].map((x) => `<rect class="frame" x="${x}" y="15" width="12" height="8" rx="1.2"/>`).join("")}<path class="arrow" d="M18 19h6.5m-2-1.6 2 1.6-2 1.6M39 19h6.5m-2-1.6 2 1.6-2 1.6"/>`,
  steps: `${title}${[12.5, 19, 25.5].map((y, index) => `<circle class="a" cx="7" cy="${y + 1.6}" r="2.2"/><text class="n" x="7" y="${y + 2.7}" text-anchor="middle" font-size="3">${index + 1}</text>${line(11.5, y + 0.8, 32)}`).join("")}`,
  closing: `<text class="a" x="11" y="21" font-size="10" font-family="Georgia, serif">“</text><rect class="t" x="17" y="14.5" width="34" height="4" rx="1"/>${line(24, 22.5, 20)}`,
};

/** The layouts a new slide can start from, in the Studio's language. */
export function slideLayouts(): SlideLayout[] {
  return slideLayoutSources(language).map((layout) => ({
    ...layout,
    name: t.layouts.names[layout.id],
    sketch: sketches[layout.id],
  }));
}

export const defaultSlideLayout = (): SlideLayout => slideLayouts()[0];

/**
 * A grid of layouts at a point on the page, for the rail's + button and its slide menu. Arrow
 * keys move across the grid, Enter adds the layout, and Escape or a click elsewhere closes it.
 */
export function showLayoutPicker(x: number, y: number, pick: (layout: SlideLayout) => void): void {
  document.querySelector(".studio-layouts")?.remove();
  const layouts = slideLayouts();
  const panel = element("div", "studio-layouts");
  panel.setAttribute("role", "menu");
  panel.setAttribute("aria-label", t.layouts.label);
  panel.append(element("p", "studio-layouts-heading", t.layouts.label));
  const grid = element("div", "studio-layouts-grid");
  const buttons = layouts.map((layout) => {
    const button = element("button", "studio-layout");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.dataset.layout = layout.id;
    button.innerHTML = `<svg class="studio-layout-sketch" viewBox="0 0 64 36" aria-hidden="true">${layout.sketch}</svg>`;
    button.append(element("span", "studio-layout-name", layout.name));
    button.addEventListener("click", () => {
      close();
      pick(layout);
    });
    grid.append(button);
    return button;
  });
  panel.append(grid);
  document.body.append(panel);
  const box = panel.getBoundingClientRect();
  panel.style.left = `${Math.max(6, Math.min(x, innerWidth - box.width - 6))}px`;
  panel.style.top = `${Math.max(6, Math.min(y, innerHeight - box.height - 6))}px`;

  const onPointer = (event: PointerEvent): void => {
    if (!panel.contains(event.target as Node)) close();
  };
  const onKey = (event: KeyboardEvent): void => {
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    // A narrow window shows fewer columns, so a step up or down is read from the grid itself.
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[event.key];
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (step !== undefined) {
      event.preventDefault();
      const next = index < 0 ? 0 : index + step;
      buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus();
    }
  };
  function close(): void {
    panel.remove();
    removeEventListener("pointerdown", onPointer, true);
    removeEventListener("keydown", onKey, true);
    removeEventListener("blur", close);
  }
  addEventListener("pointerdown", onPointer, true);
  addEventListener("keydown", onKey, true);
  addEventListener("blur", close);
  buttons[0]?.focus();
}
