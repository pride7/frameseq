import {
  Code,
  Column,
  ContainerBuilder,
  type GridColumns,
  gridTemplate,
  SlidesRoot,
  SlidesRootDefinition,
  type SlidesOptions,
  type ElementBuilder,
  Equation,
  type FrameSeqNode,
  Image,
  type Length,
  Row,
  Slide,
  SlideBuilder,
  type SlideOptions,
  Text,
} from "./core";
import { attachNode, takeNodeChildren } from "./node-tree";

export type SplitRatio = `${number}:${number}` | number | [number, number];
export type { GridColumns };

function List(items: string[], ordered: boolean, reveal: boolean): ElementBuilder {
  const list = Column().className("frameseq-list");

  for (const [index, item] of items.entries()) {
    const marker = Text(ordered ? String(index + 1) : "•")
      .className("frameseq-list-marker");
    const content = Text(item).className("frameseq-list-copy");
    const row = Row(marker, content).className("frameseq-list-item");
    if (reveal) row.showAt(index + 1);
    list.add(row);
  }

  return list;
}

function columnsForRatio(ratio: SplitRatio): string {
  let left: number;
  let right: number;

  if (Array.isArray(ratio)) {
    [left, right] = ratio;
  } else if (typeof ratio === "string") {
    const values = ratio.split(":").map(Number);
    if (values.length !== 2) throw new Error(`Invalid split ratio: ${ratio}`);
    [left, right] = values;
  } else if (ratio > 0 && ratio < 1) {
    left = ratio;
    right = 1 - ratio;
  } else {
    left = ratio;
    right = 100 - ratio;
  }

  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) {
    throw new Error(`Split ratio must contain two positive values`);
  }
  return `${left}fr ${right}fr`;
}

export function Bullets(...items: string[]): ElementBuilder {
  return List(items, false, false);
}

export function Steps(...items: string[]): ElementBuilder {
  return List(items, true, true).className("frameseq-steps");
}

export class GroupBuilder extends ContainerBuilder {
  /** Give the group a card surface: padding, a border, and a background. */
  card(): this {
    return this.className("frameseq-card");
  }
}

export class GridSectionBuilder extends ContainerBuilder {
  /**
   * Set the columns of the local grid.
   * @param value An integer from 1 to 12 for equal columns, or CSS tracks such as "1fr 2fr".
   */
  columns(value: GridColumns): this {
    this.node.styles.gridTemplateColumns = gridTemplate(value);
    return this;
  }
}

/** Create a detached vertical group for use inside another layout object. */
export function Group(...items: ElementBuilder[]): GroupBuilder {
  return new GroupBuilder(
    Column(...items).className("frameseq-group").node,
  );
}

/** Create a detached semantic card with a title and optional supporting copy. */
export function Card(title: string, content?: string): GroupBuilder {
  const children = [Text(title).className("frameseq-card-title")];
  if (content) children.push(Text(content).className("frameseq-card-copy"));
  return Group(...children).card();
}

/** Create a detached metric object. */
export function Metric(value: string, label: string): GroupBuilder {
  return Group(
    Text(value).className("frameseq-metric-value"),
    Text(label).className("frameseq-metric-label"),
  ).className("frameseq-metric");
}

/** Create a detached grid that treats each supplied object as one cell. */
export function GridSection(
  columns: GridColumns,
  ...items: ElementBuilder[]
): GridSectionBuilder {
  const section = new GridSectionBuilder(
    Column(...items).className("frameseq-grid-section").node,
  );
  return section
    .style({ display: "grid" })
    .columns(columns);
}

export class RegionBuilder extends ContainerBuilder {
  /** Add a lead statement to this region. */
  lead(content: string): this {
    this.add(Text(content).className("frameseq-slide-lead"));
    return this;
  }

  /** Add a paragraph to this region. */
  text(content: string): this {
    this.add(Text(content).className("frameseq-body-copy"));
    return this;
  }

  /** Add an unordered list to this region. */
  bullets(...items: string[]): this {
    this.add(Bullets(...items));
    return this;
  }

  /** Add a numbered list, revealed one item per step, to this region. */
  steps(...items: string[]): this {
    this.add(Steps(...items));
    return this;
  }

  /** Add a code block to this region. */
  code(content: string, language = "ts"): this {
    this.add(Code(content, language).className("frameseq-semantic-code"));
    return this;
  }

  /** Add a standalone equation to this region. */
  math(content: string): this {
    this.add(Equation(content).className("frameseq-semantic-math"));
    return this;
  }

  /** Add an image to this region. */
  image(src: string, alt = ""): this {
    this.add(Image(src, alt).className("frameseq-semantic-image"));
    return this;
  }

