import { readSlides, slideBeyond, slidesLabel } from "../../scripts/slide-selection.mjs";
import { t } from "./i18n";
import { element } from "./ui";

type Choice = "all" | "current" | "some";

/** What the last export in this window took, which the next one starts from. */
let last: { choice: Choice; text: string } = { choice: "all", text: "" };

/**
 * Ask which slides an export takes, as PowerPoint's print dialog does: all of them, the one in
 * view, or some by number, such as "1-3, 5". Resolves to undefined when cancelled, to `{}` for
 * every slide, and otherwise to the slides chosen, written as the CLI's `--slides` takes them.
 */
export function askExportSlides({ label, count, current }: {
  label: string;
  count: number;
  /** The slide in view, counted from zero. */
  current: number;
}): Promise<{ slides?: string } | undefined> {
  return new Promise((resolveAnswer) => {
    const dialog = element("dialog", "studio-dialog studio-export-dialog");
    const form = element("form");
    form.method = "dialog";
    const choices = element("div", "studio-export-choices");
    choices.setAttribute("role", "radiogroup");
    choices.setAttribute("aria-label", t.exports.whichSlides);

    const radios = new Map<Choice, HTMLInputElement>();
    const option = (choice: Choice, text: string): HTMLLabelElement => {
      const row = element("label", "studio-export-choice");
      const radio = element("input");
      radio.type = "radio";
      radio.name = "slides";
      radio.value = choice;
      radio.checked = choice === last.choice;
      radios.set(choice, radio);
      row.append(radio, element("span", "", text));
      choices.append(row);
      return row;
    };
    option("all", t.exports.allSlides(count));
    option("current", t.exports.currentSlide(current + 1));
    const some = option("some", t.exports.someSlides);
    const input = element("input");
    input.type = "text";
    input.value = last.text;
    input.placeholder = t.exports.example;
    input.spellcheck = false;
    input.setAttribute("aria-label", t.exports.someSlides);
    some.append(input);

    const note = element("p", "studio-dialog-problem");
    const actions = element("div", "studio-dialog-actions");
    const cancel = element("button", "studio-button", t.ui.cancel);
    cancel.type = "button";
    const accept = element("button", "studio-button is-primary", t.exports.confirm);
    accept.type = "submit";
    actions.append(cancel, accept);
    form.append(element("h2", "", t.exports.title(label)), choices, note, actions);
    dialog.append(form);
    document.body.append(dialog);

    const chosen = (): Choice => [...radios].find(([, radio]) => radio.checked)?.[0] ?? "all";

    /** The slides chosen, or why there are none, shown under the choices as they change. */
    const reading = (): { slides?: number[]; problem?: string } => {
      const choice = chosen();
      if (choice === "all") return {};
      if (choice === "current") return { slides: [current + 1] };
      const read = readSlides(input.value);
      if (!read.slides) {
        if (read.problem === "empty") return { problem: t.exports.slidesEmpty };
        return { problem: read.problem === "zero" ? t.exports.slidesZero : t.exports.slidesUnreadable(read.part) };
      }
      const beyond = slideBeyond(read.slides, count);
      if (beyond !== undefined) return { problem: t.exports.slidesBeyond(beyond, count) };
      return { slides: read.slides };
    };
    const check = (): boolean => {
      const { slides, problem } = reading();
      note.textContent = problem ?? (chosen() === "some" && slides ? t.exports.chosen(slides.length) : "");
      note.classList.toggle("is-note", !problem);
      accept.disabled = Boolean(problem);
      return !problem;
    };

    let answer: { slides?: string } | undefined;
    choices.addEventListener("change", check);
    input.addEventListener("focus", () => {
      radios.get("some")!.checked = true;
      check();
    });
    input.addEventListener("input", check);
    form.addEventListener("submit", (event) => {
      if (!check()) {
        event.preventDefault();
        return;
      }
      const { slides } = reading();
      last = { choice: chosen(), text: input.value };
      // Every slide named is the whole presentation, exported under its own name.
      answer = slides && slides.length < count ? { slides: slidesLabel(slides) } : {};
    });
    cancel.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolveAnswer(answer);
    }, { once: true });
    dialog.showModal();
    check();
    if (chosen() === "some") input.select();
    else radios.get(chosen())!.focus();
  });
}
