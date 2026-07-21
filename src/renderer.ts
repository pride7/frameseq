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

const svgNamespace = "http://www.w3.org/2000/svg";
let lineMarkerSequence = 0;

function renderLine(node: FrameSeqNode): HTMLElement {
  const element = document.createElement("div");
  const svg = document.createElementNS(svgNamespace, "svg");
  const vector = document.createElementNS(svgNamespace, "line");
  const stroke = String(node.props.stroke ?? "var(--frameseq-accent)");
  const strokeWidth = String(node.props.strokeWidth ?? "3px");
  const arrow = node.props.arrow;

  svg.setAttribute("aria-hidden", "true");
  vector.setAttribute("x1", String(node.props.x1));
  vector.setAttribute("y1", String(node.props.y1));
  vector.setAttribute("x2", String(node.props.x2));
  vector.setAttribute("y2", String(node.props.y2));
  vector.setAttribute("stroke", stroke);
  vector.setAttribute("stroke-width", strokeWidth);
  vector.setAttribute("stroke-linecap", "round");

  if (arrow === "start" || arrow === "end" || arrow === "both") {
    lineMarkerSequence += 1;
    const markerId = `frameseq-arrow-${lineMarkerSequence}`;
    const definitions = document.createElementNS(svgNamespace, "defs");
    const marker = document.createElementNS(svgNamespace, "marker");
    const arrowhead = document.createElementNS(svgNamespace, "path");

    marker.id = markerId;
    marker.setAttribute("viewBox", "0 0 8 8");
    marker.setAttribute("refX", "7");
    marker.setAttribute("refY", "4");
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("markerUnits", "strokeWidth");
    marker.setAttribute("orient", "auto-start-reverse");
    arrowhead.setAttribute("d", "M 0 0 L 8 4 L 0 8 Z");
    arrowhead.setAttribute("fill", stroke);
    marker.append(arrowhead);
    definitions.append(marker);
    svg.append(definitions);

    if (arrow === "start" || arrow === "both") {
      vector.setAttribute("marker-start", `url(#${markerId})`);
    }
    if (arrow === "end" || arrow === "both") {
      vector.setAttribute("marker-end", `url(#${markerId})`);
    }
  }

  svg.append(vector);
  element.append(svg);
  return element;
}

