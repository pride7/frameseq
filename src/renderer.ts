import katex from "katex";
import type {
  DeckDefinition,
  FrameSeqNode,
  Length,
  PresentationFontOptions,
} from "./core";
import { themeCssVariables } from "./theme";

function applyStyles(element: HTMLElement, styles: Record<string, string>): void {
  Object.assign(element.style, styles);
}

function appendTextWithInlineMath(element: HTMLElement, content: string): void {
  const inlineMath = /(?<!\\)\$((?:\\.|[^$])+?)(?<!\\)\$/g;
  let cursor = 0;

  for (const match of content.matchAll(inlineMath)) {
    const index = match.index;
    element.append(document.createTextNode(
      content.slice(cursor, index).replaceAll("\\$", "$"),
    ));

    const formula = document.createElement("span");
    formula.className = "frameseq-inline-math";
    try {
      formula.innerHTML = katex.renderToString(match[1], {
        displayMode: false,
        throwOnError: false,
        output: "htmlAndMathml",
      });
    } catch (error) {
      formula.textContent = error instanceof Error ? error.message : String(error);
      formula.classList.add("frameseq-equation-error");
    }
    element.append(formula);
    cursor = index + match[0].length;
  }

  element.append(document.createTextNode(
    content.slice(cursor).replaceAll("\\$", "$"),
  ));
}

function renderNode(node: FrameSeqNode): HTMLElement {
  let element: HTMLElement;

  switch (node.type) {
    case "text": {
      element = document.createElement("div");
      appendTextWithInlineMath(element, node.props.content as string);
      break;
    }
    case "image": {
      const image = document.createElement("img");
      image.src = node.props.src as string;
      image.alt = node.props.alt as string;
      element = image;
      break;
    }
    case "code": {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = node.props.content as string;
      code.dataset.language = node.props.language as string;
      pre.append(code);
      element = pre;
      break;
    }
    case "equation": {
      element = document.createElement("div");
      try {
        element.innerHTML = katex.renderToString(node.props.content as string, {
          displayMode: node.props.displayMode as boolean,
          throwOnError: false,
          output: "htmlAndMathml",
        });
      } catch (error) {
        element.textContent = error instanceof Error ? error.message : String(error);
        element.classList.add("frameseq-equation-error");
      }
      break;
    }
    default:
      element = document.createElement("div");
  }

  element.classList.add(`frameseq-${node.type}`);
  const extraClassName = node.props.className;
  if (typeof extraClassName === "string") {
    element.classList.add(...extraClassName.split(/\s+/).filter(Boolean));
  }

  if (typeof node.props.step === "number") {
    element.classList.add("frameseq-step");
    element.dataset.step = String(node.props.step);
  }

  applyStyles(element, node.styles);
  for (const child of node.children) {
    element.append(renderNode(child));
  }
  return element;
}

function maxStep(node: FrameSeqNode): number {
  const ownStep = typeof node.props.step === "number" ? node.props.step : 0;
  return Math.max(ownStep, ...node.children.map(maxStep), 0);
}

function hasClass(node: FrameSeqNode, className: string): boolean {
  const classes = typeof node.props.className === "string"
    ? node.props.className.split(/\s+/)
    : [];
  return classes.includes(className);
}

function titlePageItem(className: string, content: string): HTMLElement {
  const element = document.createElement("div");
  element.className = `frameseq-text ${className}`;
  appendTextWithInlineMath(element, content);
  return element;
}

function addAutomaticTitlePage(canvas: HTMLElement, deck: DeckDefinition): void {
  const hasManualContent = Array.from(canvas.children).some((child) => {
    const isEmptyBody = child.classList.contains("frameseq-slide-body")
      && child.children.length === 0
      && !child.textContent?.trim();
    return !isEmptyBody;
  });
  if (hasManualContent) return;

  canvas.replaceChildren();

  const titlePage = document.createElement("section");
  titlePage.className = "frameseq-auto-title-page";
  titlePage.append(titlePageItem("frameseq-cover-title", deck.title));
  if (deck.subtitle) {
    titlePage.append(titlePageItem("frameseq-cover-subtitle", deck.subtitle));
  }

  const rule = document.createElement("div");
  rule.className = "frameseq-cover-rule";
  titlePage.append(rule);

  if (deck.author) {
    titlePage.append(titlePageItem("frameseq-cover-author", deck.author));
  }
  if (deck.institute) {
    titlePage.append(titlePageItem("frameseq-cover-institute", deck.institute));
  }
  if (deck.date) {
    titlePage.append(titlePageItem("frameseq-cover-date", deck.date));
  }
  canvas.append(titlePage);
}

