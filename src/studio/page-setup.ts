import { paperCanvasUnits, paperDimensions, type PaperSize } from "../paper";
import type { PresentationOptions } from "./api";
import { t } from "./i18n";
import { optionString, presentationOption } from "./presentation";
import { element } from "./ui";

/** The sizes the page setup offers: the two screen ratios, sheets of paper, or a size of one's own. */
export const pageSizes = ["16:9", "4:3", "A4", "A3", "A5", "letter", "legal", "tabloid", "A2", "A1", "A0", "custom"] as const;

export type PageSize = (typeof pageSizes)[number];

const screenSizes: ReadonlySet<PageSize> = new Set<PageSize>(["16:9", "4:3"]);

export type PageUnit = "px" | "mm" | "cm" | "in";

/** A presentation's page: its size, which way a sheet stands, and a size of one's own. */
export interface PageSetup {
  size: PageSize;
  orientation: "portrait" | "landscape";
  /** A size of one's own: in canvas units for the screen, or in a unit of paper. */
  custom: { width: number; height: number; unit: PageUnit };
  /**
   * Keep the canvas as many units across as it is, so everything on the slides keeps its size
   * against the page, as PowerPoint scales a slide's content to a new size.
   */
  keepScale: boolean;
}

/** A figure's page: its canvas in units, and how wide it prints. */
export interface FigureSetup {
  width: number;
  height: number;
  printWidth: string;
}

const screenWidth = 1280;

function stringOption(options: PresentationOptions, name: string): string | undefined {
  const option = presentationOption(options, name);
  return option?.kind === "string" ? String(option.value) : undefined;
}

function numberOption(options: PresentationOptions, name: string): number | undefined {
  const option = presentationOption(options, name);
  return option?.kind === "number" ? Number(option.value) : undefined;
}

/** Whether an option is written but worked out by the code, which the page setup leaves alone. */
export function computedPageOption(options: PresentationOptions, names: string[]): string | undefined {
  return names.map((name) => presentationOption(options, name)).find((option) => option && option.kind === undefined)?.code;
}

/** The page presentation() or poster() states now, as the page setup shows it. */
export function readPageSetup(options: PresentationOptions, canvas: { width: number; height: number }): PageSetup {
  const size = stringOption(options, "size") ?? (options.command === "poster" ? "A0" : undefined);
  const orientation = stringOption(options, "orientation") === "landscape" ? "landscape" : "portrait";
  const custom = { width: canvas.width, height: canvas.height, unit: "px" as PageUnit };
  if (size) {
    const named = pageSizes.find((candidate) => candidate.toLowerCase() === size.toLowerCase());
    if (named) return { size: named, orientation, custom, keepScale: true };
    const match = /^\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(mm|cm|in)\s*$/i.exec(size);
    if (match) {
      const sheet = { width: Number(match[1]), height: Number(match[2]), unit: match[3].toLowerCase() as PageUnit };
      return { size: "custom", orientation: sheet.width > sheet.height ? "landscape" : "portrait", custom: sheet, keepScale: true };
    }
  }
  const ratio = stringOption(options, "ratio") === "4:3" ? "4:3" : "16:9";
  const height = numberOption(options, "height");
  const width = numberOption(options, "width") ?? screenWidth;
  if (height !== undefined && height !== Math.round(width * (ratio === "4:3" ? 3 / 4 : 9 / 16))) {
    return { size: "custom", orientation: "landscape", custom: { width, height, unit: "px" }, keepScale: true };
  }
  return { size: ratio, orientation: "landscape", custom, keepScale: true };
}

/** The sheet of paper a setup prints on, or none for the screen. */
function paperOf(setup: PageSetup): { size: PaperSize; orientation?: "portrait" | "landscape" } | undefined {
  if (screenSizes.has(setup.size)) return undefined;
  if (setup.size !== "custom") return { size: setup.size as PaperSize, orientation: setup.orientation };
  if (setup.custom.unit === "px") return undefined;
  const { width, height, unit } = setup.custom;
  return { size: `${width}x${height}${unit}` as PaperSize };
}

