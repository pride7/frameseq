import {
  Circle,
  Code,
  Equation,
  Image,
  Latex,
  type SlidesOptions,
  ElementBuilder,
  type FrameSeqNode,
  Line,
  LineBuilder,
  type LinePoints,
  type Length,
  Rect,
  ShapeBuilder,
  Text,
  Typst,
  type SlideOptions,
} from "./core";
import {
  Card,
  Bullets,
  type ContentSlideBuilder,
  GridSection,
  type GridColumns,
  type GridSectionBuilder,
  Group,
  type GroupBuilder,
  Metric,
  RegionBuilder,
  Slides,
  type SlidesDefinition,
  Steps,
} from "./semantic";
import { attachNode, detachNode, nodeParent } from "./node-tree";

let activeSlides: SlidesDefinition | undefined;
let activeSlide: ContentSlideBuilder | undefined;
let activeRegion: RegionBuilder | undefined;

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

  body(): this {
    return this.role("frameseq-body-copy");
  }

  title(): this {
    return this.role("frameseq-slide-title");
  }

  hero(): this {
    return this.role("frameseq-cover-title");
  }

  subtitle(): this {
    return this.role("frameseq-cover-subtitle");
  }

  author(): this {
    return this.role("frameseq-cover-author");
  }

  eyebrow(): this {
    const content = this.node.props.content;
    if (typeof content === "string") this.node.props.content = content.toUpperCase();
    return this.role("frameseq-cover-eyebrow");
  }

  lead(): this {
    return this.role("frameseq-slide-lead");
  }

  caption(): this {
    return this.role("frameseq-caption");
  }

  quote(): this {
    return this.role("frameseq-quote");
  }
}

/** Start a new linear slide document. Calling this resets the authoring context. */
export function presentation(titleOrOptions: string | SlidesOptions = {}): SlidesDefinition {
  activeSlides = Slides(titleOrOptions);
  activeSlide = undefined;
  activeRegion = undefined;
  pathRegions.clear();
  return activeSlides;
}

/** Used by the document compiler to export a zero-boilerplate slide file. */
export function getActivePresentation(): SlidesDefinition {
  if (!activeSlides) {
    throw new Error("This slide document must begin with presentation()");
  }
  return activeSlides;
}

/** Start a slide. Content commands belong to it until the next slide() call. */
export function slide(nameOrOptions: string | SlideOptions = {}): ContentSlideBuilder {
  if (!activeSlides) {
    throw new Error("Create a presentation with presentation() before calling slide()");
  }
  activeSlide = activeSlides.slide(nameOrOptions);
  activeRegion = undefined;
  pathRegions.clear();
  return activeSlide;
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

export function text(content: string): TextBoxBuilder;
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

export function image(src: string, alt = ""): ElementBuilder {
  return attach(Image(src, alt).className("frameseq-semantic-image"));
}

export function code(content: string, language = "ts"): ElementBuilder {
  return attach(Code(content, language).className("frameseq-semantic-code"));
}

export function math(content: string): ElementBuilder;
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

/** Add a canvas-relative vector line or connector. Omit the points when using from()/to(). */
export function line(points: Partial<LinePoints> = {}): LineBuilder {
  return attach(Line(points).className("frameseq-semantic-line"));
}

export function bullets(...items: string[]): ElementBuilder {
  return attach(Bullets(...items));
}

export function steps(...items: string[]): ElementBuilder {
  return attach(Steps(...items));
}

export function metric(value: string, label: string): GroupBuilder {
  return attach(Metric(value, label));
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
  if (node.type === "rect" || node.type === "circle") return new ShapeBuilder(node);
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

export function left(): RegionBuilder {
  activeRegion = currentSlide().left;
  return activeRegion;
}

export function right(): RegionBuilder {
  activeRegion = currentSlide().right;
  return activeRegion;
}

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
      `at("${segment}") needs a grid with at least ${index + 1} cells; `
      + `call slide().grid(columns) first`,
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

export function gap(value: Length): RegionBuilder {
  return currentRegion().gap(value) as RegionBuilder;
}
