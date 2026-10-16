import {
  Cells,
  CellsBuilder,
  type CellValue,
  Circle,
  Code,
  Column,
  Equation,
  Image,
  Junction,
  Latex,
  type SlidesOptions,
  ElementBuilder,
  type FrameSeqNode,
  Line,
  LineBuilder,
  type LinePoints,
  type Length,
  Polygon,
  resolvePrintUnits,
  Rect,
  Shape,
  ShapeBuilder,
  Slide,
  Spacer,
  Text,
  Typst,
  type SlideOptions,
} from "./core";
import {
  Card,
  Bullets,
  ContentSlideBuilder,
  GridSection,
  type GridColumns,
  type GridSectionBuilder,
  Group,
  type GroupBuilder,
  MasterBuilder,
  masterName,
  Metric,
  RegionBuilder,
  Slides,
  type SlidesDefinition,
  Steps,
} from "./semantic";
import { attachNode, detachNode, nodeParent } from "./node-tree";
import { DocumentError, type DocumentProblem } from "./anchors";
import {
  Chart,
  type ChartBuilder,
  type ChartData,
  type ChartKind,
  Icon,
  Qr,
  Table,
  type TableBuilder,
  type TableCell,
} from "./objects";
import type { IconName } from "./icon-names";
import { defineTheme, type ThemeInput } from "./theme";
import type { PolygonPoints, ShapeKind } from "./shapes";
import {
  type Bibliography,
  type CitationOptions,
  citationLabel,
  citationMarker,
  formatReference,
  similarKeys,
  superscript,
} from "./citations";

let activeSlides: SlidesDefinition | undefined;
let activeSlide: ContentSlideBuilder | undefined;
let activeRegion: RegionBuilder | undefined;
/** The master page being written, from master() until the next slide() or master(). */
let activeMaster: string | undefined;
/** The top-level statement of the slide document running now, while a preview is served. */
let runningStatement: { start: number; end: number } | undefined;

/**
 * @internal Records which top-level statement of the slide document is about to run. The
 * development transform calls this before each one, so a slide made inside a loop or a helper
 * function still knows the statement that made it, and an editor can move that statement whole.
 */
export function markStatement(start: number, end: number): void {
  runningStatement = { start, end };
  // A document that stops with an error stops inside the statement announced last, so the
  // preview and the CLI read it from here to say which line the error came from.
  (globalThis as FailedStatementHolder).__frameseqStatement = runningStatement;
}

/** Where the statement running now is kept for whoever reports an error the document threw. */
interface FailedStatementHolder {
  __frameseqStatement?: { start: number; end: number };
}

const textRoles = [
  "frameseq-body-copy",
  "frameseq-slide-title",
  "frameseq-cover-title",
  "frameseq-cover-subtitle",
  "frameseq-cover-author",
  "frameseq-cover-eyebrow",
  "frameseq-slide-lead",
  "frameseq-caption",
  "frameseq-quote",
];

function currentSlide(): ContentSlideBuilder {
  if (!activeSlide) {
    throw new Error("Create a slide with slide() before adding content");
  }
  return activeSlide;
}

function currentRegion(): RegionBuilder {
  return activeRegion ?? currentSlide().defaultContent;
}

function attach<T extends ElementBuilder>(element: T): T {
  currentRegion().add(element);
  return element;
}

function regroup<T extends ElementBuilder>(
  container: T,
  items: ElementBuilder[],
  command: string,
): T {
  if (items.length === 0) throw new Error(`${command} requires at least one item`);

  const parent = currentRegion().node;
  const nodes = items.map((item) => item.node);
  if (new Set(nodes).size !== nodes.length) {
    throw new Error(`${command} cannot contain the same object more than once`);
  }

  if (nodes.some((node) => nodeParent(node) !== parent)) {
    throw new Error(`${command} objects must belong to the current layout region`);
  }

  const selected = new Set(nodes);
  const firstAttachedIndex = parent.children.findIndex((child) => selected.has(child));
  const insertionIndex = firstAttachedIndex < 0 ? parent.children.length : firstAttachedIndex;
  for (const node of nodes) detachNode(node);
  for (const node of nodes) attachNode(container.node, node);
  attachNode(parent, container.node, insertionIndex);
  return container;
}

export class TextBoxBuilder extends ElementBuilder {
  private role(className: string): this {
    const classes = typeof this.node.props.className === "string"
      ? this.node.props.className.split(/\s+/).filter(Boolean)
      : [];
    this.node.props.className = classes
      .filter((name) => !textRoles.includes(name))
      .join(" ");
    return this.className(className);
  }