/** The canvas a page gives when nothing else says how many units it is across. */
function usualCanvas(setup: PageSetup): { width: number; height: number; printed?: { width: number; height: number } } {
  const paper = paperOf(setup);
  if (paper) {
    const sheet = paperDimensions(paper.size, paper.orientation);
    const aspect = sheet.height / sheet.width;
    const width = sheet.width <= sheet.height ? paperCanvasUnits : Math.round(paperCanvasUnits / aspect);
    return { width, height: Math.round(width * aspect), printed: { width: sheet.width, height: sheet.height } };
  }
  if (setup.size === "custom") return { width: setup.custom.width, height: setup.custom.height };
  return { width: screenWidth, height: Math.round(screenWidth * (setup.size === "4:3" ? 3 / 4 : 9 / 16)) };
}

/**
 * The canvas a setup gives, kept `width` units across when it scales the content with the page,
 * and how big it prints, in millimetres, when it is made for paper.
 */
export function pageCanvas(setup: PageSetup, width: number): { width: number; height: number; printed?: { width: number; height: number } } {
  const usual = usualCanvas(setup);
  if (!setup.keepScale || (setup.size === "custom" && setup.custom.unit === "px") || usual.width === width) return usual;
  return { ...usual, width, height: Math.round(width * (usual.height / usual.width)) };
}

/**
 * The options of presentation() or poster() that give a setup: the size, and which way it
 * stands, or the ratio; the canvas's width when it keeps the content's scale; and none of the
 * others, so they cannot contradict it.
 */
export function pageChanges(options: PresentationOptions, setup: PageSetup, width: number): Record<string, string | undefined> {
  const quoted = (value: string): string => optionString(options, value);
  const changes: Record<string, string | undefined> = { ratio: undefined, size: undefined, orientation: undefined, width: undefined, height: undefined };
  const paper = paperOf(setup);
  if (paper) {
    // poster() prints on A0 unless it says otherwise, so it keeps saying so.
    if (options.command !== "poster" || paper.size !== "A0") changes.size = quoted(paper.size);
    if (paper.orientation === "landscape") changes.orientation = quoted("landscape");
  } else if (setup.size === "custom") {
    changes.width = String(Math.round(setup.custom.width));
    changes.height = String(Math.round(setup.custom.height));
    return keepWritten(options, changes);
  } else if (setup.size === "4:3") {
    changes.ratio = quoted("4:3");
  }
  const canvas = pageCanvas(setup, width);
  if (canvas.width !== usualCanvas(setup).width) changes.width = String(canvas.width);
  return keepWritten(options, changes);
}

/** Leave out the removal of options that are not written, so only what changes is touched. */
function keepWritten(options: PresentationOptions, changes: Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(changes).filter(([name, code]) => code !== undefined || presentationOption(options, name)));
}

/** The figure() page as it is now. */
export function readFigureSetup(options: PresentationOptions): FigureSetup {
  return {
    width: numberOption(options, "width") ?? 1600,
    height: numberOption(options, "height") ?? 900,
    printWidth: stringOption(options, "printWidth") ?? "170mm",
  };
}

/** The options of figure() that give a setup, leaving out what does not change. */
export function figureChanges(options: PresentationOptions, before: FigureSetup, after: FigureSetup): Record<string, string | undefined> {
  const changes: Record<string, string | undefined> = {};
  if (after.width !== before.width) changes.width = String(after.width);
  if (after.height !== before.height) changes.height = String(after.height);
  if (after.printWidth !== before.printWidth) changes.printWidth = optionString(options, after.printWidth);
  return changes;
}

const units: PageUnit[] = ["px", "mm", "cm", "in"];

