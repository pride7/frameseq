/**
 * Citations: a bibliography the presentation is given, cite() markers numbered in the order
 * works are first cited, the works each slide cites listed at its foot, and references() for
 * the full list. Entries come from an imported .bib file, or are written as plain text.
 */

/** One work, as a .bib import provides it: lower-case BibTeX field names with plain-text values. */
export interface BibliographyEntry {
  type?: string;
  author?: string;
  editor?: string;
  title?: string;
  year?: string;
  journal?: string;
  booktitle?: string;
  publisher?: string;
  howpublished?: string;
  url?: string;
  doi?: string;
  [field: string]: string | undefined;
}

/** Works to cite, by key: entries from a .bib import, or each written out as the reference text. */
export type Bibliography = Record<string, BibliographyEntry | string>;

export interface CitationOptions {
  /** "numeric" writes [1]; "author-year" writes (Vaswani et al., 2017). Numeric by default. */
  style?: "numeric" | "author-year";
  /** List the works a slide cites at the foot of that slide; on by default. */
  footnotes?: boolean;
}

interface Person {
  last: string;
  initials: string;
}

/** Split a BibTeX author list into people: "Last, First" or "First Last", joined by "and". */
function people(list: string | undefined): Person[] {
  if (!list) return [];
  return list.split(/\s+and\s+/i).map((name) => name.trim()).filter(Boolean).map((name) => {
    if (/^others$/i.test(name)) return { last: "others", initials: "" };
    let last: string;
    let first: string;
    if (name.includes(",")) {
      [last, first = ""] = name.split(",").map((part) => part.trim());
    } else {
      const parts = name.split(/\s+/);
      // Particles such as "van der" belong to the last name.
      let split = parts.length - 1;
      while (split > 0 && /^[a-z]/.test(parts[split - 1])) split -= 1;
      last = parts.slice(split).join(" ");
      first = parts.slice(0, split).join(" ");
    }
    const initials = first.split(/[\s-]+/).filter(Boolean).map((part) => `${part[0]}.`).join(" ");
    return { last, initials };
  });
}

function authorList(entry: BibliographyEntry): string {
  const authors = people(entry.author ?? entry.editor);
  if (authors.length === 0) return "";
  const written = authors.map((person) => (person.initials ? `${person.last}, ${person.initials}` : person.last));
  if (authors.some((person) => person.last === "others") || authors.length > 6) {
    return `${written[0]}, et al.`;
  }
  if (written.length === 1) return written[0];
  return `${written.slice(0, -1).join(", ")}, & ${written[written.length - 1]}`;
}

/** The surnames a citation shows: "Vaswani", "Vaswani & Shazeer", or "Vaswani et al.". */
export function citationNames(entry: BibliographyEntry | string): string | undefined {
  if (typeof entry === "string") return undefined;
  const authors = people(entry.author ?? entry.editor).filter((person) => person.last !== "others");
  if (authors.length === 0) return undefined;
  if (authors.length === 1) return authors[0].last;
  if (authors.length === 2) return `${authors[0].last} & ${authors[1].last}`;
  return `${authors[0].last} et al.`;
}

/** A reference in a compact author-date style, from an entry or the text it was written as. */
export function formatReference(entry: BibliographyEntry | string): string {
  if (typeof entry === "string") return entry;
  const authors = authorList(entry);
  const year = entry.year ? `(${entry.year}).` : "";
  const title = entry.title ? `${entry.title.replace(/[.\s]+$/, "")}.` : "";
  const venue = entry.journal ?? entry.booktitle ?? entry.publisher ?? entry.howpublished;
  const where = venue ? `${entry.booktitle && !entry.journal ? "In " : ""}${venue.replace(/[.\s]+$/, "")}.` : "";
  const link = entry.doi ? `https://doi.org/${entry.doi.replace(/^https?:\/\/doi\.org\//, "")}` : entry.url;
  return [authors && (authors.endsWith(".") ? authors : `${authors}.`), year, title, where, link]
    .filter(Boolean)
    .join(" ")
    .replace(/\.\./g, ".");
}

/** The marker one citation writes into the text: its number, or names and year. */
export function citationLabel(entry: BibliographyEntry | string, number: number, style: CitationOptions["style"]): string {
  if (style === "author-year") {
    const names = citationNames(entry);
    const year = typeof entry === "string" ? undefined : entry.year;
    if (names) return year ? `${names}, ${year}` : names;
  }
  return String(number);
}

/** Join citation labels into the marker the text shows: [1, 3] or (Vaswani et al., 2017; Devlin et al., 2019). */
export function citationMarker(labels: string[], style: CitationOptions["style"]): string {
  if (style === "author-year" && labels.some((label) => !/^\d+$/.test(label))) return `(${labels.join("; ")})`;
  return `[${labels.join(", ")}]`;
}

const superscripts = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** A footnote number in superscript digits, which read as a marker in any text and any export. */
export function superscript(number: number): string {
  return String(number).split("").map((digit) => superscripts[Number(digit)]).join("");
}

/** Keys close to one that was not found, for "did you mean". */
export function similarKeys(key: string, keys: string[]): string[] {
  const distance = (a: string, b: string): number => {
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const current = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = current;
      }
    }
    return row[b.length];
  };
  return keys.filter((candidate) => distance(candidate.toLowerCase(), key.toLowerCase()) <= Math.max(2, Math.floor(key.length / 4)));
}
