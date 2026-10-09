export interface LayoutIssue {
  severity: "error" | "warning";
  rule: string;
  slide: { index: number; label: string };
  element: {
    type: string;
    path: string;
    text: string;
    /** Present only when the deck was rendered by a development server. */
    source?: { line: number; column: number };
  };
  message: string;
  details: Record<string, unknown>;
  suggestions: string[];
}

export interface LayoutCheckResult {
  canvas: { width: number; height: number };
  slides: number;
  issues: LayoutIssue[];
}

export function collectLayoutIssues(win?: Window): LayoutCheckResult;
