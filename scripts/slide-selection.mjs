/**
 * Some of a presentation's slides, for an export of those alone: "1-3, 5" is slides 1 to 3 and
 * slide 5, counted from one as the slide counter and the Studio count them. The CLI reads it
 * after `--slides`, and the Studio's export dialog from what is typed.
 */

/**
 * The slide numbers a choice names, in order and each once, or what is wrong with it: nothing
 * named, a part that is not a number or a range, or a slide 0.
 */
export function readSlides(text) {
  const parts = String(text ?? "")
    .replace(/\s*[-–—~～]\s*/g, "-")
    .split(/[\s,，、;；]+/)
    .filter(Boolean);
  if (parts.length === 0) return { problem: "empty" };
  const numbers = new Set();
  for (const part of parts) {
    const match = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(part);
    if (!match) return { problem: "unreadable", part };
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    if (first === 0 || last === 0) return { problem: "zero", part };
    for (let number = Math.min(first, last); number <= Math.max(first, last); number += 1) numbers.add(number);
  }
  return { slides: [...numbers].sort((a, b) => a - b) };
}

/** The first slide named that a presentation of `total` slides does not have. */
export function slideBeyond(slides, total) {
  return slides.find((number) => number > total);
}

/** The slides written as briefly as they can be, as "1-3,5". */
export function slidesLabel(slides) {
  const runs = [];
  for (const number of slides) {
    const run = runs[runs.length - 1];
    if (run && number === run[1] + 1) run[1] = number;
    else runs.push([number, number]);
  }
  return runs.map(([first, last]) => (first === last ? String(first) : `${first}-${last}`)).join(",");
}

/**
 * What an export of some slides adds to its file's name, so it never takes the place of the
 * export of them all: "-slide-4", or "-slides-1-3,5".
 */
export function slidesFileSuffix(slides) {
  if (!slides) return "";
  return slides.length === 1 ? `-slide-${slides[0]}` : `-slides-${slidesLabel(slides)}`;
}

/** Stop an export of slides the presentation does not have, before anything is written. */
export function checkSlides(slides, total) {
  const beyond = slideBeyond(slides, total);
  if (beyond === undefined) return;
  throw new Error(`There is no slide ${beyond}: the presentation has ${total} slide${total === 1 ? "" : "s"}.`);
}

/**
 * Take every slide but the chosen ones out of a page rendered for print, as PDF and PowerPoint
 * export read it. Each one left keeps its number, and its footer counts the whole presentation.
 */
export async function keepSlides(page, slides) {
  const total = await page.evaluate(() => document.querySelectorAll(".frameseq-slide-frame").length);
  checkSlides(slides, total);
  await page.evaluate((chosen) => {
    for (const frame of document.querySelectorAll(".frameseq-slide-frame")) {
      if (!chosen.includes(Number(frame.dataset.index) + 1)) frame.remove();
    }
  }, slides);
}
