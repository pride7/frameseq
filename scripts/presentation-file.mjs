/**
 * What a new presentation is called on disk and what it starts with. The Studio's page names
 * the file as the title is typed, and the server writes it, so both read the same rules.
 */

/** The file a presentation titled `title` is saved as: its words, lowercased, joined by hyphens. */
export function presentationFileName(title) {
  const stem = String(title)
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  // Windows reserves these names for devices, whatever the extension.
  const safe = /^(?:con|prn|aux|nul|com\d|lpt\d)$/.test(stem) ? `${stem}-slides` : stem;
  return `${safe || "presentation"}.slides.ts`;
}

/** A cover and a first slide. Without a title, the placeholders `frameseq new` has always written. */
export function starterDeck(title) {
  const name = title?.trim() || "My Talk";
  const heading = title?.trim() || "Presentation title";
  return `presentation(${JSON.stringify(name)});

slide({ name: "Cover" }).cover();
text(${JSON.stringify(heading)}).hero();
text("A short description").subtitle();
text("Your name").author();

slide("First idea")
  .notes("Introduce the main idea and pause before the supporting points.");
text("Explain the idea in one clear sentence.");
bullets(
  "First point",
  "Second point",
  "Third point",
);
`;
}