  /** Add a caption to this region. */
  caption(content: string): this {
    this.add(Text(content).className("frameseq-caption"));
    return this;
  }

  /** Add a quotation to this region. */
  quote(content: string): this {
    this.add(Text(content).className("frameseq-quote"));
    return this;
  }

  /** Add a value with its label to this region. */
  metric(value: string, label: string): this {
    this.add(Metric(value, label));
    return this;
  }

  /** Add a card with a title and optional text to this region. */
  card(): this {
    this.className("frameseq-region-card");
    return this;
  }

  /** Add objects built with the object API to this region. */
  custom(...elements: ElementBuilder[]): this {
    this.add(...elements);
    return this;
  }
}

function region(className: string): RegionBuilder {
  return new RegionBuilder(Column().className(`frameseq-region ${className}`).node);
}

export class ContentSlideBuilder extends SlideBuilder {
  readonly content: RegionBuilder;
  private splitRegions?: [RegionBuilder, RegionBuilder];
  private gridRegions?: RegionBuilder[];
  private structuredLayout?: "split" | "grid";

  constructor(node: FrameSeqNode, content: RegionBuilder) {
    super(node);
    this.content = content;
  }

  private takeExistingContent(layout: "split" | "grid"): FrameSeqNode[] {
    if (this.structuredLayout) {
      throw new Error(`Slide already uses the ${this.structuredLayout} layout`);
    }
    this.structuredLayout = layout;
    return takeNodeChildren(this.content.node);
  }

  private defaultRegion(): RegionBuilder {
    return this.splitRegions?.[0] ?? this.gridRegions?.[0] ?? this.content;
  }

  /** The region used by linear document commands such as text() and code(). */
  get defaultContent(): RegionBuilder {
    return this.defaultRegion();
  }

  /**
   * Lay the slide out as a cover.
   *
   * It shows no title by itself: write the cover with text roles such as `.hero()`,
   * `.subtitle()`, and `.author()`.
   */
  cover(): this {
    const classes = typeof this.node.props.className === "string"
      ? this.node.props.className.split(/\s+/).filter((name) => name !== "frameseq-content-slide")
      : [];
    this.node.props.className = classes.join(" ");
    this.className("frameseq-cover-slide");
    return this;
  }

  /** Add a lead statement to the slide body. */
  lead(content: string): this {
    this.defaultRegion().lead(content);
    return this;
  }

  /** Add a paragraph to the slide body. */
  text(content: string): this {
    this.defaultRegion().text(content);
    return this;
  }

  /** Add an unordered list to the slide body. */
  bullets(...items: string[]): this {
    this.defaultRegion().bullets(...items);
    return this;
  }

  /** Add a numbered list, revealed one item per step, to the slide body. */
  steps(...items: string[]): this {
    this.defaultRegion().steps(...items);
    return this;
  }

  /** Add a code block to the slide body. */
  code(content: string, language = "ts"): this {
    this.defaultRegion().code(content, language);
    return this;
  }

  /** Add a standalone equation to the slide body. */
  math(content: string): this {
    this.defaultRegion().math(content);
    return this;
  }

  /** Add an image to the slide body. */
  image(src: string, alt = ""): this {
    this.defaultRegion().image(src, alt);
    return this;
  }

  /** Add a caption to the slide body. */
  caption(content: string): this {
    this.defaultRegion().caption(content);
    return this;
  }

  /** Add a quotation to the slide body. */
  quote(content: string): this {
    this.defaultRegion().quote(content);
    return this;
  }

  /** Add a value with its label to the slide body. */
  metric(value: string, label: string): this {
    this.defaultRegion().metric(value, label);
    return this;
  }

  /** Add objects built with the object API to the slide body. */
  custom(...elements: ElementBuilder[]): this {
    this.defaultRegion().custom(...elements);
    return this;
  }

  /**
   * Divide the slide body into a left and a right region.
   *
   * Content written so far, and what follows, goes to the left; call right() to switch.
   * @param ratio "40:60", 0.4, 40, or [2, 3]; equal halves by default.
   */
  split(ratio: SplitRatio = "1:1"): this {
    const existing = this.takeExistingContent("split");
    const left = region("frameseq-region-left");
    const right = region("frameseq-region-right");
    for (const child of existing) attachNode(left.node, child);
    this.content
      .className("frameseq-layout-split")
      .style({ display: "grid", gridTemplateColumns: columnsForRatio(ratio) })
      .add(left, right);
    this.splitRegions = [left, right];
    return this;
  }