  /**
   * Style the text as a normal paragraph, the default role. The last role called on a text object
   * wins.
   */
  body(): this {
    return this.role("frameseq-body-copy");
  }

  /**
   * Style the text as a manually placed slide heading. The last role called on a text object wins.
   */
  title(): this {
    return this.role("frameseq-slide-title");
  }

  /**
   * Style the text as the primary title of a cover or section slide. The last role called on a text
   * object wins.
   */
  hero(): this {
    return this.role("frameseq-cover-title");
  }

  /**
   * Style the text as supporting copy below a hero title. The last role called on a text object
   * wins.
   */
  subtitle(): this {
    return this.role("frameseq-cover-subtitle");
  }

  /**
   * Style the text as an author or presenter name. The last role called on a text object wins.
   */
  author(): this {
    return this.role("frameseq-cover-author");
  }

  /**
   * Style the text as a small uppercase section label. The last role called on a text object wins.
   */
  eyebrow(): this {
    const content = this.node.props.content;
    if (typeof content === "string") this.node.props.content = content.toUpperCase();
    return this.role("frameseq-cover-eyebrow");
  }

  /**
   * Style the text as the leading statement of a content slide. The last role called on a text
   * object wins.
   */
  lead(): this {
    return this.role("frameseq-slide-lead");
  }

  /**
   * Style the text as a source note, footnote, or image caption. The last role called on a text
   * object wins.
   */
  caption(): this {
    return this.role("frameseq-caption");
  }

  /** Style the text as a short quotation. The last role called on a text object wins. */
  quote(): this {
    return this.role("frameseq-quote");
  }
}

/** Start a new linear slide document. Calling this resets the authoring context. */
export function presentation(titleOrOptions: string | SlidesOptions = {}): SlidesDefinition {
  activeSlides = Slides(titleOrOptions);
  activeSlide = undefined;
  activeRegion = undefined;
  activeMaster = undefined;
  pathRegions.clear();
  citationNumbers.clear();
  referenceLists.length = 0;
  resetSlideNotes();
  return activeSlides;
}

/** Used by the document compiler to export a zero-boilerplate slide file. */
export function getActivePresentation(): SlidesDefinition {
  if (!activeSlides) {
    throw new Error("This slide document must begin with presentation()");
  }
  // The document has finished running; the next run announces its own statements.
  runningStatement = undefined;
  delete (globalThis as FailedStatementHolder).__frameseqStatement;
  fillReferenceLists();
  checkMasterNames(activeSlides);
  resolvePrintUnits(activeSlides.node);
  return activeSlides;
}

/**
 * Every master a slide asks for by name exists. Checked once the document has run, since a
 * master may be written after the slides that use it.
 */
function checkMasterNames(slides: SlidesDefinition): void {
  const known = Object.keys(slides.masters);
  const problems: DocumentProblem[] = [];
  for (const [index, slide] of slides.slides.entries()) {
    const wanted = slide.props.master;
    if (typeof wanted !== "string" || known.includes(wanted)) continue;
    const span = slide.props.sourceSpan as { start: number; end: number } | undefined;
    const listed = known.length === 0
      ? "it defines none"
      : `it defines ${known.map((name) => `"${name}"`).join(", ")}`;
    problems.push({
      message: `Slide ${index + 1} asks for master("${wanted}"), which this presentation does not define; ${listed}`,
      ...(span ? { start: span.start, end: span.end } : {}),
    });
  }
  if (problems.length > 0) throw new DocumentError(problems.map((problem) => problem.message).join("\n"), problems);
}

/**
 * Start a poster: a presentation made for paper, A0 portrait in the poster theme unless the
 * options say otherwise, with its one page already begun. Lay the page out as on a slide.
 * @example poster({ title: "Diffusion Language Models", author: "Ada Lovelace" }).grid(3);
 */
export function poster(titleOrOptions: string | SlidesOptions = {}): ContentSlideBuilder {
  const options = typeof titleOrOptions === "string" ? { title: titleOrOptions } : titleOrOptions;
  // A poster lists its sources in a references() block of its own, not again at its foot.
  presentation({ size: "A0", theme: "poster", ...options, citations: { footnotes: false, ...options.citations } });
  return slide({ name: "Poster" });
}

