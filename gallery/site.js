// The landing pages' few behaviours, shared by the English and the Chinese page.

// The tour of the Studio: one picture at a time, chosen by its tab.
for (const tabs of document.querySelectorAll("[data-tabs]")) {
  const buttons = [...tabs.querySelectorAll("[role='tab']")];
  const select = (chosen, focus) => {
    for (const button of buttons) {
      const on = button === chosen;
      button.setAttribute("aria-selected", String(on));
      button.tabIndex = on ? 0 : -1;
      document.getElementById(button.getAttribute("aria-controls")).hidden = !on;
    }
    if (focus) chosen.focus();
  };
  select(buttons[0], false);
  for (const button of buttons) {
    button.addEventListener("click", () => select(button, false));
    button.addEventListener("keydown", (event) => {
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      select(buttons[(buttons.indexOf(button) + step + buttons.length) % buttons.length], true);
    });
  }
}

// Slides alone, or slides and code.
for (const group of document.querySelectorAll(".view-switch")) {
  const stage = document.querySelector("[data-view-stage]");
  for (const button of group.querySelectorAll("button")) {
    button.addEventListener("click", () => {
      for (const other of group.querySelectorAll("button")) other.setAttribute("aria-pressed", String(other === button));
      stage.dataset.viewCurrent = button.dataset.view;
    });
  }
}

const header = document.querySelector(".site-header");
const onScroll = () => header.classList.toggle("is-scrolled", scrollY > 8);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Sections rise into place as they arrive, unless the reader has asked for less motion.
const reveals = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  for (const element of reveals) observer.observe(element);
} else {
  for (const element of reveals) element.classList.add("is-visible");
}
