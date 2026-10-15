export type SlideLayoutId =
  | "title-text"
  | "bullets"
  | "section"
  | "two-columns"
  | "metrics"
  | "code"
  | "formula"
  | "table"
  | "chart"
  | "flow"
  | "steps"
  | "closing";

export interface SlideLayoutSource {
  id: SlideLayoutId;
  /** The lines the layout inserts. */
  source: string;
  /** The placeholder selected once they are in, so typing replaces it. */
  select: string;
}

export function slideLayoutSources(language?: "en" | "zh"): SlideLayoutSource[];