function addThemeChrome(
  canvas: HTMLElement,
  slide: FrameSeqNode,
  index: number,
  deck: DeckDefinition,
): void {
  const chrome = deck.theme.chrome;
  const isCover = hasClass(slide, "frameseq-cover-slide");
  if (isCover && chrome.autoTitlePage) {
    addAutomaticTitlePage(canvas, deck);
  }
  if (isCover && !chrome.showOnCover) return;

  const title = typeof slide.props.title === "string" ? slide.props.title : undefined;
  if (chrome.titleBar && title) {
    const titleBar = document.createElement("header");
    titleBar.className = `frameseq-theme-title-bar is-${chrome.titleBarStyle}`;
    titleBar.textContent = title;
    canvas.classList.add("frameseq-has-title-bar");
    canvas.prepend(titleBar);
  }

  if (!chrome.footer) return;

  const footer = document.createElement("footer");
  footer.className = "frameseq-theme-footer";

  if (chrome.footerLayout === "title") {
    footer.classList.add("is-title-layout");

    const title = document.createElement("span");
    title.className = "frameseq-theme-footer-title";
    title.textContent = deck.title;

    const number = document.createElement("span");
    number.className = "frameseq-theme-footer-details";
    number.textContent = chrome.slideNumber ? `${index + 1} / ${deck.slides.length}` : "";

    footer.append(title, number);
    canvas.classList.add("frameseq-has-footer");
    canvas.append(footer);
    return;
  }

  const author = document.createElement("span");
  author.className = "frameseq-theme-footer-author";
  author.textContent = deck.author ?? deck.title;

  const institute = document.createElement("span");
  institute.className = "frameseq-theme-footer-institute";
  institute.textContent = deck.institute ?? "";

  const details = document.createElement("span");
  details.className = "frameseq-theme-footer-details";
  details.textContent = [
    deck.date,
    chrome.slideNumber ? `${index + 1} / ${deck.slides.length}` : undefined,
  ].filter(Boolean).join(" · ");

  footer.append(author, institute, details);
  canvas.classList.add("frameseq-has-footer");
  canvas.append(footer);
}

const presentationFontVariables = [
  "--frameseq-body-font-size",
  "--frameseq-body-font-weight",
  "--frameseq-body-line-height",
  "--frameseq-heading-font-size",
  "--frameseq-heading-font-weight",
  "--frameseq-heading-line-height",
  "--frameseq-code-font-size",
  "--frameseq-code-font-weight",
  "--frameseq-code-line-height",
] as const;

function fontLength(value: Length): string {
  return typeof value === "number" ? `${value}px` : value;
}

function applyPresentationFont(font: PresentationFontOptions | undefined): void {
  const styles = document.documentElement.style;
  for (const variable of presentationFontVariables) {
    styles.removeProperty(variable);
  }
  if (!font) return;

  if (font.family !== undefined) {
    styles.setProperty("--frameseq-font-body", font.family);
    styles.setProperty("--frameseq-font-heading", font.family);
  }
  if (font.heading?.family !== undefined) {
    styles.setProperty("--frameseq-font-heading", font.heading.family);
  }
  if (font.code?.family !== undefined) {
    styles.setProperty("--frameseq-font-mono", font.code.family);
  }

  const values: Array<[string, string | undefined]> = [
    ["--frameseq-body-font-size", font.size === undefined ? undefined : fontLength(font.size)],
    ["--frameseq-body-font-weight", font.weight === undefined ? undefined : String(font.weight)],
    ["--frameseq-body-line-height", font.lineHeight === undefined ? undefined : String(font.lineHeight)],
    ["--frameseq-heading-font-size", font.heading?.size === undefined ? undefined : fontLength(font.heading.size)],
    ["--frameseq-heading-font-weight", font.heading?.weight === undefined ? undefined : String(font.heading.weight)],
    ["--frameseq-heading-line-height", font.heading?.lineHeight === undefined ? undefined : String(font.heading.lineHeight)],
    ["--frameseq-code-font-size", font.code?.size === undefined ? undefined : fontLength(font.code.size)],
    ["--frameseq-code-font-weight", font.code?.weight === undefined ? undefined : String(font.code.weight)],
    ["--frameseq-code-line-height", font.code?.lineHeight === undefined ? undefined : String(font.code.lineHeight)],
  ];
  for (const [name, value] of values) {
    if (value !== undefined) styles.setProperty(name, value);
  }
}

