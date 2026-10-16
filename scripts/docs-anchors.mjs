/**
 * The id each documentation heading gets on the website. The Gallery build gives every
 * heading one, and the documentation test checks each link to a section against them,
 * so the two cannot disagree.
 *
 * Chinese characters stay in the id, as GitHub keeps them, so a link to `#快捷方式`
 * finds its heading both on GitHub and on the website.
 */
export function headingSlug(value) {
  return value
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "and")
    .replaceAll("&quot;", "")
    .toLowerCase()
    .replace(/[^a-z0-9\p{Script=Han}]+/gu, "-")
    .replace(/^-|-$/g, "");
}

/** Give each heading of a rendered page its id, numbering a repeated one. */
export function addHeadingIds(html) {
  const used = new Map();
  return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_match, level, content) => {
    const base = headingSlug(content) || "section";
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    return `<h${level} id="${id}">${content}<a class="heading-anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`;
  });
}

/** The ids of a rendered page's headings. */
export function headingIds(html) {
  return new Set([...addHeadingIds(html).matchAll(/<h[1-6] id="([^"]+)"/g)].map((match) => match[1]));
}