function renderNode(node: FrameSeqNode, nodePath = "0"): HTMLElement {
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
    case "typst": {
      element = document.createElement("div");
      const svg = node.props.svg;
      if (typeof svg === "string" && svg.trim()) {
        element.innerHTML = svg;
      } else {
        element.textContent = "Typst content was not compiled. Use the FrameSeq CLI and install @myriaddreamin/typst-ts-node-compiler.";
        element.classList.add("frameseq-typst-error");
      }
      break;
    }
    case "rect":
    case "circle": {
      element = document.createElement("div");
      const label = node.props.label;
      if (typeof label === "string" && label) {
        appendTextWithInlineMath(element, label);
      } else {
        element.setAttribute("aria-hidden", "true");
      }
      break;
    }
    case "line": {
      element = renderLine(node);
      break;
    }
    default:
      element = document.createElement("div");
  }

  element.classList.add(`frameseq-${node.type}`);
  element.dataset.frameseqNode = node.type;
  element.dataset.frameseqPath = nodePath;
  const extraClassName = node.props.className;
  if (typeof extraClassName === "string") {
    element.classList.add(...extraClassName.split(/\s+/).filter(Boolean));
  }

  if (typeof node.props.step === "number") {
    element.classList.add("frameseq-step");
    element.dataset.step = String(node.props.step);
  }

  applyStyles(element, node.styles);
  for (const [index, child] of node.children.entries()) {
    element.append(renderNode(child, `${nodePath}.${index}`));
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

function slideLabel(slide: FrameSeqNode, index: number): string {
  const label = typeof slide.props.title === "string"
    ? slide.props.title
    : typeof slide.props.name === "string"
      ? slide.props.name
      : undefined;
  return label ?? `Slide ${index + 1}`;
}

function renderSlideCanvas(
  slide: FrameSeqNode,
  index: number,
  deck: DeckDefinition,
): HTMLElement {
  const label = slideLabel(slide, index);
  const canvas = renderNode(slide, String(index));
  addThemeChrome(canvas, slide, index, deck);
  canvas.dataset.frameseqSlideLabel = label;
  canvas.setAttribute("role", "group");
  canvas.setAttribute("aria-roledescription", "slide");
  canvas.setAttribute(
    "aria-label",
    `${index + 1} of ${deck.slides.length}: ${label}`,
  );
  return canvas;
}

function scaleCanvas(canvas: HTMLElement, frame: HTMLElement, deck: DeckDefinition): void {
  const frameWidth = frame.clientWidth;
  const frameHeight = frame.clientHeight;
  const scale = Math.min(frameWidth / deck.canvasWidth, frameHeight / deck.canvasHeight);
  canvas.style.left = `${(frameWidth - deck.canvasWidth) / 2}px`;
  canvas.style.top = `${(frameHeight - deck.canvasHeight) / 2}px`;
  canvas.style.transform = `scale(${scale})`;
}

interface PresenterElements {
  shell: HTMLElement;
  currentHost: HTMLElement;
  nextFrame: HTMLElement;
  nextLabel: HTMLElement;
  notes: HTMLElement;
  currentLabel: HTMLElement;
  counter: HTMLElement;
  pageSelect: HTMLSelectElement;
  timer: HTMLElement;
  timerToggle: HTMLButtonElement;
  laserToggle: HTMLButtonElement;
  controls: HTMLElement;
}

function createPresenterView(
  target: HTMLElement,
  root: HTMLElement,
  deck: DeckDefinition,
): PresenterElements {
  const shell = document.createElement("main");
  shell.className = "frameseq-presenter";
  shell.innerHTML = `
    <header class="frameseq-presenter-header">
      <div>
        <div class="frameseq-presenter-kicker">Presenter view</div>
        <div class="frameseq-presenter-title"></div>
      </div>
      <div class="frameseq-presenter-timer-group">
        <button type="button" data-action="laser-toggle" aria-pressed="false" title="Toggle laser pointer (Ctrl+L)">Laser: Off</button>
        <span class="frameseq-presenter-timer" aria-live="off">00:00</span>
        <button type="button" data-action="timer-toggle">Pause</button>
        <button type="button" data-action="timer-reset">Reset</button>
      </div>
    </header>
    <section class="frameseq-presenter-current" aria-label="Current slide"></section>
    <aside class="frameseq-presenter-side">
      <section class="frameseq-presenter-next">
        <div class="frameseq-presenter-section-heading">
          <span>Next</span>
          <span class="frameseq-presenter-next-label"></span>
        </div>
        <div class="frameseq-presenter-next-frame"></div>
      </section>
      <section class="frameseq-presenter-notes-panel">
        <div class="frameseq-presenter-section-heading">Speaker notes</div>
        <div class="frameseq-presenter-notes"></div>
      </section>
    </aside>
    <nav class="frameseq-presenter-controls" aria-label="Presenter controls">
      <button type="button" data-action="previous">← Previous</button>
      <span class="frameseq-counter"></span>
      <button type="button" data-action="next">Next →</button>
      <label>
        <span>Go to</span>
        <select class="frameseq-presenter-page-select" aria-label="Go to slide"></select>
      </label>
      <button type="button" data-action="audience">Open audience view</button>
    </nav>
  `;

  const required = <T extends Element>(selector: string): T => {
    const element = shell.querySelector<T>(selector);
    if (!element) throw new Error(`Presenter view is missing ${selector}`);
    return element;
  };

  required<HTMLElement>(".frameseq-presenter-title").textContent = deck.title;
  const currentHost = required<HTMLElement>(".frameseq-presenter-current");
  currentHost.append(root);
  const pageSelect = required<HTMLSelectElement>(".frameseq-presenter-page-select");
  deck.slides.forEach((slide, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}. ${slideLabel(slide, index)}`;
    pageSelect.append(option);
  });
  target.append(shell);

  return {
    shell,
    currentHost,
    nextFrame: required<HTMLElement>(".frameseq-presenter-next-frame"),
    nextLabel: required<HTMLElement>(".frameseq-presenter-next-label"),
    notes: required<HTMLElement>(".frameseq-presenter-notes"),
    currentLabel: required<HTMLElement>(".frameseq-presenter-title"),
    counter: required<HTMLElement>(".frameseq-counter"),
    pageSelect,
    timer: required<HTMLElement>(".frameseq-presenter-timer"),
    timerToggle: required<HTMLButtonElement>("[data-action='timer-toggle']"),
    laserToggle: required<HTMLButtonElement>("[data-action='laser-toggle']"),
    controls: required<HTMLElement>(".frameseq-presenter-controls"),
  };
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

  const searchParams = new URLSearchParams(location.search);
  const printMode = searchParams.has("print");
  const presenterMode = !printMode && searchParams.has("presenter");
  document.documentElement.classList.toggle("frameseq-print", printMode);
  document.documentElement.classList.toggle("frameseq-presenter-mode", presenterMode);
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

    const canvas = renderSlideCanvas(slide, index, deck);
    frame.append(canvas);
    root.append(frame);
    return {
      frame,
      canvas,
      maxStep: maxStep(slide),
      node: slide,
      label: slideLabel(slide, index),
    };
  });

  if (printMode) {
    target.append(root);
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

  const laserPointers = slides.map(({ canvas }) => {
    const pointer = document.createElement("span");
    pointer.className = "frameseq-laser-pointer";
    pointer.setAttribute("aria-hidden", "true");
    canvas.append(pointer);
    return pointer;
  });

  const presenter = presenterMode
    ? createPresenterView(target, root, deck)
    : undefined;
  const controls = presenter?.controls ?? document.createElement("nav");
  if (!presenter) {
    target.append(root);
    controls.className = "frameseq-controls";
    controls.setAttribute("aria-label", "Slide navigation");
    controls.innerHTML = `
      <button type="button" data-action="previous" aria-label="Previous slide">←</button>
      <span class="frameseq-counter"></span>
      <button type="button" data-action="next" aria-label="Next slide">→</button>
      <button type="button" data-action="presenter" aria-label="Open presenter view" title="Open presenter view">P</button>
    `;
    target.append(controls);
  }

  let currentSlide = 0;
  let currentStep = 0;
  let nextCanvas: HTMLElement | undefined;
  let pointerState = {
    slide: 0,
    x: 0.5,
    y: 0.5,
    visible: false,
  };

  function updateNextScale(): void {
    if (presenter && nextCanvas) {
      scaleCanvas(nextCanvas, presenter.nextFrame, deck);
    }
  }

  function updateScale(): void {
    const { frame, canvas } = slides[currentSlide];
    scaleCanvas(canvas, frame, deck);
  }

  function updatePresenter(): void {
    if (!presenter) return;

    const current = slides[currentSlide];
    const notes = current.node.props.notes;
    const noteText = typeof notes === "string" ? notes.trim() : "";
    presenter.currentLabel.textContent = `${currentSlide + 1}. ${current.label}`;
    presenter.notes.textContent = noteText || "No speaker notes for this slide.";
    presenter.notes.classList.toggle("is-empty", !noteText);
    presenter.pageSelect.value = String(currentSlide);

    presenter.nextFrame.replaceChildren();
    nextCanvas = undefined;
    const nextIndex = currentSlide + 1;
    if (nextIndex >= slides.length) {
      presenter.nextLabel.textContent = "End of presentation";
      presenter.nextFrame.classList.add("is-empty");
      presenter.nextFrame.textContent = "End";
      return;
    }

    presenter.nextFrame.classList.remove("is-empty");
    presenter.nextLabel.textContent = `${nextIndex + 1}. ${slides[nextIndex].label}`;
    nextCanvas = renderSlideCanvas(slides[nextIndex].node, nextIndex, deck);
    nextCanvas.querySelectorAll<HTMLElement>(".frameseq-step").forEach((element) => {
      element.classList.toggle("is-visible", Number(element.dataset.step ?? 0) <= 0);
    });
    presenter.nextFrame.append(nextCanvas);
    requestAnimationFrame(updateNextScale);
  }

  const syncChannel = typeof BroadcastChannel === "function"
    ? new BroadcastChannel(`frameseq-navigation:${location.pathname}`)
    : undefined;

  function renderLaserPointer(): void {
    laserPointers.forEach((pointer, index) => {
      const visible = pointerState.visible
        && pointerState.slide === index
        && currentSlide === index;
      pointer.classList.toggle("is-visible", visible);
      if (!visible) return;
      pointer.style.left = `${pointerState.x * 100}%`;
      pointer.style.top = `${pointerState.y * 100}%`;
    });
  }

  function broadcastPointer(): void {
    syncChannel?.postMessage({
      type: "pointer",
      ...pointerState,
    });
  }

  function setPointer(
    state: { slide: number; x: number; y: number; visible: boolean },
    shouldBroadcast = true,
  ): void {
    pointerState = {
      slide: Math.min(Math.max(Math.trunc(state.slide), 0), slides.length - 1),
      x: Math.min(Math.max(state.x, 0), 1),
      y: Math.min(Math.max(state.y, 0), 1),
      visible: state.visible,
    };
    renderLaserPointer();
    if (shouldBroadcast) broadcastPointer();
  }

  function hidePointer(shouldBroadcast = true): void {
    if (!pointerState.visible) return;
    pointerState = { ...pointerState, visible: false };
    renderLaserPointer();
    if (shouldBroadcast) broadcastPointer();
  }

  function broadcastNavigation(): void {
    syncChannel?.postMessage({
      type: "navigation",
      slide: currentSlide,
      step: currentStep,
    });
  }

  function update(shouldBroadcast = true): void {
    hidePointer(Boolean(presenter) && shouldBroadcast);
    slides.forEach(({ frame, canvas }, index) => {
      const active = index === currentSlide;
      frame.classList.toggle("is-active", active);
      if (!active) return;
      canvas.querySelectorAll<HTMLElement>(".frameseq-step").forEach((element) => {
        const step = Number(element.dataset.step ?? 0);
        element.classList.toggle("is-visible", step <= currentStep);
      });
    });

    const counter = presenter?.counter
      ?? controls.querySelector<HTMLElement>(".frameseq-counter");
    if (counter) {
      const stepSuffix = slides[currentSlide].maxStep > 0
        ? ` · ${currentStep}/${slides[currentSlide].maxStep}`
        : "";
      counter.textContent = `${currentSlide + 1}/${slides.length}${stepSuffix}`;
    }
    history.replaceState(null, "", `#${currentSlide + 1}`);
    updatePresenter();
    if (shouldBroadcast) broadcastNavigation();
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

  function goTo(index: number): void {
    currentSlide = Math.min(Math.max(index, 0), slides.length - 1);
    currentStep = 0;
    update();
  }

  function openMode(mode: "audience" | "presenter"): void {
    const url = new URL(location.href);
    url.searchParams.delete("print");
    if (mode === "presenter") {
      url.searchParams.set("presenter", "1");
    } else {
      url.searchParams.delete("presenter");
    }
    url.hash = String(currentSlide + 1);
    window.open(url.href, `frameseq-${mode}`);
  }

  controls.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (button?.dataset.action === "next") next();
    if (button?.dataset.action === "previous") previous();
    if (button?.dataset.action === "presenter") openMode("presenter");
    if (button?.dataset.action === "audience") openMode("audience");
  });

  presenter?.pageSelect.addEventListener("change", () => {
    goTo(Number(presenter.pageSelect.value));
  });

  if (presenter) {
    let timerElapsed = 0;
    let timerStarted = performance.now();
    let timerRunning = true;
    let laserEnabled = false;
    let pointerFrame = 0;
    let pendingPointer: typeof pointerState | undefined;

    const updateTimer = () => {
      const elapsed = timerElapsed + (timerRunning ? performance.now() - timerStarted : 0);
      presenter.timer.textContent = formatDuration(elapsed);
      presenter.timerToggle.textContent = timerRunning ? "Pause" : "Resume";
    };

    const flushPointer = () => {
      pointerFrame = 0;
      if (!pendingPointer) return;
      const nextPointer = pendingPointer;
      pendingPointer = undefined;
      setPointer(nextPointer);
    };

    const queuePointer = (state: typeof pointerState) => {
      pendingPointer = state;
      if (!pointerFrame) pointerFrame = requestAnimationFrame(flushPointer);
    };

    const setLaserEnabled = (enabled: boolean) => {
      laserEnabled = enabled;
      presenter.laserToggle.textContent = enabled ? "Laser: On" : "Laser: Off";
      presenter.laserToggle.setAttribute("aria-pressed", String(enabled));
      presenter.currentHost.classList.toggle("is-laser-active", enabled);
      if (!enabled) queuePointer({ ...pointerState, visible: false });
    };

    const toggleLaser = () => setLaserEnabled(!laserEnabled);

    presenter.currentHost.addEventListener("pointermove", (event) => {
      if (!laserEnabled) return;
      const canvas = slides[currentSlide].canvas;
      const bounds = canvas.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;
      const visible = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      queuePointer({ slide: currentSlide, x, y, visible });
    });

    presenter.currentHost.addEventListener("pointerleave", () => {
      if (laserEnabled) queuePointer({ ...pointerState, visible: false });
    });

    presenter.currentHost.addEventListener("pointerup", (event) => {
      if (laserEnabled && event.pointerType === "touch") {
        queuePointer({ ...pointerState, visible: false });
      }
    });

    presenter.currentHost.addEventListener("pointercancel", () => {
      if (laserEnabled) queuePointer({ ...pointerState, visible: false });
    });

    presenter.shell.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (button?.dataset.action === "laser-toggle") toggleLaser();
      if (button?.dataset.action === "timer-toggle") {
        if (timerRunning) {
          timerElapsed += performance.now() - timerStarted;
        } else {
          timerStarted = performance.now();
        }
        timerRunning = !timerRunning;
        updateTimer();
      }
      if (button?.dataset.action === "timer-reset") {
        timerElapsed = 0;
        timerStarted = performance.now();
        timerRunning = true;
        updateTimer();
      }
    });
    updateTimer();
    window.setInterval(updateTimer, 250);
  }

  syncChannel?.addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = event.data;
    if (!message || typeof message !== "object") return;
    const data = message as {
      type?: unknown;
      slide?: unknown;
      step?: unknown;
      x?: unknown;
      y?: unknown;
      visible?: unknown;
    };
    if (data.type === "request-state") {
      broadcastNavigation();
      if (presenter) broadcastPointer();
      return;
    }
    if (data.type === "pointer"
      && typeof data.slide === "number"
      && typeof data.x === "number"
      && typeof data.y === "number"
      && typeof data.visible === "boolean") {
      setPointer({
        slide: data.slide,
        x: data.x,
        y: data.y,
        visible: data.visible,
      }, false);
      return;
    }
    if (data.type !== "navigation"
      || typeof data.slide !== "number"
      || typeof data.step !== "number") return;

    currentSlide = Math.min(Math.max(Math.trunc(data.slide), 0), slides.length - 1);
    currentStep = Math.min(
      Math.max(Math.trunc(data.step), 0),
      slides[currentSlide].maxStep,
    );
    update(false);
  });

  addEventListener("keydown", (event) => {
    const modified = event.ctrlKey || event.altKey || event.metaKey;
    if (["ArrowRight", "PageDown", " "].includes(event.key)) {
      event.preventDefault();
      next();
    }
    if (["ArrowLeft", "PageUp"].includes(event.key)) {
      event.preventDefault();
      previous();
    }
    if (!presenterMode && event.code === "KeyP" && !modified && !event.repeat) {
      event.preventDefault();
      openMode("presenter");
    }
    if (presenterMode
      && event.code === "KeyL"
      && event.ctrlKey
      && !event.altKey
      && !event.metaKey
      && !event.shiftKey
      && !event.repeat) {
      event.preventDefault();
      presenter?.laserToggle.click();
    }
  });

  const initialSlide = Math.min(
    Math.max(Number(location.hash.slice(1) || 1) - 1, 0),
    Math.max(slides.length - 1, 0),
  );
  currentSlide = initialSlide;
  const resizeObserver = new ResizeObserver(() => {
    updateScale();
    updateNextScale();
  });
  resizeObserver.observe(presenter?.currentHost ?? root);
  if (presenter) resizeObserver.observe(presenter.nextFrame);
  update(false);
  syncChannel?.postMessage({ type: "request-state" });
  document.documentElement.dataset.ready = "true";
}