export function mountDeck(deck: DeckDefinition, target: HTMLElement): void {
  document.title = deck.title;
  target.replaceChildren();

  const printMode = new URLSearchParams(location.search).has("print");
  document.documentElement.classList.toggle("frameseq-print", printMode);
  document.documentElement.style.setProperty("--slide-width", `${deck.canvasWidth}px`);
  document.documentElement.style.setProperty("--slide-height", `${deck.canvasHeight}px`);
  document.documentElement.style.setProperty("--slide-ratio", `${deck.canvasWidth} / ${deck.canvasHeight}`);
  document.documentElement.dataset.frameseqTheme = deck.theme.name;
  document.documentElement.dataset.frameseqThemeFamily = deck.theme.family;
  document.documentElement.dataset.frameseqCoverLayout = deck.theme.coverLayout;
  for (const [name, value] of Object.entries(themeCssVariables(deck.theme))) {
    document.documentElement.style.setProperty(name, value);
  }
  applyPresentationFont(deck.font);

  if (printMode) {
    const pageStyle = document.createElement("style");
    pageStyle.textContent = `@page { size: ${deck.canvasWidth / 96}in ${deck.canvasHeight / 96}in; margin: 0; }`;
    document.head.append(pageStyle);
  }

  const root = document.createElement("main");
  root.className = "frameseq-deck";
  applyStyles(root, deck.node.styles);

  const slides = deck.slides.map((slide, index) => {
    const frame = document.createElement("section");
    frame.className = "frameseq-slide-frame";
    frame.dataset.index = String(index);

    const canvas = renderNode(slide);
    addThemeChrome(canvas, slide, index, deck);
    canvas.setAttribute("role", "group");
    canvas.setAttribute("aria-roledescription", "slide");
    const slideName = typeof slide.props.title === "string"
      ? slide.props.title
      : typeof slide.props.name === "string"
        ? slide.props.name
        : undefined;
    canvas.setAttribute(
      "aria-label",
      `${index + 1} of ${deck.slides.length}${slideName ? `: ${slideName}` : ""}`,
    );
    frame.append(canvas);
    root.append(frame);
    return { frame, canvas, maxStep: maxStep(slide) };
  });

  target.append(root);

  if (printMode) {
    for (const { frame, canvas } of slides) {
      frame.classList.add("is-active");
      canvas.style.transform = "none";
      canvas.querySelectorAll<HTMLElement>(".frameseq-step").forEach((element) => {
        element.classList.add("is-visible");
      });
    }
    document.documentElement.dataset.ready = "true";
    return;
  }

  const controls = document.createElement("nav");
  controls.className = "frameseq-controls";
  controls.setAttribute("aria-label", "Slide navigation");
  controls.innerHTML = `
    <button type="button" data-action="previous" aria-label="Previous slide">←</button>
    <span class="frameseq-counter"></span>
    <button type="button" data-action="next" aria-label="Next slide">→</button>
  `;
  target.append(controls);

  let currentSlide = 0;
  let currentStep = 0;

  function updateScale(): void {
    const { frame, canvas } = slides[currentSlide];
    const frameWidth = frame.clientWidth;
    const frameHeight = frame.clientHeight;
    const scale = Math.min(frameWidth / deck.canvasWidth, frameHeight / deck.canvasHeight);
    canvas.style.left = `${(frameWidth - deck.canvasWidth) / 2}px`;
    canvas.style.top = `${(frameHeight - deck.canvasHeight) / 2}px`;
    canvas.style.transform = `scale(${scale})`;
  }

  function update(): void {
    slides.forEach(({ frame, canvas }, index) => {
      const active = index === currentSlide;
      frame.classList.toggle("is-active", active);
      if (!active) return;
      canvas.querySelectorAll<HTMLElement>(".frameseq-step").forEach((element) => {
        const step = Number(element.dataset.step ?? 0);
        element.classList.toggle("is-visible", step <= currentStep);
      });
    });

    const counter = controls.querySelector<HTMLElement>(".frameseq-counter");
    if (counter) {
      const stepSuffix = slides[currentSlide].maxStep > 0
        ? ` · ${currentStep}/${slides[currentSlide].maxStep}`
        : "";
      counter.textContent = `${currentSlide + 1}/${slides.length}${stepSuffix}`;
    }
    history.replaceState(null, "", `#${currentSlide + 1}`);
    requestAnimationFrame(updateScale);
  }

  function next(): void {
    if (currentStep < slides[currentSlide].maxStep) {
      currentStep += 1;
    } else if (currentSlide < slides.length - 1) {
      currentSlide += 1;
      currentStep = 0;
    }
    update();
  }

  function previous(): void {
    if (currentStep > 0) {
      currentStep -= 1;
    } else if (currentSlide > 0) {
      currentSlide -= 1;
      currentStep = slides[currentSlide].maxStep;
    }
    update();
  }

  controls.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (button?.dataset.action === "next") next();
    if (button?.dataset.action === "previous") previous();
  });

  addEventListener("keydown", (event) => {
    if (["ArrowRight", "PageDown", " "].includes(event.key)) {
      event.preventDefault();
      next();
    }
    if (["ArrowLeft", "PageUp"].includes(event.key)) {
      event.preventDefault();
      previous();
    }
  });

  const initialSlide = Math.min(
    Math.max(Number(location.hash.slice(1) || 1) - 1, 0),
    Math.max(slides.length - 1, 0),
  );
  currentSlide = initialSlide;
  new ResizeObserver(updateScale).observe(root);
  update();
  document.documentElement.dataset.ready = "true";
}
