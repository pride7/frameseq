import { EditorSelection, type Text, type TransactionSpec } from "@codemirror/state";
import type { InspectSlide } from "./api";
import type { SlideGroup } from "./outline";

/** A group's lines, always ending with a line break. */
function blockText(doc: Text, group: SlideGroup): string {
  const text = doc.sliceString(group.from, group.to);
  return text.endsWith("\n") ? text : `${text}\n`;
}

/**
 * Text to put at a position so that it starts on a line of its own, after a blank line, and
 * leaves a blank line before whatever follows it.
 */
function spaced(doc: Text, position: number, text: string): string {
  const before = doc.sliceString(Math.max(0, position - 2), position);
  const lead = position === 0 || before.endsWith("\n\n") ? "" : (before.endsWith("\n") ? "\n" : "\n\n");
  let body = text.replace(/\n+$/, "\n");
  if (position < doc.length && doc.sliceString(position, position + 1).trim()) body += "\n";
  return `${lead}${body}`;
}

const leadingBreaks = (text: string): number => text.length - text.replace(/^\n+/, "").length;

const newSlideTitle = "New slide";
const newSlide = `slide(${JSON.stringify(newSlideTitle)});\ntext("Your point here.");\n`;

/** Add a slide after the given group, or before the first when there is none, title selected. */
export function insertSlide(doc: Text, groups: SlideGroup[], after: number): TransactionSpec {
  const position = groups[after]?.to ?? groups[0]?.from ?? doc.length;
  const insert = spaced(doc, position, newSlide);
  const title = position + insert.indexOf(newSlideTitle);
  return {
    changes: { from: position, insert },
    selection: EditorSelection.single(title, title + newSlideTitle.length),
    scrollIntoView: true,
    userEvent: "input.slide.insert",
  };
}

/** Repeat a group's lines after it; a loop or a helper call repeats every slide it makes. */
export function duplicateSlide(doc: Text, group: SlideGroup): TransactionSpec {
  const insert = spaced(doc, group.to, blockText(doc, group));
  return {
    changes: { from: group.to, insert },
    selection: EditorSelection.cursor(group.to + leadingBreaks(insert)),
    scrollIntoView: true,
    userEvent: "input.slide.duplicate",
  };
}

export function deleteSlide(group: SlideGroup): TransactionSpec {
  return {
    changes: { from: group.from, to: group.to },
    selection: EditorSelection.cursor(group.from),
    scrollIntoView: true,
    userEvent: "delete.slide",
  };
}

/**
 * Carry a group's lines to before the group at `to`, or after the last group when `to` is past
 * the end. Both changes are stated against the document as it stands.
 */
export function moveSlide(doc: Text, groups: SlideGroup[], from: number, to: number): TransactionSpec | undefined {
  const group = groups[from];
  if (!group || to < 0 || to > groups.length || to === from || to === from + 1) return undefined;
  const text = blockText(doc, group);
  const target = to < groups.length ? groups[to].from : groups[groups.length - 1].to;
  // Put before another group, the lines keep a blank line between them and it.
  const insert = to < groups.length
    ? (/\n[ \t]*\n$/.test(text) ? text : `${text}\n`)
    : spaced(doc, target, text);
  const changes = [
    { from: group.from, to: group.to, insert: "" },
    { from: target, insert },
  ].sort((a, b) => a.from - b.from);
  const landed = (target < group.from ? target : target - (group.to - group.from)) + leadingBreaks(insert);
  return {
    changes,
    selection: EditorSelection.cursor(landed),
    scrollIntoView: true,
    userEvent: "move.slide",
  };
}

export interface BindingPlan {
  from: number;
  to: number;
  /** The region the objects were written in, which the lines after them return to. */
  region: string;
  taken: Set<string>;
  suggestion: string;
}

/**
 * Check that objects selected in the preview can be bound into one named region, the way the
 * VS Code extension does it: top-level objects, on one slide, in one region, written one after
 * another. Returns the reason when they cannot.
 */
export function planBinding(doc: Text, slides: InspectSlide[], starts: number[]): BindingPlan | string {
  const wanted = new Set(starts);
  const selected = slides.flatMap((slide) => slide.objects.map((object) => ({ slide, object })))
    .filter(({ object }) => object.source.start !== undefined && wanted.has(object.source.start));
  if (selected.length < 2 || selected.length !== wanted.size || selected.some(({ object }) => object.parentId)) {
    return "Select at least two top-level objects from one region; nested objects cannot be bound.";
  }
  const [{ slide, object: first }] = selected;
  if (selected.some(({ slide: other, object }) => other !== slide || object.region !== first.region)) {
    return "The selected objects must belong to one slide and one region.";
  }
  const siblings = slide.objects
    .filter((object) => !object.parentId && object.region === first.region)
    .sort((a, b) => (a.source.start ?? 0) - (b.source.start ?? 0));
  const positions = selected.map(({ object }) => siblings.indexOf(object)).sort((a, b) => a - b);
  if (positions.some((position) => position < 0) || positions[positions.length - 1] - positions[0] + 1 !== positions.length) {
    return "The selected objects must be written one after another; select the ones between them too.";
  }
  const start = siblings[positions[0]].source.start ?? 0;
  const end = siblings[positions[positions.length - 1]].source.end ?? start;
  const lastLine = doc.lineAt(Math.min(end, doc.length)).number;
  const taken = new Set((slide.regions ?? []).map((region) => region.path));
  const prefix = first.region === "main" ? "" : `${first.region}/`;
  let suggestion = `${prefix}group`;
  for (let index = 2; taken.has(suggestion); index += 1) suggestion = `${prefix}group${index}`;
  return {
    from: doc.lineAt(start).from,
    to: lastLine < doc.lines ? doc.line(lastLine + 1).from : doc.length,
    region: first.region,
    taken,
    suggestion,
  };
}

/** Wrap the planned lines in a named column, then return to the region they came from. */
export function bindRegion(doc: Text, plan: BindingPlan, path: string): TransactionSpec {
  const text = doc.sliceString(plan.from, plan.to);
  const indentation = /^[ \t]*/.exec(text)?.[0] ?? "";
  const restore = plan.region === "main" ? "main();" : `at(${JSON.stringify(plan.region)});`;
  const opening = `${indentation}at(${JSON.stringify(path)}).column();\n`;
  const closing = text.endsWith("\n") ? `${indentation}${restore}\n` : `\n${indentation}${restore}`;
  const name = plan.from + opening.indexOf(path);
  return {
    changes: { from: plan.from, to: plan.to, insert: `${opening}${text}${closing}` },
    selection: EditorSelection.single(name, name + path.length),
    scrollIntoView: true,
    userEvent: "input.region.bind",
  };
}
