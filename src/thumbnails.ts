interface ThumbnailSlide {
  frame: HTMLElement;
  canvas: HTMLElement;
  label: string;
}

/** How far the pointer travels before a press on a thumbnail becomes a drag. */
const dragThreshold = 5;

/** Kept across hot swaps, so the rail does not lose its place each time the deck is saved. */
let activeIndex = 0;

function post(message: Record<string, unknown>): void {
  if (window.parent !== window) window.parent.postMessage(message, "*");
}

/**
 * Every slide at once, small, for the rail beside FrameSeq Studio's editor.
 *
 * The thumbnails are the real slides rendered by the same runtime, not pictures of them, so they
 * follow every save. They say what happened to them and leave it to the Studio to change the
 * slide document: a click picks a slide, a drag asks for it to be moved, and a right-click asks
 * for the slide menu.
 */
export function mountThumbnails(
  target: HTMLElement,
  root: HTMLElement,
  slides: ThumbnailSlide[],
  fit: (canvas: HTMLElement, frame: HTMLElement) => void,
  signal: AbortSignal,
): void {
  // The palette the Studio starts in; the Studio changes the attribute itself after that.
  const theme = new URLSearchParams(location.search).get("studio-theme");
  if (theme && !document.documentElement.dataset.studioTheme) {
    document.documentElement.dataset.studioTheme = theme;
  }
  root.classList.add("frameseq-thumbnails");
  root.removeAttribute("tabindex");
  root.replaceChildren();
  activeIndex = Math.min(activeIndex, Math.max(slides.length - 1, 0));

  // Slides made by one top-level statement, such as a loop or a call to a helper, can only move
  // together, since no single block of lines belongs to any one of them.
  const statementOf = slides.map(({ canvas }) => canvas.dataset.frameseqSlideStatement ?? "");
  const groupStart = statementOf.map((key, index) => {
    let start = index;
    while (key && start > 0 && statementOf[start - 1] === key) start -= 1;
    return start;
  });
  const groupEnd = statementOf.map((key, index) => {
    let end = index;
    while (key && end < statementOf.length - 1 && statementOf[end + 1] === key) end += 1;
    return end;
  });

  const items = slides.map(({ frame, canvas, label }, index) => {
    const item = document.createElement("div");
    item.className = "frameseq-thumbnail";
    item.dataset.index = String(index);
    item.tabIndex = -1;
    item.setAttribute("role", "option");
    item.setAttribute("aria-label", `Slide ${index + 1}: ${label}`);
    item.title = `${index + 1}. ${label}`;
    const size = groupEnd[index] - groupStart[index] + 1;
    if (size > 1) {
      item.classList.add("is-grouped");
      item.classList.toggle("is-group-start", groupStart[index] === index);
      item.classList.toggle("is-group-end", groupEnd[index] === index);
      item.title += `
Made by one statement together with ${size - 1} other slide${size === 2 ? "" : "s"}; they move together.`;
    }

    const number = document.createElement("span");
    number.className = "frameseq-thumbnail-number";
    number.textContent = String(index + 1);

    const body = document.createElement("div");
    body.className = "frameseq-thumbnail-body";
    const caption = document.createElement("span");
    caption.className = "frameseq-thumbnail-label";
    caption.textContent = label;

    frame.classList.add("is-active");
    canvas.querySelectorAll<HTMLElement>(".frameseq-step").forEach((element) => {
      element.classList.add("is-visible");
    });
    body.append(frame, caption);
    item.append(number, body);
    root.append(item);
    return item;
  });
  root.setAttribute("role", "listbox");
  root.setAttribute("aria-label", "Slides");
  target.append(root);

  // Where each slide came from, so the Studio can find the lines to move.
  const range = (value: string | undefined): number[] | undefined => {
    const numbers = value?.split(":").map(Number);
    return numbers && numbers.every((number) => Number.isInteger(number)) ? numbers : undefined;
  };
  post({
    type: "frameseq.thumbnail-outline",
    slides: slides.map(({ canvas, label }) => {
      const statement = range(canvas.dataset.frameseqSlideStatement);
      const source = range(canvas.dataset.frameseqSource);
      return {
        label,
        statement: statement ? { start: statement[0], end: statement[1] } : undefined,
        source: source ? { line: source[0], column: source[1], start: source[2], end: source[3] } : undefined,
      };
    }),
  });

  const insertion = document.createElement("div");
  insertion.className = "frameseq-thumbnail-insertion";
  insertion.setAttribute("aria-hidden", "true");

  const rescale = (): void => {
    for (const { frame, canvas } of slides) fit(canvas, frame);
  };
  rescale();
  const observer = new ResizeObserver(rescale);
  observer.observe(root);
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });

  function setActive(index: number, reveal: boolean): void {
    activeIndex = Math.min(Math.max(index, 0), items.length - 1);
    items.forEach((item, position) => {
      const active = position === activeIndex;
      item.classList.toggle("is-current", active);
      item.setAttribute("aria-selected", String(active));
    });
    if (reveal) items[activeIndex]?.scrollIntoView({ block: "nearest" });
  }
  setActive(activeIndex, false);

  function choose(index: number): void {
    setActive(index, true);
    post({ type: "frameseq.thumbnail", index });
  }

  let drag: {
    index: number;
    pointerId: number;
    originY: number;
    moved: boolean;
    target?: number;
  } | undefined;

  /** The places a slide can be dropped: between groups, never inside one. */
  const boundaries = [...items.keys()].filter((index) => groupStart[index] === index).concat(items.length);
  const insertionIndex = (y: number): number => {
    const edge = (boundary: number): number => {
      if (boundary >= items.length) return items[items.length - 1].getBoundingClientRect().bottom;
      return items[boundary].getBoundingClientRect().top;
    };
    return boundaries.reduce((best, boundary) => (
      Math.abs(edge(boundary) - y) < Math.abs(edge(best) - y) ? boundary : best
    ), boundaries[0]);
  };
  const members = (index: number): HTMLElement[] => items.slice(groupStart[index], groupEnd[index] + 1);

  // The marker sits on the document rather than in the list, so it never shifts the thumbnails.
  const showInsertion = (index: number): void => {
    const reference = items[Math.min(index, items.length - 1)];
    const box = reference.getBoundingClientRect();
    const top = (index < items.length ? box.top - 6 : box.bottom + 4) + window.scrollY;
    insertion.style.top = `${top}px`;
    insertion.style.left = `${box.left + window.scrollX}px`;
    insertion.style.width = `${box.width}px`;
    document.body.append(insertion);
  };
  signal.addEventListener("abort", () => insertion.remove(), { once: true });

  root.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const item = event.target.closest<HTMLElement>(".frameseq-thumbnail");
    if (!item) return;
    drag = {
      index: Number(item.dataset.index),
      pointerId: event.pointerId,
      originY: event.clientY,
      moved: false,
    };
  });

  addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.abs(event.clientY - drag.originY) < dragThreshold) return;
    if (!drag.moved) {
      drag.moved = true;
      members(drag.index).forEach((member) => member.classList.add("is-dragging"));
      document.documentElement.classList.add("frameseq-thumbnail-dragging");
      try {
        root.setPointerCapture(event.pointerId);
      } catch {
        // A lost capture only means the drag ends when the pointer leaves the rail.
      }
    }
    drag.target = insertionIndex(event.clientY);
    showInsertion(drag.target);
    // Near either edge, scroll the rail so a slide can be carried past what is visible.
    const edge = 36;
    if (event.clientY < edge) window.scrollBy(0, -12);
    else if (event.clientY > innerHeight - edge) window.scrollBy(0, 12);
  }, { signal });

  const endDrag = (event: PointerEvent, cancelled: boolean): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = undefined;
    insertion.remove();
    members(finished.index).forEach((member) => member.classList.remove("is-dragging"));
    document.documentElement.classList.remove("frameseq-thumbnail-dragging");
    if (!finished.moved) {
      if (!cancelled) choose(finished.index);
      return;
    }
    const { index, target } = finished;
    // Dropping a slide either side of where it already is leaves the order alone.
    if (cancelled || target === undefined || target === groupStart[index] || target === groupEnd[index] + 1) return;
    post({ type: "frameseq.thumbnail-move", from: index, to: target });
  };
  addEventListener("pointerup", (event) => endDrag(event, false), { signal });
  addEventListener("pointercancel", (event) => endDrag(event, true), { signal });

  root.addEventListener("contextmenu", (event) => {
    const item = event.target instanceof Element
      ? event.target.closest<HTMLElement>(".frameseq-thumbnail")
      : null;
    if (!item) return;
    event.preventDefault();
    const index = Number(item.dataset.index);
    setActive(index, false);
    post({ type: "frameseq.thumbnail-menu", index, x: event.clientX, y: event.clientY });
  });

  addEventListener("keydown", (event) => {
    // The rail has no document of its own; saving and undoing belong to the editor beside it.
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const key = event.key.toLowerCase();
      const command = key === "s"
        ? "save"
        : (key === "z" ? (event.shiftKey ? "redo" : "undo") : (key === "y" && !event.shiftKey ? "redo" : undefined));
      if (command) {
        event.preventDefault();
        post({ type: "frameseq.command", command });
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      choose(activeIndex + 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      choose(activeIndex - 1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      choose(event.key === "Home" ? 0 : items.length - 1);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      post({ type: "frameseq.thumbnail-delete", index: activeIndex });
    }
  }, { signal });

  addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = event.data as { type?: unknown; index?: unknown } | null;
    if (message?.type === "frameseq.thumbnail-active" && typeof message.index === "number") {
      setActive(message.index, true);
    }
  }, { signal });
}
