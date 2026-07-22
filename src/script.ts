import {
  Circle,
  Code,
  Equation,
  Image,
  type SlidesOptions,
  ElementBuilder,
  Line,
  type LineBuilder,
  type LinePoints,
  type Length,
  Rect,
  type ShapeBuilder,
  Text,
  Typst,
  type SlideOptions,
} from "./core";
import {
  Bullets,
  type ContentSlideBuilder,
  type RegionBuilder,
  Slides,
  type SlidesDefinition,
  Steps,
} from "./semantic";

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
  return activeSlide;
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

/** Add a rectangular diagram node, optionally containing a label. */
export function rect(label = ""): ShapeBuilder {
  return attach(Rect(label).className("frameseq-semantic-shape"));
}

/** Add a circular diagram node, optionally containing a label. */
export function circle(label = ""): ShapeBuilder {
  return attach(Circle(label).className("frameseq-semantic-shape"));
}

/** Add a canvas-relative vector line or connector. */
export function line(points: LinePoints): LineBuilder {
  return attach(Line(points).className("frameseq-semantic-line"));
}

export function bullets(...items: string[]): ElementBuilder {
  return attach(Bullets(...items));
}

export function steps(...items: string[]): ElementBuilder {
  return attach(Steps(...items));
}

export function metric(value: string, label: string): RegionBuilder {
  return currentRegion().metric(value, label);
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

export function gap(value: Length): RegionBuilder {
  return currentRegion().gap(value) as RegionBuilder;
}
