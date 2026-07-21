import katex from "katex";
import type { DeckDefinition, FrameSeqNode } from "./core";

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

export function mountDeck(deck: DeckDefinition, target: HTMLElement): void {
  document.title = deck.title;
  target.replaceChildren();

  const printMode = new URLSearchParams(location.search).has("print");
  document.documentElement.classList.toggle("frameseq-print", printMode);
  document.documentElement.style.setProperty("--slide-width", `${deck.canvasWidth}px`);
  document.documentElement.style.setProperty("--slide-height", `${deck.canvasHeight}px`);
  document.documentElement.style.setProperty("--slide-ratio", `${deck.canvasWidth} / ${deck.canvasHeight}`);

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
    canvas.setAttribute("role", "group");
    canvas.setAttribute("aria-roledescription", "slide");
    canvas.setAttribute("aria-label", `${index + 1} of ${deck.slides.length}`);
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
    const bounds = frame.getBoundingClientRect();
    const scale = Math.min(bounds.width / deck.canvasWidth, bounds.height / deck.canvasHeight);
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