/** What figure() takes: the canvas, how wide it prints, and how it looks. */
export interface FigureOptions {
  title?: string;
  /** Canvas units across, 1600 by default. */
  width?: number;
  /** Canvas units down, 900 by default. */
  height?: number;
  /**
   * How wide the figure prints, as on the page of a paper: "170mm" by default, across a page,
   * or "85mm" for one column; centimetres, inches, and points work too.
   */
  printWidth?: string;
  theme?: ThemeInput;
  font?: SlidesOptions["font"];
  background?: string;
}

const millimetresPerUnit: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72 };

/**
 * Start a figure for a paper: one canvas with no margins, no title bar, and no page number,
 * printed at the width it will have on the page, so pdf gives a page of exactly that size and
 * the layout check judges type by the points it prints at. Draw on it as on a canvas slide.
 * @example figure({ title: "Method", width: 1600, height: 820 });
 */
export function figure(titleOrOptions: string | FigureOptions = {}): ContentSlideBuilder {
  const options = typeof titleOrOptions === "string" ? { title: titleOrOptions } : titleOrOptions;
  const width = options.width ?? 1600;
  const height = options.height ?? 900;
  if (!(width > 0) || !(height > 0)) throw new Error(`figure() needs a positive width and height, not ${width} x ${height}`);
  const printed = /^\s*(\d+(?:\.\d+)?)\s*(mm|cm|in|pt)\s*$/i.exec(options.printWidth ?? "170mm");
  if (!printed) {
    throw new Error(`figure() expects printWidth as a length such as "170mm", "8.5cm", or "6.5in", not "${options.printWidth}"`);
  }
  const across = Number(printed[1]) * millimetresPerUnit[printed[2].toLowerCase()];
  const round = (value: number): number => Math.round(value * 100) / 100;
  const theme = defineTheme({
    name: "figure",
    extends: options.theme ?? "blank",
    spacing: { slideX: "0px", slideY: "0px" },
    chrome: { titleBar: false, footer: false, slideNumber: false, header: false, autoTitlePage: false },
  });
  const document = presentation({
    title: options.title ?? "Figure",
    size: `${round(across)}x${round((across * height) / width)}mm`,
    width,
    height,
    theme,
    font: options.font,
    background: options.background,
  });
  // The renderer and the layout check read it: type is judged as it prints in a paper.
  document.node.props.figure = true;
  return slide({ name: options.title ?? "Figure" }).canvas();
}

/** Start a slide. Content commands belong to it until the next slide() call. */
export function slide(nameOrOptions: string | SlideOptions = {}): ContentSlideBuilder {
  if (!activeSlides) {
    throw new Error("Create a presentation with presentation() before calling slide()");
  }
  activeSlide = activeSlides.slide(nameOrOptions);
  if (runningStatement) activeSlide.node.props.sourceStatement = runningStatement;
  activeRegion = undefined;
  activeMaster = undefined;
  pathRegions.clear();
  resetSlideNotes();
  return activeSlide;
}

/**
 * Start a master page: the objects that follow, until the next slide() or master(), are drawn
 * behind every slide that uses it, as a slide master is in PowerPoint. Covers use the master
 * named "cover" and other slides the one named "content"; slide().master(name) picks another.
 * Place objects with .position(), and mark where each slide's own content goes with placeholder().
 * Text on a master may show {title}, {subtitle}, {author}, {institute}, {date}, {page}, {total},
 * and {slide}, the slide's own title.
 * @example master("content");
 * text("{page} / {total}").position({ x: 1140, y: 680 }).caption();
 */
export function master(name: string): MasterBuilder {
  if (!activeSlides) {
    throw new Error("Create a presentation with presentation() before calling master()");
  }
  if (typeof name !== "string" || !masterName.test(name)) {
    throw new Error(
      `master() expects a name such as "cover", "content", or "section": `
      + `letters, digits, "_" and "-", starting with a letter`,
    );
  }
  const masters = (activeSlides.node.props.masters ??= {}) as Record<string, FrameSeqNode>;
  if (masters[name]) {
    throw new Error(`master("${name}") is written twice; a presentation has one master of each name`);
  }
  const page = new MasterBuilder(Slide({ name }).className("frameseq-master-page").node);
  page.node.props.masterPage = name;
  if (runningStatement) page.node.props.sourceStatement = runningStatement;
  masters[name] = page.node;
  // Written to like a slide, so regions, names, and every content command work on it as well.
  activeSlide = new ContentSlideBuilder(page.node, new RegionBuilder(page.node));
  activeRegion = undefined;
  activeMaster = name;
  pathRegions.clear();
  resetSlideNotes();
  return page;
}

