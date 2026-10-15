/** A BibTeX file imported by a slide document arrives as its entries, keyed by citation key. */
declare module "*.bib" {
  const entries: Record<string, Record<string, string | undefined>>;
  export default entries;
}
