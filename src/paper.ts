import type { FrameSeqNode, PresentationFontOptions } from "./core";
import type { ThemeDefinition } from "./theme";

/*
 * Pages made for paper. Kept apart from the rest of the core so the renderer can resolve
 * printed measurements without bringing the authoring layer along.
 */

/** A sheet of paper by name, or as "width x height" with a unit, such as "36x48in" or "900x1200mm". */
export type PaperSize =
  | "A0"
  | "A1"
  | "A2"
  | "A3"
  | "A4"
  | "A5"
  | "letter"
  | "legal"
  | "tabloid"
  | `${number}x${number}${"mm" | "cm" | "in"}`;

/** The printed size of a presentation made for paper, in millimetres. */
export interface PaperDimensions {
  /** The size as it was asked for, such as "A0" or "36x48in". */
  name: string;
  width: number;
  height: number;
}

const paperSizes: Record<string, [number, number]> = {
  A0: [841, 1189],
  A1: [594, 841],
  A2: [420, 594],
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  letter: [215.9, 279.4],
  legal: [215.9, 355.6],
  tabloid: [279.4, 431.8],
};

const millimetresPer: Record<string, number> = { mm: 1, cm: 10, in: 25.4 };

/** Canvas units across the short side of a page made for paper. */
export const paperCanvasUnits = 1600;

/** The printed size of a paper option, turned the way the orientation asks. */
export function paperDimensions(size: PaperSize, orientation?: "portrait" | "landscape"): PaperDimensions {
  const named = paperSizes[size] ?? Object.entries(paperSizes)
    .find(([name]) => name.toLowerCase() === String(size).toLowerCase())?.[1];
  let width: number;
  let height: number;
  if (named) {
    [width, height] = named;
  } else {
    const match = /^\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(mm|cm|in)\s*$/i.exec(String(size));
    if (!match) {
      throw new Error(
        `presentation() does not know the paper size "${size}". Use one of ${Object.keys(paperSizes).join(", ")}, `
        + `or a size such as "36x48in" or "900x1200mm"`,
      );
    }
    const unit = millimetresPer[match[3].toLowerCase()];
    width = Math.round(Number(match[1]) * unit * 100) / 100;
    height = Math.round(Number(match[2]) * unit * 100) / 100;
    if (width <= 0 || height <= 0) throw new Error(`A paper size needs a positive width and height, not "${size}"`);
  }
  // A named sheet is stated upright; a size written out stands the way it was written.
  if (orientation === "landscape" && width < height) [width, height] = [height, width];
  if (orientation === "portrait" && width > height) [width, height] = [height, width];
  return { name: String(size), width, height };
}

const printUnit = /(-?(?:\d+\.?\d*|\.\d+))(mm|cm|in|pt|pc)\b/g;
const millimetresPerPrintUnit: Record<string, number> = { in: 25.4, cm: 10, mm: 1, pt: 25.4 / 72, pc: 25.4 / 6 };

/**
 * Turn printed measurements in a value, such as "12mm" or "calc(100% - 2cm)", into canvas
 * pixels. On paper a canvas pixel is not a CSS pixel, so CSS's own conversion would be wrong.
 */
export function canvasLength(value: string, pixelsPerMillimetre: number): string {
  return value.replace(printUnit, (_match, amount: string, unit: string) => {
    const pixels = Number(amount) * millimetresPerPrintUnit[unit] * pixelsPerMillimetre;
    return `${Math.round(pixels * 100) / 100}px`;
  });
}

/**
 * Resolve every printed measurement in a presentation made for paper into canvas pixels: the
 * objects' styles, line widths, the presentation's typography, and its theme's spacing. A
 * presentation for the screen keeps CSS's own units, which already print at their size.
 * Running it twice changes nothing more.
 */
export function resolvePrintUnits(root: FrameSeqNode): void {
  const paper = root.props.paper as PaperDimensions | undefined;
  const width = root.props.width;
  if (!paper || typeof width !== "number") return;
  const scale = width / paper.width;
  const convert = (value: unknown): unknown => (typeof value === "string" ? canvasLength(value, scale) : value);
  const visit = (node: FrameSeqNode): void => {
    for (const [property, value] of Object.entries(node.styles)) node.styles[property] = convert(value) as string;
    if (node.type === "line") node.props.strokeWidth = convert(node.props.strokeWidth);
    node.children.forEach(visit);
  };
  visit(root);
  for (const page of Object.values((root.props.masters ?? {}) as Record<string, FrameSeqNode>)) visit(page);

  const font = root.props.font as PresentationFontOptions | undefined;
  if (font) {
    for (const style of [font, font.heading, font.code]) {
      if (style && typeof style.size === "string") style.size = canvasLength(style.size, scale);
    }
  }
  const theme = root.props.theme as ThemeDefinition | undefined;
  if (theme) {
    for (const group of [theme.spacing, theme.radii] as unknown as Array<Record<string, string>>) {
      for (const [key, value] of Object.entries(group)) group[key] = canvasLength(value, scale);
    }
    theme.chrome.titleBarHeight = canvasLength(theme.chrome.titleBarHeight, scale);
    theme.chrome.footerHeight = canvasLength(theme.chrome.footerHeight, scale);
  }
}