/** What a placeholder holds of the slides drawn on its master. */
export type PlaceholderRole = "body" | "title" | "subtitle" | "author";
const placeholderRoles: readonly PlaceholderRole[] = ["body", "title", "subtitle", "author"];

/**
 * Mark, on a master page, where the slides drawn on it put their own content: "body", the
 * default, for everything they hold; "title" for a slide's title or a cover's hero; "subtitle"
 * and "author" for a cover's. Give it .position(), .width(), and .height(); text settings on a
 * title, subtitle, or author placeholder, such as .size() and .color(), style that text on every
 * slide, unless the slide sets them itself.
 * @example placeholder("title").position({ x: 60, y: 30 }).width(1160).height(80).color("#1e3a8a");
 */
export function placeholder(role: PlaceholderRole = "body"): ElementBuilder {
  if (!activeMaster || !activeSlide) {
    throw new Error(
      `placeholder() marks where a slide's content goes on a master page; `
      + `call master("cover") or master("content") first`,
    );
  }
  if (!placeholderRoles.includes(role)) {
    throw new Error(`placeholder() expects "body", "title", "subtitle", or "author", not "${String(role)}"`);
  }
  const page = activeSlide.node;
  if (page.children.some((child) => child.props.placeholder === role)) {
    throw new Error(`master("${activeMaster}") already has a ${role} placeholder`);
  }
  const element = Column().className("frameseq-placeholder");
  element.node.props.placeholder = role;
  // Always on the page itself, so its coordinates are the slide's, whatever region is current.
  attachNode(page, element.node);
  return element;
}

/**
 * Add speaker notes to the current slide, the same as slide().notes(content).
 * Repeated calls append a line, so a note can stay beside the content it explains.
 */
export function note(content: string): ContentSlideBuilder {
  const slide = currentSlide();
  const existing = slide.node.props.notes;
  return slide.notes(
    typeof existing === "string" && existing ? `${existing}\n${content}` : content,
  );
}

/**
 * Add a text object to the current region.
 *
 * Inline `$...$` renders as math. Write it as a tagged template, text`...`, to keep LaTeX
 * backslashes intact. Roles such as `.lead()`, `.hero()`, and `.caption()` set its typography.
 * @example text("Latency fell by 42%.").lead();
 */
export function text(content: string): TextBoxBuilder;
/**
 * Add a text object to the current region.
 *
 * Inline `$...$` renders as math. Write it as a tagged template, text`...`, to keep LaTeX
 * backslashes intact. Roles such as `.lead()`, `.hero()`, and `.caption()` set its typography.
 * @example text("Latency fell by 42%.").lead();
 */
export function text(strings: TemplateStringsArray, ...values: unknown[]): TextBoxBuilder;
export function text(
  contentOrStrings: string | TemplateStringsArray,
  ...values: unknown[]
): TextBoxBuilder {
  const content = typeof contentOrStrings === "string"
    ? contentOrStrings
    : String.raw(contentOrStrings, ...values);
  return attach(new TextBoxBuilder(Text(content).node).body());
}

/**
 * Add an image to the current region.
 * @param src An imported asset URL, a data URL, or a public URL.
 * @param alt Alternative text for screen readers; empty by default.
 */
export function image(src: string, alt = ""): ElementBuilder {
  return attach(Image(src, alt).className("frameseq-semantic-image"));
}

/**
 * Add a preformatted code block.
 * @param content The code, shown exactly as written.
 * @param language A language label, "ts" by default.
 */
export function code(content: string, language = "ts"): ElementBuilder {
  return attach(Code(content, language).className("frameseq-semantic-code"));
}

/**
 * Add one standalone equation, rendered with KaTeX.
 *
 * Write the equation without `$$` delimiters; the tagged form, math`...`, keeps backslashes
 * intact. For a formula inside a sentence, use `$...$` in text() instead.
 */
export function math(content: string): ElementBuilder;
/**
 * Add one standalone equation, rendered with KaTeX.
 *
 * Write the equation without `$$` delimiters; the tagged form, math`...`, keeps backslashes
 * intact. For a formula inside a sentence, use `$...$` in text() instead.
 */