function round(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/**
 * Ask for the page of every slide, as PowerPoint's slide size dialog does: a screen ratio, a sheet
 * of paper standing either way, or a size of one's own, and whether the content scales with it.
 * `width` is the canvas's width now. Resolves to the setup chosen, or undefined when cancelled.
 */
export function askPageSetup({ setup, width, poster }: {
  setup: PageSetup;
  width: number;
  poster: boolean;
}): Promise<PageSetup | undefined> {
  return new Promise((resolveAnswer) => {
    const dialog = element("dialog", "studio-dialog studio-page-dialog");
    const form = element("form");
    form.method = "dialog";

    const size = element("select", "studio-select");
    size.setAttribute("aria-label", t.page.size);
    for (const choice of pageSizes) {
      // A poster is made for paper, so it has no screen ratio.
      if (poster && screenSizes.has(choice)) continue;
      size.append(new Option(t.page.sizes[choice] ?? choice, choice));
    }
    size.value = setup.size;

    const orientation = element("div", "studio-page-orientation");
    orientation.setAttribute("role", "radiogroup");
    orientation.setAttribute("aria-label", t.page.orientation);
    const radios = (["portrait", "landscape"] as const).map((value) => {
      const label = element("label", "studio-export-choice");
      const radio = element("input");
      radio.type = "radio";
      radio.name = "orientation";
      radio.value = value;
      radio.checked = setup.orientation === value;
      label.append(radio, element("span", "", t.page[value]));
      orientation.append(label);
      return radio;
    });

    const custom = element("div", "studio-page-custom");
    const number = (value: number, label: string): HTMLInputElement => {
      const input = element("input");
      input.type = "text";
      input.inputMode = "decimal";
      input.value = round(value);
      input.setAttribute("aria-label", label);
      return input;
    };
    const customWidth = number(setup.custom.width, t.page.width);
    const customHeight = number(setup.custom.height, t.page.height);
    const unit = element("select", "studio-select");
    unit.setAttribute("aria-label", t.page.unit);
    for (const choice of units) unit.append(new Option(t.page.units[choice], choice));
    unit.value = setup.custom.unit;
    custom.append(customWidth, element("span", "", "×"), customHeight, unit);

    const keep = element("label", "studio-export-choice studio-page-keep");
    const keepBox = element("input");
    keepBox.type = "checkbox";
    keepBox.checked = setup.keepScale;
    keep.append(keepBox, element("span", "", t.page.keepScale));

    const result = element("p", "studio-dialog-problem is-note");
    const actions = element("div", "studio-dialog-actions");
    const cancel = element("button", "studio-button", t.ui.cancel);
    cancel.type = "button";
    const accept = element("button", "studio-button is-primary", t.page.confirm);
    accept.type = "submit";
    actions.append(cancel, accept);
    const row = (label: string, control: HTMLElement): HTMLElement => {
      const line = element("div", "studio-page-row");
      line.append(element("span", "studio-page-label", label), control);
      return line;
    };
    const customRow = row(t.page.customSize, custom);
    form.append(
      element("h2", "", t.page.title),
      element("p", "", t.page.message),
      row(t.page.size, size),
      customRow,
      row(t.page.orientation, orientation),
      keep,
      result,
      actions,
    );
    dialog.append(form);
    document.body.append(dialog);

    /** The setup the dialog shows now, or why it has none. */
    const reading = (): PageSetup | string => {
      const chosen = size.value as PageSize;
      const sheet = { width: Number(customWidth.value.trim()), height: Number(customHeight.value.trim()), unit: unit.value as PageUnit };
      if (chosen === "custom" && !(sheet.width > 0 && sheet.height > 0)) return t.page.badSize;
      if (chosen === "custom" && poster && sheet.unit === "px") return t.page.posterPaper;
      return {
        size: chosen,
        orientation: radios[1].checked ? "landscape" : "portrait",
        custom: sheet,
        keepScale: keepBox.checked,
      };
    };
    const update = (): void => {
      const chosen = size.value as PageSize;
      const screen = screenSizes.has(chosen);
      customRow.hidden = chosen !== "custom";
      // A screen ratio and a size of one's own already say which way they stand.
      for (const radio of radios) radio.disabled = screen || chosen === "custom";
      const read = reading();
      accept.disabled = typeof read === "string";
      if (typeof read === "string") {
        result.textContent = read;
        result.classList.remove("is-note");
        return;
      }
      result.classList.add("is-note");
      const pixels = chosen === "custom" && read.custom.unit === "px";
      keep.hidden = pixels;
      const canvas = pageCanvas(read, width);
      result.textContent = canvas.printed
        ? t.page.printed(canvas.width, canvas.height, round(canvas.printed.width), round(canvas.printed.height))
        : t.page.canvas(canvas.width, canvas.height);
    };
    for (const control of [size, unit]) control.addEventListener("change", update);
    for (const control of [customWidth, customHeight]) control.addEventListener("input", update);
    for (const control of [...radios, keepBox]) control.addEventListener("change", update);

    let answer: PageSetup | undefined;
    form.addEventListener("submit", (event) => {
      const read = reading();
      if (typeof read === "string") {
        event.preventDefault();
        return;
      }
      answer = read;
    });
    cancel.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolveAnswer(answer);
    }, { once: true });
    dialog.showModal();
    update();
    size.focus();
  });
}

