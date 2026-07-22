import katex from "katex";
import QRCode from "qrcode";
import type {
  SlidesRootDefinition,
  FrameSeqNode,
  Length,
  PresentationFontOptions,
} from "./core";
import { themeCssVariables } from "./theme";

const remoteSyncEvent = "frameseq:remote-sync";
const localRemoteAvailable = __FRAMESEQ_REMOTE_ENABLED__ && Boolean(import.meta.hot);

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
    case "latex": {
      element = document.createElement("div");
      const svg = node.props.svg;
      if (typeof svg === "string" && svg.trim()) {
        element.innerHTML = svg;
      } else {
        element.textContent = "LaTeX content was not compiled. Use the FrameSeq CLI and install node-tectonic.";
        element.classList.add("frameseq-latex-error");
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

function addAutomaticTitlePage(canvas: HTMLElement, slides: SlidesRootDefinition): void {
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
  titlePage.append(titlePageItem("frameseq-cover-title", slides.title));
  if (slides.subtitle) {
    titlePage.append(titlePageItem("frameseq-cover-subtitle", slides.subtitle));
  }

  const rule = document.createElement("div");
  rule.className = "frameseq-cover-rule";
  titlePage.append(rule);

  if (slides.author) {
    titlePage.append(titlePageItem("frameseq-cover-author", slides.author));
  }
  if (slides.institute) {
    titlePage.append(titlePageItem("frameseq-cover-institute", slides.institute));
  }
  if (slides.date) {
    titlePage.append(titlePageItem("frameseq-cover-date", slides.date));
  }
  canvas.append(titlePage);
}

function addThemeChrome(
  canvas: HTMLElement,
  slide: FrameSeqNode,
  index: number,
  slides: SlidesRootDefinition,
): void {
  const chrome = slides.theme.chrome;
  const isCover = hasClass(slide, "frameseq-cover-slide");
  if (isCover && chrome.autoTitlePage) {
    addAutomaticTitlePage(canvas, slides);
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
    title.textContent = slides.title;

    const number = document.createElement("span");
    number.className = "frameseq-theme-footer-details";
    number.textContent = chrome.slideNumber ? `${index + 1} / ${slides.slides.length}` : "";

    footer.append(title, number);
    canvas.classList.add("frameseq-has-footer");
    canvas.append(footer);
    return;
  }

  const author = document.createElement("span");
  author.className = "frameseq-theme-footer-author";
  author.textContent = slides.author ?? slides.title;

  const institute = document.createElement("span");
  institute.className = "frameseq-theme-footer-institute";
  institute.textContent = slides.institute ?? "";

  const details = document.createElement("span");
  details.className = "frameseq-theme-footer-details";
  details.textContent = [
    slides.date,
    chrome.slideNumber ? `${index + 1} / ${slides.slides.length}` : undefined,
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
  slides: SlidesRootDefinition,
): HTMLElement {
  const label = slideLabel(slide, index);
  const canvas = renderNode(slide, String(index));
  addThemeChrome(canvas, slide, index, slides);
  canvas.dataset.frameseqSlideLabel = label;
  if (slide.props.allowEmpty === true) {
    canvas.dataset.frameseqAllowEmpty = "true";
  }
  canvas.setAttribute("role", "group");
  canvas.setAttribute("aria-roledescription", "slide");
  canvas.setAttribute(
    "aria-label",
    `${index + 1} of ${slides.slides.length}: ${label}`,
  );
  return canvas;
}

function scaleCanvas(canvas: HTMLElement, frame: HTMLElement, slides: SlidesRootDefinition): void {
  const frameWidth = frame.clientWidth;
  const frameHeight = frame.clientHeight;
  const scale = Math.min(frameWidth / slides.canvasWidth, frameHeight / slides.canvasHeight);
  canvas.style.left = `${(frameWidth - slides.canvasWidth) / 2}px`;
  canvas.style.top = `${(frameHeight - slides.canvasHeight) / 2}px`;
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

interface RemoteElements {
  shell: HTMLElement;
  currentHost: HTMLElement;
  currentLabel: HTMLElement;
  counter: HTMLElement;
  status: HTMLElement;
  laserToggle: HTMLButtonElement;
  controls: HTMLElement;
}

type SyncMessage = {
  type: "request-state";
} | {
  type: "navigation";
  slide: number;
  step: number;
} | {
  type: "pointer";
  slide: number;
  x: number;
  y: number;
  visible: boolean;
};

interface RemoteEnvelope {
  session: string;
  sender: string;
  message: SyncMessage;
}

function createPresenterView(
  target: HTMLElement,
  root: HTMLElement,
  slides: SlidesRootDefinition,
): PresenterElements {
  const pairedRemote = localRemoteAvailable
    && Boolean(new URLSearchParams(location.search).get("session"));
  const shell = document.createElement("main");
  shell.className = "frameseq-presenter";
  shell.dataset.mobilePanel = "notes";
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
      <div class="frameseq-presenter-mobile-tabs" role="tablist" aria-label="Presenter detail">
        <button type="button" role="tab" data-action="mobile-panel" data-panel="notes" aria-selected="true">Notes</button>
        <button type="button" role="tab" data-action="mobile-panel" data-panel="next" aria-selected="false">Next slide</button>
      </div>
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
      ${localRemoteAvailable
        ? `<button type="button" data-action="${pairedRemote ? "remote-here" : "remote-pair"}">${pairedRemote ? "Simple remote" : "Phone remote"}</button>`
        : ""}
      <button type="button" data-action="audience">Open audience view</button>
    </nav>
  `;

  const required = <T extends Element>(selector: string): T => {
    const element = shell.querySelector<T>(selector);
    if (!element) throw new Error(`Presenter view is missing ${selector}`);
    return element;
  };

  required<HTMLElement>(".frameseq-presenter-title").textContent = slides.title;
  const currentHost = required<HTMLElement>(".frameseq-presenter-current");
  currentHost.append(root);
  const pageSelect = required<HTMLSelectElement>(".frameseq-presenter-page-select");
  slides.slides.forEach((slide, index) => {
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

function createRemoteView(
  target: HTMLElement,
  root: HTMLElement,
  slides: SlidesRootDefinition,
): RemoteElements {
  const shell = document.createElement("main");
  shell.className = "frameseq-remote";
  shell.innerHTML = `
    <header class="frameseq-remote-header">
      <div>
        <div class="frameseq-remote-kicker">Phone remote</div>
        <div class="frameseq-remote-title"></div>
      </div>
      <div class="frameseq-remote-header-actions">
        <div class="frameseq-remote-status is-waiting">Connecting…</div>
        <button type="button" data-action="presenter-here">Presenter view</button>
      </div>
    </header>
    <section class="frameseq-remote-current" aria-label="Current slide"></section>
    <div class="frameseq-remote-slide-label"></div>
    <nav class="frameseq-remote-controls" aria-label="Remote controls">
      <button type="button" data-action="previous">← Previous</button>
      <span class="frameseq-counter"></span>
      <button type="button" data-action="next">Next →</button>
      <button type="button" class="frameseq-remote-laser" data-action="laser-toggle" aria-pressed="false">Laser: Off</button>
    </nav>
    <p class="frameseq-remote-hint">Enable the laser, then drag across the slide preview.</p>
  `;

  const required = <T extends Element>(selector: string): T => {
    const element = shell.querySelector<T>(selector);
    if (!element) throw new Error(`Phone remote is missing ${selector}`);
    return element;
  };

  required<HTMLElement>(".frameseq-remote-title").textContent = slides.title;
  const currentHost = required<HTMLElement>(".frameseq-remote-current");
  currentHost.append(root);
  target.append(shell);

  return {
    shell,
    currentHost,
    currentLabel: required<HTMLElement>(".frameseq-remote-slide-label"),
    counter: required<HTMLElement>(".frameseq-counter"),
    status: required<HTMLElement>(".frameseq-remote-status"),
    laserToggle: required<HTMLButtonElement>("[data-action='laser-toggle']"),
    controls: required<HTMLElement>(".frameseq-remote-controls"),
  };
}

function createRemoteSession(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname === "[::1]";
}

function controllerUrl(origin: string, session: string): string {
  const source = new URL(location.href);
  const networkOrigin = new URL(origin);
  source.protocol = networkOrigin.protocol;
  source.host = networkOrigin.host;
  source.searchParams.delete("presenter");
  source.searchParams.delete("print");
  source.searchParams.set("remote", "1");
  source.searchParams.set("session", session);
  source.hash = "";
  return source.href;
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

export function mountSlides(slidesDocument: SlidesRootDefinition, target: HTMLElement): void {
  document.title = slidesDocument.title;
  target.replaceChildren();

  const searchParams = new URLSearchParams(location.search);
  const printMode = searchParams.has("print");
  const pptxMode = printMode && searchParams.has("pptx");
  const remoteMode = !printMode && searchParams.get("remote") === "1";
  const presenterMode = !printMode && !remoteMode && searchParams.has("presenter");
  document.documentElement.classList.toggle("frameseq-print", printMode);
  document.documentElement.classList.toggle("frameseq-presenter-mode", presenterMode);
  document.documentElement.classList.toggle("frameseq-remote-mode", remoteMode);
  document.documentElement.style.setProperty("--slide-width", `${slidesDocument.canvasWidth}px`);
  document.documentElement.style.setProperty("--slide-height", `${slidesDocument.canvasHeight}px`);
  document.documentElement.style.setProperty("--slide-ratio", `${slidesDocument.canvasWidth} / ${slidesDocument.canvasHeight}`);
  document.documentElement.dataset.frameseqTheme = slidesDocument.theme.name;
  document.documentElement.dataset.frameseqThemeFamily = slidesDocument.theme.family;
  document.documentElement.dataset.frameseqCoverLayout = slidesDocument.theme.coverLayout;
  for (const [name, value] of Object.entries(themeCssVariables(slidesDocument.theme))) {
    document.documentElement.style.setProperty(name, value);
  }
  applyPresentationFont(slidesDocument.font);

  if (printMode) {
    const pageStyle = document.createElement("style");
    pageStyle.textContent = `@page { size: ${slidesDocument.canvasWidth / 96}in ${slidesDocument.canvasHeight / 96}in; margin: 0; }`;
    document.head.append(pageStyle);
  }

  const root = document.createElement("main");
  root.className = "frameseq-slides";
  applyStyles(root, slidesDocument.node.styles);

  const slides = slidesDocument.slides.map((slide, index) => {
    const frame = document.createElement("section");
    frame.className = "frameseq-slide-frame";
    frame.dataset.index = String(index);

    const canvas = renderSlideCanvas(slide, index, slidesDocument);
    if (pptxMode && typeof slide.props.notes === "string") {
      canvas.dataset.frameseqNotes = slide.props.notes;
    }
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
    ? createPresenterView(target, root, slidesDocument)
    : undefined;
  const remote = remoteMode
    ? createRemoteView(target, root, slidesDocument)
    : undefined;
  const controls = presenter?.controls ?? remote?.controls ?? document.createElement("nav");
  if (!presenter && !remote) {
    target.append(root);
    controls.className = "frameseq-controls";
    controls.setAttribute("aria-label", "Slide navigation");
    controls.innerHTML = `
      <button type="button" data-action="previous" aria-label="Previous slide">←</button>
      <span class="frameseq-counter"></span>
      <button type="button" data-action="next" aria-label="Next slide">→</button>
      ${localRemoteAvailable ? '<button type="button" data-action="remote-pair" aria-label="Pair phone remote" title="Pair phone remote">R</button>' : ""}
      <button type="button" data-action="presenter" aria-label="Open presenter view" title="Open presenter view">P</button>
    `;
    target.append(controls);
  }

  let currentSlide = 0;
  let currentStep = 0;
  let remoteSession = searchParams.get("session")?.trim() ?? "";
  const syncClientId = createRemoteSession();
  let nextCanvas: HTMLElement | undefined;
  let pointerState = {
    slide: 0,
    x: 0.5,
    y: 0.5,
    visible: false,
  };

  function updateNextScale(): void {
    if (presenter && nextCanvas) {
      scaleCanvas(nextCanvas, presenter.nextFrame, slidesDocument);
    }
  }

  function updateScale(): void {
    const { frame, canvas } = slides[currentSlide];
    scaleCanvas(canvas, frame, slidesDocument);
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
    nextCanvas = renderSlideCanvas(slides[nextIndex].node, nextIndex, slidesDocument);
    nextCanvas.querySelectorAll<HTMLElement>(".frameseq-step").forEach((element) => {
      element.classList.toggle("is-visible", Number(element.dataset.step ?? 0) <= 0);
    });
    presenter.nextFrame.append(nextCanvas);
    requestAnimationFrame(updateNextScale);
  }

  function updateRemote(): void {
    if (!remote) return;
    remote.currentLabel.textContent = `${currentSlide + 1}. ${slides[currentSlide].label}`;
  }

  const syncChannel = typeof BroadcastChannel === "function"
    ? new BroadcastChannel(`frameseq-navigation:${location.pathname}`)
    : undefined;

  function postSyncMessage(message: SyncMessage): void {
    syncChannel?.postMessage(message);
    if (!remoteSession || !localRemoteAvailable) return;
    import.meta.hot?.send(remoteSyncEvent, {
      session: remoteSession,
      sender: syncClientId,
      message,
    } satisfies RemoteEnvelope);
  }

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
    postSyncMessage({
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
    postSyncMessage({
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
      ?? remote?.counter
      ?? controls.querySelector<HTMLElement>(".frameseq-counter");
    if (counter) {
      const stepSuffix = slides[currentSlide].maxStep > 0
        ? ` · ${currentStep}/${slides[currentSlide].maxStep}`
        : "";
      counter.textContent = `${currentSlide + 1}/${slides.length}${stepSuffix}`;
    }
    history.replaceState(null, "", `#${currentSlide + 1}`);
    updatePresenter();
    updateRemote();
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

  function modeUrl(mode: "audience" | "presenter" | "remote"): URL {
    const url = new URL(location.href);
    url.searchParams.delete("print");
    if (mode === "presenter") {
      url.searchParams.set("presenter", "1");
      url.searchParams.delete("remote");
    } else if (mode === "remote") {
      url.searchParams.set("remote", "1");
      url.searchParams.delete("presenter");
    } else {
      url.searchParams.delete("presenter");
      url.searchParams.delete("remote");
    }
    url.hash = String(currentSlide + 1);
    return url;
  }

  function openMode(mode: "audience" | "presenter"): void {
    const url = modeUrl(mode);
    window.open(url.href, `frameseq-${mode}`);
  }

  function switchMode(mode: "presenter" | "remote"): void {
    location.assign(modeUrl(mode));
  }

  async function openRemotePairing(): Promise<void> {
    if (!localRemoteAvailable) return;
    if (!remoteSession) remoteSession = createRemoteSession();

    const currentUrl = new URL(location.href);
    currentUrl.searchParams.set("session", remoteSession);
    history.replaceState(null, "", currentUrl);

    const dialog = document.createElement("dialog");
    dialog.className = "frameseq-remote-dialog";
    dialog.innerHTML = `
      <div class="frameseq-remote-dialog-header">
        <div>
          <div class="frameseq-remote-dialog-kicker">Local network</div>
          <h2>Pair a phone remote</h2>
        </div>
        <button type="button" data-action="close" aria-label="Close">×</button>
      </div>
      <p>Connect the phone and this computer to the same Wi-Fi, then scan the code.</p>
      <div class="frameseq-remote-qr" aria-live="polite">Preparing local address…</div>
      <label class="frameseq-remote-address-picker">
        <span>Network address</span>
        <select></select>
      </label>
      <code class="frameseq-remote-url"></code>
      <div class="frameseq-remote-dialog-actions">
        <button type="button" data-action="copy">Copy link</button>
        <button type="button" data-action="close">Done</button>
      </div>
      <p class="frameseq-remote-dialog-note">Keep the presentation server and this browser page open while presenting.</p>
    `;
    target.append(dialog);

    const qr = dialog.querySelector<HTMLElement>(".frameseq-remote-qr");
    const picker = dialog.querySelector<HTMLSelectElement>("select");
    const urlLabel = dialog.querySelector<HTMLElement>(".frameseq-remote-url");
    const copyButton = dialog.querySelector<HTMLButtonElement>("[data-action='copy']");
    if (!qr || !picker || !urlLabel || !copyButton) {
      dialog.remove();
      throw new Error("Phone remote dialog is incomplete");
    }

    const renderCode = async (origin: string) => {
      const url = controllerUrl(origin, remoteSession);
      qr.innerHTML = await QRCode.toString(url, {
        type: "svg",
        width: 280,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#020617", light: "#ffffff" },
      });
      urlLabel.textContent = url;
    };

    try {
      const response = await fetch("/__frameseq/remote-info", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { origins?: unknown };
      const origins = Array.isArray(data.origins)
        ? data.origins.filter((origin): origin is string => typeof origin === "string")
        : [];
      if (!isLoopbackHostname(location.hostname)) origins.unshift(location.origin);
      const uniqueOrigins = [...new Set(origins)];
      if (uniqueOrigins.length === 0) {
        throw new Error("No local-network address was found");
      }
      uniqueOrigins.forEach((origin) => {
        const option = document.createElement("option");
        option.value = origin;
        option.textContent = origin;
        picker.append(option);
      });
      await renderCode(uniqueOrigins[0]);
      picker.addEventListener("change", () => void renderCode(picker.value));
    } catch (error) {
      qr.textContent = error instanceof Error
        ? `Could not create a phone link: ${error.message}`
        : "Could not create a phone link.";
      picker.closest("label")?.remove();
      urlLabel.remove();
      copyButton.remove();
    }

    dialog.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset.action;
      if (action === "close") dialog.close();
      if (action === "copy" && urlLabel.textContent) {
        if (!navigator.clipboard) {
          copyButton.textContent = "Copy unavailable";
          return;
        }
        void navigator.clipboard.writeText(urlLabel.textContent).then(() => {
          copyButton.textContent = "Copied";
        }).catch(() => {
          copyButton.textContent = "Copy failed";
        });
      }
    });
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
  }

  controls.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (button?.dataset.action === "next") next();
    if (button?.dataset.action === "previous") previous();
    if (button?.dataset.action === "presenter") openMode("presenter");
    if (button?.dataset.action === "audience") openMode("audience");
    if (button?.dataset.action === "remote-pair") void openRemotePairing();
    if (button?.dataset.action === "remote-here") switchMode("remote");
  });

  remote?.shell.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset.action;
    if (action === "presenter-here") switchMode("presenter");
  });

  presenter?.pageSelect.addEventListener("change", () => {
    goTo(Number(presenter.pageSelect.value));
  });

  if (presenter) {
    let timerElapsed = 0;
    let timerStarted = performance.now();
    let timerRunning = true;

    const updateTimer = () => {
      const elapsed = timerElapsed + (timerRunning ? performance.now() - timerStarted : 0);
      presenter.timer.textContent = formatDuration(elapsed);
      presenter.timerToggle.textContent = timerRunning ? "Pause" : "Resume";
    };

    presenter.shell.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (button?.dataset.action === "mobile-panel") {
        const panel = button.dataset.panel;
        if (panel === "notes" || panel === "next") {
          presenter.shell.dataset.mobilePanel = panel;
          presenter.shell
            .querySelectorAll<HTMLButtonElement>("[data-action='mobile-panel']")
            .forEach((candidate) => {
              candidate.setAttribute("aria-selected", String(candidate.dataset.panel === panel));
            });
        }
      }
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

  const laserHost = presenter?.currentHost ?? remote?.currentHost;
  const laserToggle = presenter?.laserToggle ?? remote?.laserToggle;
  if (laserHost && laserToggle) {
    let laserEnabled = false;
    let pointerFrame = 0;
    let pendingPointer: typeof pointerState | undefined;

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
      laserToggle.textContent = enabled ? "Laser: On" : "Laser: Off";
      laserToggle.setAttribute("aria-pressed", String(enabled));
      laserHost.classList.toggle("is-laser-active", enabled);
      if (!enabled) queuePointer({ ...pointerState, visible: false });
    };

    laserToggle.addEventListener("click", () => setLaserEnabled(!laserEnabled));
    laserHost.addEventListener("pointermove", (event) => {
      if (!laserEnabled) return;
      const canvas = slides[currentSlide].canvas;
      const bounds = canvas.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;
      const visible = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      queuePointer({ slide: currentSlide, x, y, visible });
    });
    laserHost.addEventListener("pointerleave", () => {
      if (laserEnabled) queuePointer({ ...pointerState, visible: false });
    });
    laserHost.addEventListener("pointerup", (event) => {
      if (laserEnabled && event.pointerType === "touch") {
        queuePointer({ ...pointerState, visible: false });
      }
    });
    laserHost.addEventListener("pointercancel", () => {
      if (laserEnabled) queuePointer({ ...pointerState, visible: false });
    });
  }

  function setRemoteConnection(label: string, state: "waiting" | "connected" | "disconnected"): void {
    if (!remote) return;
    remote.status.textContent = label;
    remote.status.classList.toggle("is-waiting", state === "waiting");
    remote.status.classList.toggle("is-connected", state === "connected");
    remote.status.classList.toggle("is-disconnected", state === "disconnected");
  }

  function handleSyncMessage(message: unknown, source: "broadcast" | "remote"): void {
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
      if (!remote) {
        broadcastNavigation();
        broadcastPointer();
      }
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
      if (source === "remote") syncChannel?.postMessage(data);
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
    if (source === "remote") syncChannel?.postMessage(data);
    if (remote) setRemoteConnection("Connected", "connected");
  }

  syncChannel?.addEventListener("message", (event: MessageEvent<unknown>) => {
    handleSyncMessage(event.data, "broadcast");
  });

  import.meta.hot?.on(remoteSyncEvent, (payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const envelope = payload as { session?: unknown; sender?: unknown; message?: unknown };
    if (!remoteSession
      || envelope.session !== remoteSession
      || envelope.sender === syncClientId) return;
    handleSyncMessage(envelope.message, "remote");
  });
  import.meta.hot?.on("vite:ws:connect", () => {
    if (!remote || !remoteSession) return;
    setRemoteConnection("Waiting for presentation…", "waiting");
    postSyncMessage({ type: "request-state" });
  });
  import.meta.hot?.on("vite:ws:disconnect", () => {
    if (remote) setRemoteConnection("Disconnected", "disconnected");
  });

  if (remote) {
    if (!localRemoteAvailable) {
      setRemoteConnection("Local remote unavailable", "disconnected");
    } else if (!remoteSession) {
      setRemoteConnection("Invalid pairing link", "disconnected");
    } else {
      setRemoteConnection("Waiting for presentation…", "waiting");
    }
  }

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
    if (!presenterMode && !remoteMode && event.code === "KeyP" && !modified && !event.repeat) {
      event.preventDefault();
      openMode("presenter");
    }
    if ((presenterMode || remoteMode)
      && event.code === "KeyL"
      && event.ctrlKey
      && !event.altKey
      && !event.metaKey
      && !event.shiftKey
      && !event.repeat) {
      event.preventDefault();
      (presenter?.laserToggle ?? remote?.laserToggle)?.click();
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
  resizeObserver.observe(presenter?.currentHost ?? remote?.currentHost ?? root);
  if (presenter) resizeObserver.observe(presenter.nextFrame);
  update(false);
  postSyncMessage({ type: "request-state" });
  document.documentElement.dataset.ready = "true";
}
