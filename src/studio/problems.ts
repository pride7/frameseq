import { element } from "./ui";

export type ProblemSource = "build" | "runtime" | "typescript" | "layout";

export interface Problem {
  source: ProblemSource;
  severity: "error" | "warning" | "info";
  message: string;
  /** A suggestion or a code frame, shown under the message. */
  detail?: string;
  /** A rule name or a TypeScript error code. */
  code?: string;
  /** The slide the problem was measured on, counted from 0. */
  slideIndex?: number;
  slideLabel?: string;
  /** Editor positions, for problems found in the text itself. */
  from?: number;
  to?: number;
  /** The line that wrote the object, for problems found in the rendered deck. */
  line?: number;
  column?: number;
  path?: string;
}

const sourceOrder: ProblemSource[] = ["build", "runtime", "typescript", "layout"];
const severityOrder = ["error", "warning", "info"] as const;
const sourceLabels: Record<ProblemSource, string> = {
  build: "Build",
  runtime: "Preview",
  typescript: "TypeScript",
  layout: "Layout",
};

/**
 * Everything wrong with the deck in one list: what the server could not compile, what the
 * preview could not run, what TypeScript reports, and what the layout check measured. Each
 * source replaces only its own entries, since each is refreshed on its own schedule.
 */
export class ProblemsPanel {
  private readonly bySource = new Map<ProblemSource, Problem[]>();

  constructor(
    private readonly list: HTMLElement,
    private readonly onSelect: (problem: Problem) => void,
    private readonly onCounts: (errors: number, warnings: number) => void,
  ) {
    this.render();
  }

  set(source: ProblemSource, problems: Problem[]): void {
    this.bySource.set(source, problems);
    this.render();
  }

  get(source: ProblemSource): Problem[] {
    return this.bySource.get(source) ?? [];
  }

  private render(): void {
    const problems = sourceOrder.flatMap((source) => this.get(source))
      .sort((a, b) => (
        severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)
        || sourceOrder.indexOf(a.source) - sourceOrder.indexOf(b.source)
        || (a.slideIndex ?? -1) - (b.slideIndex ?? -1)
        || (a.line ?? a.from ?? 0) - (b.line ?? b.from ?? 0)
      ));
    const errors = problems.filter((problem) => problem.severity === "error").length;
    const warnings = problems.filter((problem) => problem.severity === "warning").length;
    this.onCounts(errors, warnings);

    if (problems.length === 0) {
      const empty = element("div", "studio-problems-empty");
      empty.append(
        element("strong", "", "No problems"),
        element("span", "", "TypeScript and the layout check are both clean."),
      );
      this.list.replaceChildren(empty);
      return;
    }

    this.list.replaceChildren(...problems.map((problem) => {
      const row = element("button", `studio-problem is-${problem.severity}`);
      row.type = "button";
      const icon = element("span", "studio-problem-icon", problem.severity === "error" ? "●" : (problem.severity === "warning" ? "▲" : "ℹ"));
      icon.setAttribute("aria-label", problem.severity);
      const body = element("span", "studio-problem-body");
      body.append(element("span", "studio-problem-message", problem.message));
      if (problem.detail) body.append(element("span", "studio-problem-detail", problem.detail));
      const meta = element("span", "studio-problem-meta");
      const parts = [
        sourceLabels[problem.source] + (problem.code ? ` ${problem.code}` : ""),
        problem.slideIndex !== undefined ? `Slide ${problem.slideIndex + 1}` : undefined,
        problem.line !== undefined ? `Ln ${problem.line}` : undefined,
      ].filter(Boolean);
      meta.textContent = parts.join(" · ");
      row.append(icon, body, meta);
      row.title = [problem.message, problem.detail].filter(Boolean).join("\n\n");
      row.addEventListener("click", () => this.onSelect(problem));
      return row;
    }));
  }
}
