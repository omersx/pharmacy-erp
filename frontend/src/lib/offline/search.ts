/**
 * Arabic & Latin Search Normalization
 *
 * Normalizes Arabic diacritics, letter variants, digits and Latin characters
 * so that searches match accurately regardless of spelling or input variant.
 * Conforms to PWA implementation guide §6.5.
 */
export function normalizeArabicLatin(input: string): string {
  if (!input) return "";
  return input
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // remove tashkeel (diacritics) & tatweel
    .replace(/[إأآٱ]/g, "ا") // normalize alef variants
    .replace(/ى/g, "ي") // normalize ya
    .replace(/ة/g, "ه") // normalize ta marbuta
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))) // Arabic-Indic digits to ASCII
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))) // Persian digits to ASCII
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks whether a normalized query matches against target normalized string(s).
 * Supports prefix matching and multi-token matching.
 */
export function matchesQuery(query: string, ...targets: (string | undefined | null)[]): boolean {
  const normQuery = normalizeArabicLatin(query);
  if (!normQuery) return true;

  const queryTokens = normQuery.split(" ").filter(Boolean);
  const combined = targets
    .filter(Boolean)
    .map((t) => normalizeArabicLatin(t!))
    .join(" ");

  return queryTokens.every((token) => combined.includes(token));
}
