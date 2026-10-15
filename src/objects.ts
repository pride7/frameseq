import { ElementBuilder, type FrameSeqNode } from "./core";
import type { IconName } from "./icon-names";

export type ColumnAlignment = "left" | "center" | "right";
export type TableCell = string | number;

function node(type: FrameSeqNode["type"], props: Record<string, unknown>): FrameSeqNode {
  return { type, props, styles: {}, children: [] };
}

/** A cell that reads as a quantity: a number with an optional currency, unit, or percent sign. */
const quantity = /^\s*[-+−]?\s*[$€£¥]?\s*\d[\d,.\s]*(?:%|×|x|[kKMBG]|ms|s|pt|px|mm)?\s*$/;

/**
 * Columns of quantities read best aligned on their last digit, so a column whose body cells are
 * all numbers is aligned right unless columnAlign() says otherwise.
 */
function automaticAlignment(rows: string[][], header: number): ColumnAlignment[] {
  const columns = Math.max(0, ...rows.map((row) => row.length));
  const body = rows.slice(header);
  return Array.from({ length: columns }, (_, column) => {
    const cells = body.map((row) => row[column] ?? "").filter((cell) => cell.trim());
    return cells.length > 0 && cells.every((cell) => quantity.test(cell)) ? "right" : "left";
  });
}

export class TableBuilder extends ElementBuilder {
  /** How many of the first rows are headings: 1 by default, 0 for a table without one. */
  header(rows = 1): this {
    if (!Number.isInteger(rows) || rows < 0) throw new Error(`header() expects a whole number of rows, not ${rows}`);
    this.node.props.header = rows;
    if (!this.node.props.alignSet) {
      this.node.props.align = automaticAlignment(this.node.props.rows as string[][], rows);
    }
    return this;
  }

  /**
   * Align the text of each column, from the first: "left", "center", or "right". Columns left
   * out keep their automatic alignment, which is right for numbers and left for anything else.
   */
  columnAlign(...alignments: ColumnAlignment[]): this {
    const current = [...this.node.props.align as ColumnAlignment[]];
    alignments.forEach((alignment, index) => {
      if (!["left", "center", "right"].includes(alignment)) {
        throw new Error(`columnAlign() expects "left", "center", or "right", not "${alignment}"`);
      }
      current[index] = alignment;
    });
    this.node.props.align = current;
    this.node.props.alignSet = true;
    return this;
  }

  /** Shade every other body row, which helps the eye along a wide table. */
  striped(enabled = true): this {
    this.node.props.striped = enabled;
    return this;
  }
}

/**
 * Create a detached table. Each row is an array of cells; the first row is the heading. Cells
 * may hold inline math between `$` signs.
 */
export function Table(rows: TableCell[][]): TableBuilder {
  if (!Array.isArray(rows) || rows.length === 0 || rows.some((row) => !Array.isArray(row))) {
    throw new Error("table() expects rows, each an array of cells, such as table([[\"Model\", \"Score\"], [\"Ours\", \"94%\"]])");
  }
  const text = rows.map((row) => row.map((cell) => String(cell ?? "")));
  const header = rows.length > 1 ? 1 : 0;
  return new TableBuilder(node("table", {
    rows: text,
    header,
    align: automaticAlignment(text, header),
    striped: false,
  }));
}

export type ChartKind = "bar" | "hbar" | "line" | "pie" | "donut";

/**
 * Chart data: one series as `{ label: value }`, or several as
 * `{ labels: [...], series: { name: [values, one per label] } }`.
 */
export type ChartData =
  | Record<string, number>
  | { labels: string[]; series: Record<string, number[]> };

export interface ChartSeries {
  name: string;
  values: number[];
}

export class ChartBuilder extends ElementBuilder {
  /** Colour the series, or a pie's slices, in this order; the theme's palette by default. */
  colors(...colors: string[]): this {
    this.node.props.colors = colors;
    return this;
  }

  /** Write values with a unit after them, such as "%" or " ms". */
  unit(suffix: string): this {
    this.node.props.unit = suffix;
    return this;
  }

  /** Show or hide the value written beside each bar, point, or slice. */
  values(show = true): this {
    this.node.props.showValues = show;
    return this;
  }

  /** Show or hide the legend that names each series, or each slice of a pie. */
  legend(show = true): this {
    this.node.props.legend = show;
    return this;
  }

  /** Fix the top of the value axis, so several charts can share one scale. */
  max(value: number): this {
    if (!Number.isFinite(value)) throw new Error(`max() expects a number, not ${value}`);
    this.node.props.max = value;
    return this;
  }
}

const chartKinds: ChartKind[] = ["bar", "hbar", "line", "pie", "donut"];

/** Create a detached chart from data the document states; FrameSeq draws it, and PowerPoint gets an editable chart. */
export function Chart(kind: ChartKind, data: ChartData): ChartBuilder {
  if (!chartKinds.includes(kind)) {
    throw new Error(`chart() does not know "${kind}". Use one of: ${chartKinds.join(", ")}`);
  }
  let labels: string[];
  let series: ChartSeries[];
  if (data && Array.isArray((data as { labels?: unknown }).labels)) {
    const multiple = data as { labels: string[]; series: Record<string, number[]> };
    labels = multiple.labels.map(String);
    series = Object.entries(multiple.series ?? {}).map(([name, values]) => ({ name, values: [...values] }));
  } else if (data && typeof data === "object") {
    labels = Object.keys(data);
    series = [{ name: "", values: Object.values(data as Record<string, number>) }];
  } else {
    throw new Error("chart() expects data such as { Q1: 12, Q2: 18 }, or { labels: [...], series: { name: [...] } }");
  }
  if (labels.length === 0 || series.length === 0) throw new Error("chart() needs at least one label and one value");
  for (const item of series) {
    if (item.values.length !== labels.length) {
      throw new Error(`chart() series "${item.name}" has ${item.values.length} values for ${labels.length} labels`);
    }
    if (item.values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error(`chart() values must be numbers${item.name ? `; series "${item.name}" has one that is not` : ""}`);
    }
  }
  if ((kind === "pie" || kind === "donut") && (series.length > 1 || series[0].values.some((value) => value < 0))) {
    throw new Error(`A ${kind} chart shows one series of values that are not negative`);
  }
  return new ChartBuilder(node("chart", { kind, labels, series }));
}

/** Create a detached QR code for a link or any text. It prints sharp, and phones in the audience can scan it. */
export function Qr(text: string): ElementBuilder {
  if (typeof text !== "string" || !text) throw new Error("qr() expects the text or link to encode");
  return new ElementBuilder(node("qr", { text }));
}

/**
 * The icons the deck's build made available, keyed by name. A preview has every icon; a built
 * presentation carries only the names its source states, unless it builds a name at runtime.
 */
interface IconRegistry {
  __frameseqIcons?: Record<string, string>;
  __frameseqIconsComplete?: boolean;
}

/** Create a detached icon from the Lucide set, drawn in the current text colour at the current font size. */
export function Icon(name: IconName): ElementBuilder {
  const registry = globalThis as IconRegistry;
  const svg = registry.__frameseqIcons?.[name];
  if (registry.__frameseqIcons && svg === undefined) {
    throw new Error(registry.__frameseqIconsComplete
      ? `icon() does not know "${name}". Browse the names at https://lucide.dev/icons`
      : `icon("${name}") is not in this build. Write icon names as strings in the source, so the build can include them`);
  }
  return new ElementBuilder(node("icon", { name, ...(svg === undefined ? {} : { svg }) }));
}