  get left(): RegionBuilder {
    if (!this.splitRegions) throw new Error("Call split() before using page.left");
    return this.splitRegions[0];
  }

  get right(): RegionBuilder {
    if (!this.splitRegions) throw new Error("Call split() before using page.right");
    return this.splitRegions[1];
  }

  /**
   * Divide the slide body into equal-width regions; pick one with cell(index).
   * @param columns An integer from 1 to 12.
   * @param gap Space between the regions; the theme supplies the default.
   */
  grid(columns: number, gap?: Length): this {
    if (!Number.isInteger(columns) || columns < 1 || columns > 12) {
      throw new Error("grid() columns must be an integer from 1 to 12");
    }
    const existing = this.takeExistingContent("grid");
    const cells = Array.from({ length: columns }, (_, index) =>
      region(`frameseq-grid-cell frameseq-grid-cell-${index}`));
    for (const child of existing) attachNode(cells[0].node, child);
    this.content
      .className("frameseq-layout-grid")
      .style({
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      })
      .add(...cells);
    if (gap !== undefined) this.content.gap(gap);
    this.gridRegions = cells;
    return this;
  }

  /**
   * A grid states its columns, not how many cells the page ends up needing, so a cell
   * past the first row is created on demand and wraps onto the next row by itself.
   */
  cell(index: number): RegionBuilder {
    if (!this.gridRegions) throw new Error(`No grid cell ${index}; call grid() first`);
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`cell() expects a whole index from 0, not ${index}`);
    }
    while (this.gridRegions.length <= index) {
      const cell = region(`frameseq-grid-cell frameseq-grid-cell-${this.gridRegions.length}`);
      this.content.add(cell);
      this.gridRegions.push(cell);
    }
    return this.gridRegions[index];
  }

  /** Center the slide body both ways, for one key message or quotation. */
  override center(): this {
    this.content.className("frameseq-layout-center").center();
    return this;
  }

  /**
   * Fill the slide body with one image.
   * @param src The image URL.
   * @param alt Alternative text for screen readers; empty by default.
   */
  fullBleed(src: string, alt = ""): this {
    this.content.className("frameseq-layout-full-bleed");
    this.content.add(Image(src, alt).className("frameseq-full-bleed-image"));
    return this;
  }

  /**
   * Turn the slide body into a freeform canvas, where objects are placed with
   * `.position({ x, y })` in canvas units, 1600 × 900 by default. Prefer normal flow,
   * `.split()`, or `.grid()` for ordinary content.
   */
  canvas(): this {
    this.content.className("frameseq-layout-canvas").stack();
    return this;
  }
}

export class CoverSlideBuilder extends RegionBuilder {
  /** Set the cover's speaker notes, shown in presenter view and PPTX. */
  notes(content: string): this {
    this.node.props.notes = content;
    return this;
  }

  /** Add a small uppercase label above the cover title. */
  eyebrow(content: string): this {
    this.add(Text(content.toUpperCase()).className("frameseq-cover-eyebrow"));
    return this;
  }

  /** Add supporting copy below the cover title. */
  subtitle(content: string): this {
    this.add(Text(content).className("frameseq-cover-subtitle"));
    return this;
  }

  /** Add the author or presenter name to the cover. */
  author(content: string): this {
    this.add(Text(content).className("frameseq-cover-author"));
    return this;
  }
}

export class SlidesDefinition extends SlidesRootDefinition {
  /** Add a cover slide with this title. */
  cover(title: string): CoverSlideBuilder {
    const slide = new CoverSlideBuilder(Slide({ name: "Cover", title }).node)
      .className("frameseq-cover-slide");
    slide.add(Text(title).className("frameseq-cover-title"));
    attachNode(this.node, slide.node);
    return slide;
  }

  /** Add a content slide; a string names it and becomes its title. */
  override slide(nameOrOptions: string | SlideOptions = {}): ContentSlideBuilder {
    const options = typeof nameOrOptions === "string"
      ? { name: nameOrOptions, title: nameOrOptions }
      : nameOrOptions;
    const title = options.title;
    const rawSlide = Slide(options).className("frameseq-content-slide");
    const body = region("frameseq-slide-body");
    const slide = new ContentSlideBuilder(rawSlide.node, body);
    if (title) slide.add(Text(title).className("frameseq-slide-title"));
    slide.add(body);
    attachNode(this.node, slide.node);
    return slide;
  }
}

export function Slides(titleOrOptions: string | SlidesOptions = {}): SlidesDefinition {
  const options: SlidesOptions = typeof titleOrOptions === "string"
    ? { title: titleOrOptions }
    : { ...titleOrOptions };
  return new SlidesDefinition(SlidesRoot(options).node);
}