export function math(strings: TemplateStringsArray, ...values: unknown[]): ElementBuilder;
export function math(
  contentOrStrings: string | TemplateStringsArray,
  ...values: unknown[]
): ElementBuilder {
  const content = typeof contentOrStrings === "string"
    ? contentOrStrings
    : String.raw(contentOrStrings, ...values);
  return attach(Equation(content).className("frameseq-semantic-math"));
}

/** Add a static Typst fragment. The FrameSeq Vite pipeline compiles it at build time. */
export function typst(content: string): ElementBuilder;
export function typst(strings: TemplateStringsArray): ElementBuilder;
export function typst(contentOrStrings: string | TemplateStringsArray): ElementBuilder {
  const content = typeof contentOrStrings === "string"
    ? contentOrStrings
    : String.raw(contentOrStrings);
  return attach(Typst(content).className("frameseq-semantic-typst"));
}

/** Add a Typst fragment from a file relative to the slide document. */
export function typstFile(path: string): ElementBuilder {
  const element = Typst("").className("frameseq-semantic-typst");
  element.node.props.file = path;
  return attach(element);
}

/** @internal Used by the build-time Typst transform. */
export function typstSvg(svg: string, source: string): ElementBuilder {
  return attach(Typst(source, svg).className("frameseq-semantic-typst"));
}

/** Add a static LaTeX fragment. The FrameSeq Vite pipeline compiles it at build time. */
export function latex(content: string): ElementBuilder;
export function latex(strings: TemplateStringsArray): ElementBuilder;
export function latex(contentOrStrings: string | TemplateStringsArray): ElementBuilder {
  const content = typeof contentOrStrings === "string"
    ? contentOrStrings
    : String.raw(contentOrStrings);
  return attach(Latex(content).className("frameseq-semantic-latex"));
}

/** Add a LaTeX fragment from a file relative to the slide document. */
export function latexFile(path: string): ElementBuilder {
  const element = Latex("").className("frameseq-semantic-latex");
  element.node.props.file = path;
  return attach(element);
}

/** @internal Used by the build-time LaTeX transform. */
export function latexSvg(svg: string, source: string): ElementBuilder {
  return attach(Latex(source, svg).className("frameseq-semantic-latex"));
}

/** Add a rectangular diagram node, optionally containing a label. */
export function rect(label = ""): ShapeBuilder {
  return attach(Rect(label).className("frameseq-semantic-shape"));
}

/** Add a circular diagram node, optionally containing a label. */
export function circle(label = ""): ShapeBuilder {
  return attach(Circle(label).className("frameseq-semantic-shape"));
}

/**
 * Add a diagram shape, optionally with a label: "diamond", "cylinder", "cloud", "arrow-right",
 * and two dozen more. Each one exports to PowerPoint as its native shape.
 * @example shape("diamond", "Valid?").as("check").tone("amber");
 */
export function shape(kind: ShapeKind, label = ""): ShapeBuilder {
  return attach(Shape(kind, label).className("frameseq-semantic-shape"));
}

/**
 * Add a polygon through the given corners, optionally with a label. The corners are pixels from
 * any origin: the polygon is as large as they span and stretches with width() and height().
 * It exports to PowerPoint as an editable freeform shape.
 * @example polygon([[0, 0], [60, 45], [60, 155], [0, 200]], "Encoder").position({ x: 200, y: 120 });
 */
export function polygon(points: PolygonPoints, label = ""): ShapeBuilder {
  return attach(Polygon(points, label).className("frameseq-semantic-shape"));
}

/**
 * Add a junction: a small dot where connectors meet or split, such as the point a skip
 * connection leaves the main path, or, given a sign such as "+" or "×", the small round
 * operator where streams are added or multiplied. Name it, place it, and connect to it like
 * any object.
 * @example junction().as("split").below("attention", 30);
 * @example junction("+").as("add").above("embedding", 40);
 */
export function junction(sign = ""): ShapeBuilder {
  return attach(Junction(sign).className("frameseq-semantic-shape"));
}

/**
 * Add a row of equal cells from a list of values, or a grid of them from rows: a number from 0
 * to 1 shades its cell in the tone, from a faint tint to the full colour; words are written in
 * a neutral cell; null is a masked cell. Use it for tokens, embeddings, codes, attention masks,
 * and similarity matrices.
 * @example cells([0.3, 0.9, 0.1, 0.6]).tone("amber").as("codes").position({ x: 340, y: 380 });
 * @example cells(Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => (r === c ? 1 : 0.1)))).tone("indigo").cell(72);
 */
