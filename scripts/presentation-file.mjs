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

const starterWords = {
  en: {
    name: "My Talk",
    heading: "Presentation title",
    subtitle: "A short description",
    author: "Your name",
    slide: "First idea",
    notes: "Introduce the main idea and pause before the supporting points.",
    lead: "Explain the idea in one clear sentence.",
    points: ["First point", "Second point", "Third point"],
  },
  zh: {
    name: "我的演讲",
    heading: "演示标题",
    subtitle: "一句简短的介绍",
    author: "你的名字",
    slide: "第一个想法",
    notes: "先讲清主要观点，停顿一下，再讲支持它的要点。",
    lead: "用一句话把这个想法讲清楚。",
    points: ["第一点", "第二点", "第三点"],
  },
};

/**
 * A cover and a first slide, with placeholders in English or, for a Studio shown in Chinese, in
 * Chinese. Without a title, the placeholders `frameseq new` has always written.
 */
export function starterDeck(title, language = "en") {
  const words = starterWords[language] ?? starterWords.en;
  const name = title?.trim() || words.name;
  const heading = title?.trim() || words.heading;
  return `presentation(${JSON.stringify(name)});

slide({ name: "Cover" }).cover();
text(${JSON.stringify(heading)}).hero();
text(${JSON.stringify(words.subtitle)}).subtitle();
text(${JSON.stringify(words.author)}).author();

slide(${JSON.stringify(words.slide)})
  .notes(${JSON.stringify(words.notes)});
text(${JSON.stringify(words.lead)});
bullets(
${words.points.map((point) => `  ${JSON.stringify(point)},`).join("\n")}
);
`;
}
