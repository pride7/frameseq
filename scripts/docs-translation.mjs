#!/usr/bin/env node

/**
 * A translation is only useful while it still says what the original says. Each
 * translated page records a hash of the English source it was written from, and the
 * documentation test fails when the English page has moved on.
 *
 * After updating a translation, run `npm run docs:stamp` to record the new hash. The
 * stamp is deliberately a separate step: it is the moment someone confirms that the
 * Chinese page now says what the English one does.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { localisedGroups } from "./docs-structure.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const marker = /^<!-- translation-of: (\S+) sha256:(\S+) -->/;

export function translatedSources(locale = "zh") {
  return localisedGroups(locale)
    .flatMap((group) => group.pages)
    .filter((page) => page.translated)
    .map((page) => ({
      slug: page.slug,
      english: page.source,
      translated: page.slug === "index"
        ? `docs/${locale}/README.md`
        : `docs/${locale}/${page.slug}.md`,
      generated: page.slug === "index",
    }));
}

function digest(source) {
  return createHash("sha256").update(source).digest("hex").slice(0, 16);
}

export async function translationStatus(locale = "zh") {
  const report = [];
  for (const page of translatedSources(locale)) {
    // The home page is rendered from the shared structure in both languages, so it
    // cannot fall behind the way a hand-written translation can.
    if (page.generated) continue;

    const english = await readFile(resolve(packageRoot, page.english), "utf8");
    const translation = await readFile(resolve(packageRoot, page.translated), "utf8");
    const found = marker.exec(translation);
    report.push({
      ...page,
      expected: digest(english),
      recorded: found?.[2],
      declaredSource: found?.[1],
    });
  }
  return report;
}

export async function stampTranslations(locale = "zh") {
  const stamped = [];
  for (const page of await translationStatus(locale)) {
    const translation = await readFile(resolve(packageRoot, page.translated), "utf8");
    const line = `<!-- translation-of: ${page.english} sha256:${page.expected} -->`;
    const updated = marker.test(translation)
      ? translation.replace(marker, line)
      : `${line}\n\n${translation}`;
    if (updated !== translation) {
      await writeFile(resolve(packageRoot, page.translated), updated, "utf8");
      stamped.push(page.translated);
    }
  }
  return stamped;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stamped = await stampTranslations("zh");
  console.log(stamped.length === 0
    ? "Translations were already up to date."
    : `Stamped ${stamped.length} translation(s):\n- ${stamped.join("\n- ")}`);
}