export function cells(values: CellValue[] | CellValue[][]): CellsBuilder {
  return attach(Cells(values).className("frameseq-semantic-cells"));
}

/** Add a canvas-relative vector line or connector. Omit the points when using from()/to(). */
export function line(points: Partial<LinePoints> = {}): LineBuilder {
  return attach(Line(points).className("frameseq-semantic-line"));
}

/**
 * Add an unordered list whose items are all visible at once.
 * @example bullets("Readable source", "Useful defaults", "Portable output");
 */
export function bullets(...items: string[]): ElementBuilder {
  return attach(Bullets(...items));
}

/**
 * Add a numbered list revealed one item per step. Print, PDF, and PPTX show every item.
 * @example steps("Parse the source", "Build the slide tree", "Render the result");
 */
export function steps(...items: string[]): ElementBuilder {
  return attach(Steps(...items));
}

/**
 * Show a prominent value with a short label beneath it.
 * @param value The value to emphasise, such as "42%"; it is shown as written.
 * @param label What the value means.
 * @example metric("42%", "Revenue growth").card();
 */
export function metric(value: string, label: string): GroupBuilder {
  return attach(Metric(value, label));
}

/**
 * Add a table. The first row is the heading; columns of numbers align right.
 * @param rows Each row as an array of cells. Cells may hold inline math between `$` signs.
 * @example table([["Model", "Accuracy"], ["Baseline", "91.2%"], ["Ours", "94.6%"]]);
 */
export function table(rows: TableCell[][]): TableBuilder {
  return attach(Table(rows).className("frameseq-semantic-table"));
}

/**
 * Add a chart drawn from the data written here. PowerPoint export makes it an editable chart.
 * @param kind "bar", "hbar", "line", "pie", or "donut".
 * @param data One series as { label: value }, or several as { labels: [...], series: { name: [values] } }.
 * @example chart("bar", { Q1: 12, Q2: 18, Q3: 25 }).unit("%");
 */
export function chart(kind: ChartKind, data: ChartData): ChartBuilder {
  return attach(Chart(kind, data).className("frameseq-semantic-chart"));
}

/**
 * Add a QR code for a link or any text, so the audience can open it from their phones.
 * @example qr("https://pride7.github.io/frameseq/").width(220);
 */
export function qr(text: string): ElementBuilder {
  return attach(Qr(text).className("frameseq-semantic-qr"));
}

/**
 * Add an icon from the Lucide set, drawn in the text colour at the font size; set them with
 * .color() and .size(). Browse the names at https://lucide.dev/icons.
 * @example icon("rocket").size(64).color("#2563eb");
 */
export function icon(name: IconName): ElementBuilder {
  return attach(Icon(name).className("frameseq-semantic-icon"));
}

/** Citation numbers in the order works were first cited, kept for the whole presentation. */
const citationNumbers = new Map<string, number>();
/** Lists made by references(), filled once the document has run and every citation is known. */
const referenceLists: Array<{ list: GroupBuilder; all: boolean }> = [];
/** The current slide's footnote area, its footnote count, and the works it already lists. */
let slideNotes: GroupBuilder | undefined;
let slideNoteCount = 0;
const slideCitations = new Set<string>();

function resetSlideNotes(): void {
  slideNotes = undefined;
  slideNoteCount = 0;
  slideCitations.clear();
}

/** The area at the foot of the current slide where its footnotes and cited works are listed. */
function footnoteArea(): GroupBuilder | undefined {
  if (!activeSlide) return undefined;
  if (!slideNotes) {
    slideNotes = Group().className("frameseq-slide-footnotes");
    attachNode(activeSlide.node, slideNotes.node);
  }
  return slideNotes;
}

function bibliography(): { works: Bibliography; options: CitationOptions } {
  if (!activeSlides) throw new Error("Create a presentation with presentation() before citing");
  const works = activeSlides.node.props.bibliography as Bibliography | undefined;
  if (!works) {
    throw new Error(
      "cite() needs a bibliography: presentation({ bibliography }), "
      + "with `import bibliography from \"./references.bib\"` or a record of reference texts",
    );
  }
  return { works, options: (activeSlides.node.props.citations as CitationOptions | undefined) ?? {} };
}

/**
 * Cite works from the presentation's bibliography, and return the marker to write in the text:
 * [1] or [1, 2], or (Vaswani et al., 2017) in the author-year style. The works a slide cites are
 * listed at its foot.
 * @example text(`Attention replaced recurrence ${cite("vaswani2017")}.`);
 */