/** Ask for a figure's page: its canvas in units, and how wide it prints in a paper. */
export function askFigureSetup(setup: FigureSetup): Promise<FigureSetup | undefined> {
  return new Promise((resolveAnswer) => {
    const dialog = element("dialog", "studio-dialog studio-page-dialog");
    const form = element("form");
    form.method = "dialog";
    const field = (value: string, label: string): HTMLInputElement => {
      const input = element("input");
      input.type = "text";
      input.value = value;
      input.setAttribute("aria-label", label);
      return input;
    };
    const width = field(String(setup.width), t.page.width);
    const height = field(String(setup.height), t.page.height);
    const printWidth = field(setup.printWidth, t.page.printWidth);
    const presets = element("select", "studio-select");
    presets.setAttribute("aria-label", t.page.printWidth);
    presets.append(new Option(t.page.printOwn, ""), new Option(t.page.printPage, "170mm"), new Option(t.page.printColumn, "85mm"));
    presets.value = ["170mm", "85mm"].includes(setup.printWidth) ? setup.printWidth : "";
    presets.addEventListener("change", () => {
      if (presets.value) printWidth.value = presets.value;
      update();
    });
    const problem = element("p", "studio-dialog-problem");
    const actions = element("div", "studio-dialog-actions");
    const cancel = element("button", "studio-button", t.ui.cancel);
    cancel.type = "button";
    const accept = element("button", "studio-button is-primary", t.page.confirm);
    accept.type = "submit";
    actions.append(cancel, accept);
    const row = (label: string, ...controls: HTMLElement[]): HTMLElement => {
      const line = element("div", "studio-page-row");
      const group = element("div", "studio-page-custom");
      group.append(...controls);
      line.append(element("span", "studio-page-label", label), group);
      return line;
    };
    form.append(
      element("h2", "", t.page.title),
      element("p", "", t.page.figureMessage),
      row(t.page.canvasSize, width, element("span", "", "×"), height),
      row(t.page.printWidth, printWidth, presets),
      problem,
      actions,
    );
    dialog.append(form);
    document.body.append(dialog);
    const reading = (): FigureSetup | string => {
      const next = { width: Number(width.value.trim()), height: Number(height.value.trim()), printWidth: printWidth.value.trim() };
      if (!(next.width > 0 && next.height > 0)) return t.page.badSize;
      if (!/^\d+(?:\.\d+)?\s*(mm|cm|in|pt)$/i.test(next.printWidth)) return t.page.badPrintWidth;
      return next;
    };
    const update = (): void => {
      const read = reading();
      problem.textContent = typeof read === "string" ? read : "";
      accept.disabled = typeof read === "string";
    };
    for (const input of [width, height, printWidth]) input.addEventListener("input", update);
    let answer: FigureSetup | undefined;
    form.addEventListener("submit", (event) => {
      const read = reading();
      if (typeof read === "string") event.preventDefault();
      else answer = read;
    });
    cancel.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolveAnswer(answer);
    }, { once: true });
    dialog.showModal();
    update();
    width.select();
  });
}
