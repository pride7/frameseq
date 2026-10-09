/**
 * The rules behind `frameseq check`, measured against a deck rendered in print mode.
 *
 * The function is self-contained so that it can run in two places: Puppeteer serialises it
 * into the page the CLI builds, and FrameSeq Studio calls it on a print-mode frame of the live
 * preview so the same diagnostics appear while the deck is being edited. It must not refer to
 * anything outside its own body.
 *
 * @param {Window} [win] The window holding the rendered deck; the current one by default.
 */
export function collectLayoutIssues(win = window) {
  const document = win.document;
  const getComputedStyle = (element) => win.getComputedStyle(element);
  const tolerance = 1;
  const issues = [];
  const canvases = Array.from(document.querySelectorAll(".frameseq-slide"));
  const measurableTypes = new Set([
    "text",
    "image",
    "code",
    "equation",
    "typst",
    "latex",
    "rect",
    "circle",
  ]);
  const textTypes = new Set(["text", "code", "equation", "rect", "circle"]);
  const containerTypes = new Set(["row", "column", "stack"]);
  const clippingValues = new Set(["hidden", "clip"]);
  // Displays that place their children, which is what align(), gap(), and grow() need.
  const arrangingDisplays = new Set(["flex", "inline-flex", "grid", "inline-grid"]);

  const rounded = (value) => Math.round(value * 10) / 10;
  const excerpt = (element) => (element.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const visible = (element, type) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    const hasArea = type === "line"
      ? bounds.width > 0 || bounds.height > 0
      : bounds.width > 0 && bounds.height > 0;
    return style.display !== "none"
      && style.visibility !== "hidden"
      && Number.parseFloat(style.opacity || "1") > 0
      && hasArea;
  };
  const decoratedContainer = (element) => {
    const style = getComputedStyle(element);
    const background = style.backgroundColor.replace(/\s+/g, "");
    const hasBackground = style.backgroundImage !== "none"
      || (background !== "transparent" && background !== "rgba(0,0,0,0)");
    const hasBorder = [
      style.borderTopWidth,
      style.borderRightWidth,
      style.borderBottomWidth,
      style.borderLeftWidth,
    ].some((width) => Number.parseFloat(width) > 0);
    return hasBackground || hasBorder || style.boxShadow !== "none";
  };
  const overflow = (inner, outer) => ({
    left: Math.max(0, outer.left - inner.left),
    right: Math.max(0, inner.right - outer.right),
    top: Math.max(0, outer.top - inner.top),
    bottom: Math.max(0, inner.bottom - outer.bottom),
  });
  const hasOverflow = (value) => Object.values(value).some((amount) => amount > tolerance);
  const contentBounds = (element) => {
    if (!element.textContent?.trim()) return element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const bounds = range.getBoundingClientRect();
    return bounds.width > 0 || bounds.height > 0
      ? bounds
      : element.getBoundingClientRect();
  };
  // One insertion, deletion, substitution, or transposition apart.
  const differsBySingleEdit = (first, second) => {
    if (first === second) return false;
    if (Math.abs(first.length - second.length) > 1) return false;

    let left = 0;
    let right = 0;
    let edits = 0;
    while (left < first.length && right < second.length) {
      if (first[left] === second[right]) {
        left += 1;
        right += 1;
        continue;
      }
      edits += 1;
      if (edits > 1) return false;
      if (first.length > second.length) left += 1;
      else if (first.length < second.length) right += 1;
      else if (first[left + 1] === second[right] && first[left] === second[right + 1]) {
        left += 2;
        right += 2;
      } else {
        left += 1;
        right += 1;
      }
    }
    return edits + (first.length - left) + (second.length - right) <= 1;
  };
  const sides = (value) => Object.entries(value)
    .filter(([, amount]) => amount > tolerance)
    .map(([side, amount]) => `${rounded(amount)}px on the ${side}`)
    .join(", ");
  // A live preview records the command that wrote each object, and a production build does
  // not, so a location is reported only when there is one to report.
  const located = (element, info) => {
    const [line, column] = (element.dataset.frameseqSource ?? "").split(":").map(Number);
    return Number.isInteger(line) && Number.isInteger(column) && line > 0
      ? { ...info, source: { line, column } }
      : info;
  };

  canvases.forEach((canvas, slideIndex) => {
    const canvasBounds = canvas.getBoundingClientRect();
    const slide = {
      index: slideIndex + 1,
      label: canvas.dataset.frameseqSlideLabel || `Slide ${slideIndex + 1}`,
    };
    const nodes = Array.from(canvas.querySelectorAll("[data-frameseq-node]"));
    const hasAutomaticTitlePage = Boolean(canvas.querySelector(".frameseq-auto-title-page"));
    const hasVisibleContent = nodes.some((element) => {
      const type = element.dataset.frameseqNode ?? "unknown";
      if (type === "slide" || type === "spacer" || !visible(element, type)) return false;
      if (type === "text" || type === "code") return excerpt(element).length > 0;
      if (containerTypes.has(type)) return decoratedContainer(element);
      return true;
    });

    if (canvas.dataset.frameseqAllowEmpty !== "true"
      && !hasAutomaticTitlePage
      && !hasVisibleContent) {
      issues.push({
        severity: "warning",
        rule: "empty-slide",
        slide,
        element: located(canvas, {
          type: "slide",
          path: canvas.dataset.frameseqPath ?? String(slideIndex),
          text: "",
        }),
        message: "Slide has no visible content.",
        details: { visibleObjects: 0 },
        suggestions: [
          "Add text(), image(), code(), math, Typst, LaTeX, or a shape before the next slide() call.",
          "If the blank slide is intentional, call slide().allowEmpty().",
        ],
      });
    }

    const namedElements = nodes.filter((element) => element.dataset.frameseqName);
    for (const element of namedElements) {
      const type = element.dataset.frameseqNode ?? "unknown";
      if (!containerTypes.has(type) || element.childElementCount > 0) continue;
      const name = element.dataset.frameseqName;
      issues.push({
        severity: "warning",
        rule: "empty-region",
        slide,
        element: located(element, {
          type,
          path: element.dataset.frameseqPath ?? "unknown",
          text: "",
        }),
        message: `Region "${name}" is empty.`,
        details: { name },
        suggestions: [
          `Add content after at("${name}").`,
          "Remove the region if the path was a typo or is no longer used.",
        ],
      });
    }

    for (let index = 1; index < namedElements.length; index += 1) {
      const name = namedElements[index].dataset.frameseqName;
      if (name.length < 4) continue;
      for (let earlier = 0; earlier < index; earlier += 1) {
        const other = namedElements[earlier].dataset.frameseqName;
        if (other.length < 4 || !differsBySingleEdit(name, other)) continue;
        issues.push({
          severity: "warning",
          rule: "similar-name",
          slide,
          element: located(namedElements[index], {
            type: namedElements[index].dataset.frameseqNode ?? "unknown",
            path: namedElements[index].dataset.frameseqPath ?? "unknown",
            text: "",
          }),
          message: `Names "${other}" and "${name}" are one edit apart.`,
          details: { name, other },
          suggestions: [
            "Rename one of them so the difference is deliberate.",
            `If "${name}" was meant to reach the same object as "${other}", correct the spelling.`,
          ],
        });
        break;
      }
    }

    // A layout modifier only means something in a particular context: align() needs
    // the object to lay out children, selfAlign() and grow() need its container to.
    // Written anywhere else the browser ignores it in silence, which is the hardest
    // kind of layout mistake to see, so report it against the object that wrote it.
    for (const element of nodes) {
      const type = element.dataset.frameseqNode ?? "unknown";
      if (type === "slide") continue;
      const own = getComputedStyle(element);
      if (own.display === "none") continue;
      const parent = element.parentElement;
      const parentDisplay = parent ? getComputedStyle(parent).display : "";
      const arranges = arrangingDisplays.has(own.display);
      const inParent = arrangingDisplays.has(parentDisplay);
      const flexes = own.display === "flex" || own.display === "inline-flex";

      // Some of these are asked of the object itself and the rest of its container,
      // and only the alignment ones have a near neighbour worth suggesting.
      const arrangesChildren = "Add row(), column(), or grid() to this object so it arranges its children.";
      const arrangingParent = "Give the container that holds it a layout: row(), column(), or grid().";
      const nearest = "To place this object inside its container, use selfAlign() or centerSelf(); to move the text inside it, use textAlign().";
      const inert = [];
      if (element.style.alignItems && !arranges) {
        inert.push(["align()", false, [arrangesChildren, nearest]]);
      }
      if (element.style.justifyContent && !arranges) {
        inert.push(["justify()", false, [arrangesChildren, nearest]]);
      }
      if ((element.style.gap || element.style.rowGap || element.style.columnGap) && !arranges) {
        inert.push(["gap()", false, [arrangesChildren]]);
      }
      if (element.style.flexWrap && !flexes) inert.push(["wrap()", false, [arrangesChildren]]);
      if (element.style.alignContent && !(own.display.endsWith("grid")
        || (flexes && own.flexWrap === "wrap"))) {
        inert.push(["alignContent()", false, ["Add wrap() to this row or column, or use align() for a single line."]]);
      }
      if (element.style.alignSelf && !inParent) {
        inert.push(["selfAlign()", true, [arrangingParent, nearest]]);
      }
      if (element.style.flexGrow && element.style.flexGrow !== "0" && !inParent) {
        inert.push([type === "spacer" ? "spacer()" : "grow()", true, [arrangingParent]]);
      }

      for (const [modifier, needsContainer, suggestions] of inert) {
        issues.push({
          severity: "warning",
          rule: "inert-modifier",
          slide,
          element: located(element, {
            type,
            path: element.dataset.frameseqPath ?? "unknown",
            text: excerpt(element),
          }),
          message: needsContainer
            ? `${modifier} has no effect: the ${parentDisplay || "unknown"} container holding this object is not a row(), column(), or grid().`
            : `${modifier} has no effect: this object is not a row(), column(), or grid().`,
          details: { modifier, display: own.display, parentDisplay },
          suggestions,
        });
      }
    }

    for (const element of nodes) {
      const type = element.dataset.frameseqNode ?? "unknown";
      if (type === "slide" || type === "line" || type === "spacer") continue;
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden"
        || bounds.width === 0 || bounds.height === 0) continue;
      if (!measurableTypes.has(type) && style.position !== "absolute") continue;

      const text = excerpt(element);
      const elementInfo = located(element, {
        type,
        path: element.dataset.frameseqPath ?? "unknown",
        text,
      });
      const visualBounds = textTypes.has(type) && text
        ? contentBounds(element)
        : bounds;
      const combinedBounds = {
        left: Math.min(bounds.left, visualBounds.left),
        right: Math.max(bounds.right, visualBounds.right),
        top: Math.min(bounds.top, visualBounds.top),
        bottom: Math.max(bounds.bottom, visualBounds.bottom),
      };
      const canvasOverflow = overflow(combinedBounds, canvasBounds);

      if (hasOverflow(canvasOverflow)) {
        issues.push({
          severity: "error",
          rule: "canvas-overflow",
          slide,
          element: elementInfo,
          message: `${type === "text" ? "Text" : "Object"} exceeds the slide canvas by ${sides(canvasOverflow)}.`,
          details: Object.fromEntries(
            Object.entries(canvasOverflow).map(([side, amount]) => [side, rounded(amount)]),
          ),
          suggestions: [
            "Move the object inward or reduce its width, height, or font size.",
          ],
        });
      }

      if (textTypes.has(type) && text) {
        let clipping = undefined;
        let clippingAncestor = element;
        while (clippingAncestor && clippingAncestor !== canvas) {
          const clippingStyle = getComputedStyle(clippingAncestor);
          const clipsX = clippingValues.has(clippingStyle.overflowX);
          const clipsY = clippingValues.has(clippingStyle.overflowY);
          if (clipsX || clipsY) {
            const ancestorBounds = clippingAncestor.getBoundingClientRect();
            const clipped = overflow(visualBounds, ancestorBounds);
            const relevant = {
              left: clipsX ? clipped.left : 0,
              right: clipsX ? clipped.right : 0,
              top: clipsY ? clipped.top : 0,
              bottom: clipsY ? clipped.bottom : 0,
            };
            if (hasOverflow(relevant)) {
              clipping = relevant;
              break;
            }
          }
          clippingAncestor = clippingAncestor.parentElement;
        }

        if (clipping) {
          issues.push({
            severity: "error",
            rule: "text-clipped",
            slide,
            element: elementInfo,
            message: `Text is clipped by ${sides(clipping)}.`,
            details: Object.fromEntries(
              Object.entries(clipping).map(([side, amount]) => [side, rounded(amount)]),
            ),
            suggestions: [
              "Increase the text box size, reduce the font size, or shorten the content.",
            ],
          });
        }

        if (!element.classList.contains("frameseq-list-marker")) {
          const fontSize = Number.parseFloat(style.fontSize);
          const heading = element.classList.contains("frameseq-slide-title")
            || element.classList.contains("frameseq-cover-title");
          const minimum = heading ? 24 : 14;
          if (Number.isFinite(fontSize) && fontSize < minimum) {
            issues.push({
              severity: "warning",
              rule: "font-too-small",
              slide,
              element: elementInfo,
              message: `Font size ${rounded(fontSize)}px is below the recommended ${minimum}px minimum.`,
              details: {
                fontSize: rounded(fontSize),
                recommendedMinimum: minimum,
              },
              suggestions: [
                `Increase the font size to at least ${minimum}px.`,
              ],
            });
          }
        }
      }
    }
  });

  return {
    canvas: {
      width: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--slide-width")),
      height: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--slide-height")),
    },
    slides: canvases.length,
    issues,
  };
}