export function cite(...keys: string[]): string {
  const { works, options } = bibliography();
  if (keys.length === 0) throw new Error("cite() needs the key of at least one work");
  const labels = keys.map((key) => {
    const entry = works[key];
    if (entry === undefined) {
      const similar = similarKeys(key, Object.keys(works));
      throw new Error(`cite() cannot find "${key}" in the bibliography${similar.length > 0 ? `; did you mean "${similar[0]}"?` : ""}`);
    }
    if (!citationNumbers.has(key)) citationNumbers.set(key, citationNumbers.size + 1);
    const number = citationNumbers.get(key) as number;
    if (options.footnotes !== false && !slideCitations.has(key)) {
      const area = footnoteArea();
      if (area) {
        slideCitations.add(key);
        const prefix = options.style === "author-year" ? "" : `[${number}] `;
        area.add(new TextBoxBuilder(Text(`${prefix}${formatReference(entry)}`).node).className("frameseq-footnote"));
      }
    }
    return citationLabel(entry, number, options.style);
  });
  return citationMarker(labels, options.style);
}

/**
 * Add a footnote to the current slide and return its marker, a superscript number, to write
 * where it belongs. Numbers start again on each slide.
 * @example text(`Measured on one GPU${footnote("An NVIDIA A100, batch size 32.")}.`);
 */
export function footnote(content: string): string {
  const area = footnoteArea();
  if (!area) throw new Error("Create a slide with slide() before adding a footnote");
  slideNoteCount += 1;
  const marker = superscript(slideNoteCount);
  area.add(new TextBoxBuilder(Text(`${marker} ${content}`).node).className("frameseq-footnote"));
  return marker;
}

/**
 * Add the list of works the presentation cites, numbered as cite() numbered them, or every work
 * in the bibliography with { all: true }. It is filled once the whole document has run, so it
 * may come before the citations it lists.
 */
export function references(options: { all?: boolean } = {}): GroupBuilder {
  const list = Group().className("frameseq-references");
  referenceLists.push({ list, all: options.all === true });
  return attach(list);
}

function fillReferenceLists(): void {
  if (referenceLists.length === 0 || !activeSlides) return;
  const works = (activeSlides.node.props.bibliography as Bibliography | undefined) ?? {};
  const style = (activeSlides.node.props.citations as CitationOptions | undefined)?.style;
  for (const { list, all } of referenceLists) {
    const cited = [...citationNumbers.keys()];
    const keys = all ? [...cited, ...Object.keys(works).filter((key) => !citationNumbers.has(key))] : cited;
    const ordered = style === "author-year"
      ? [...keys].sort((a, b) => formatReference(works[a]).localeCompare(formatReference(works[b])))
      : keys;
    for (const key of ordered) {
      const number = citationNumbers.get(key);
      const prefix = style === "author-year" || number === undefined ? "" : `[${number}] `;
      list.add(new TextBoxBuilder(Text(`${prefix}${formatReference(works[key])}`).node).className("frameseq-reference"));
    }
  }
  referenceLists.length = 0;
}

/**
 * Add empty space that takes whatever room is left over, which pushes the objects on
 * either side of it apart. Two spacers of the same size split the free space evenly.
 */
export function spacer(size = 1): ElementBuilder {
  return attach(Spacer(size));
}

function findNamed(node: FrameSeqNode, name: string): FrameSeqNode | undefined {
  for (const child of node.children) {
    if (child.props.name === name) return child;
    const found = findNamed(child, name);
    if (found) return found;
  }
  return undefined;
}

function collectNames(node: FrameSeqNode, names: string[]): string[] {
  for (const child of node.children) {
    if (typeof child.props.name === "string") names.push(child.props.name);
    collectNames(child, names);
  }
  return names;
}

/** Wrap an existing node in the builder that matches what it can do. */
function builderFor(node: FrameSeqNode): ElementBuilder {
  if (node.type === "rect" || node.type === "circle" || node.type === "shape") return new ShapeBuilder(node);
  if (node.type === "line") return new LineBuilder(node);
  if (node.type === "row" || node.type === "column" || node.type === "stack") {
    return new RegionBuilder(node);
  }
  return new ElementBuilder(node);
}

function named(name: string, command: string): ElementBuilder {
  const slide = currentSlide();
  const found = findNamed(slide.node, name);
  if (!found) {
    const names = collectNames(slide.node, []);
    const known = names.length === 0
      ? "this slide has no named objects yet"
      : `named objects on this slide: ${names.join(", ")}`;
    throw new Error(`${command} cannot find an object named "${name}"; ${known}`);
  }
  return builderFor(found);
}

function resolveItems(
  items: Array<ElementBuilder | string>,
  command: string,
): ElementBuilder[] {
  return items.map((item) => (typeof item === "string" ? named(item, command) : item));
}

/** Select an object or region by the name given to it with as() or at(). */
export function ref(name: string): ElementBuilder {
  return named(name, "ref()");
}

/** Create a vertical container, optionally regrouping adjacent content objects into it. */
export function group(...items: Array<ElementBuilder | string>): GroupBuilder {
  const container = Group();
  return items.length === 0
    ? attach(container)
    : regroup(container, resolveItems(items, "group()"), "group()");
}

/** Add a semantic title-and-copy card to the current document flow. */
export function card(title: string, content?: string): GroupBuilder {
  return attach(Card(title, content));
}

/** Create a local grid, optionally regrouping supplied content objects into it. */
export function gridSection(
  columns: GridColumns,
  ...items: Array<ElementBuilder | string>
): GridSectionBuilder {
  const section = GridSection(columns);
  return items.length === 0
    ? attach(section)
    : regroup(section, resolveItems(items, "gridSection()"), "gridSection()");
}

/** Return automatic content placement to the slide's primary region. */
export function main(): RegionBuilder {
  activeRegion = undefined;
  return currentSlide().defaultContent;
}

/** Send the content that follows to the left region of a `.split()` slide. */
export function left(): RegionBuilder {
  activeRegion = currentSlide().left;
  return activeRegion;
}

/** Send the content that follows to the right region of a `.split()` slide. */
export function right(): RegionBuilder {
  activeRegion = currentSlide().right;
  return activeRegion;
}

/**
 * Send the content that follows to one region of a `.grid()` slide.
 * @param index The cell, counted from 0.
 */
export function cell(index: number): RegionBuilder {
  activeRegion = currentSlide().cell(index);
  return activeRegion;
}

const pathSegment = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const pathRegions = new Map<string, RegionBuilder>();

function pathSegments(path: string): string[] {
  if (!path.trim()) return [];
  const segments = path.split("/");
  for (const segment of segments) {
    if (!pathSegment.test(segment)) {
      throw new Error(
        `at("${path}") expects segments separated by "/", such as "cell0/legend": `
        + `letters, digits, "_" and "-", starting with a letter`,
      );
    }
  }
  return segments;
}

/** Regions the slide layout already owns, addressed by their first path segment. */
function layoutRegion(segment: string): RegionBuilder | undefined {
  const slide = currentSlide();
  if (segment === "main") return slide.defaultContent;

  if (segment === "left" || segment === "right") {
    try {
      return segment === "left" ? slide.left : slide.right;
    } catch {
      throw new Error(`at("${segment}") needs a split layout; call slide().split() first`);
    }
  }

  const cellMatch = /^cell(\d+)$/.exec(segment);
  if (!cellMatch) return undefined;
  const index = Number(cellMatch[1]);
  try {
    return slide.cell(index);
  } catch {
    throw new Error(
      `at("${segment}") needs a grid layout; call slide().grid(columns) first`,
    );
  }
}

/**
 * Move the authoring cursor to a named region, creating the containers on the way.
 * Paths are unique per slide and can be revisited, so composition needs no nesting.
 */
export function at(path: string): RegionBuilder {
  const slide = currentSlide();
  const segments = pathSegments(path);
  if (segments.length === 0) return main();

  let region: RegionBuilder | undefined;
  let prefix = "";
  for (const [index, segment] of segments.entries()) {
    prefix = prefix ? `${prefix}/${segment}` : segment;
    const existing = pathRegions.get(prefix);
    if (existing) {
      region = existing;
      continue;
    }

    const created = index === 0 ? layoutRegion(segment) : undefined;
    if (created) {
      region = created;
    } else {
      const child = new RegionBuilder(Group().node).as(prefix);
      (region ?? slide.defaultContent).add(child);
      region = child;
    }
    pathRegions.set(prefix, region);
  }

  activeRegion = region;
  return region as RegionBuilder;
}

/**
 * Set the spacing between the children of the active region.
 * @param value Pixels as a number, or any CSS length as a string.
 */
export function gap(value: Length, horizontal?: Length): RegionBuilder {
  return currentRegion().gap(value, horizontal) as RegionBuilder;
}
