/**
 * Languages a reader can prefer for search results, plus helpers for the
 * language tags Google Books and browsers report.
 * No database imports: shared by server and client code.
 */

export type LanguageOption = { code: string; label: string };

/** ISO 639-1 codes offered in the settings. */
export const LANGUAGES: readonly LanguageOption[] = [
  { code: "en", label: "English" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "sv", label: "Swedish" },
  { code: "da", label: "Danish" },
  { code: "no", label: "Norwegian" },
  { code: "fi", label: "Finnish" },
  { code: "pl", label: "Polish" },
  { code: "cs", label: "Czech" },
  { code: "hu", label: "Hungarian" },
  { code: "ro", label: "Romanian" },
  { code: "el", label: "Greek" },
  { code: "tr", label: "Turkish" },
  { code: "ru", label: "Russian" },
  { code: "uk", label: "Ukrainian" },
  { code: "ar", label: "Arabic" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
];

/** Value of the settings select that means "follow the browser". */
export const AUTOMATIC_LANGUAGE = "auto";

/** Google Books uses these when it could not tell the language. */
const UNKNOWN_LANGUAGES = new Set(["und", "mul", "zxx", "mis"]);

/**
 * Reduces a language tag such as `en-GB`, `EN` or `de_CH` to its primary
 * subtag (`en`, `de`). Returns null for empty or unknown values.
 */
export function normalizeLanguage(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  if (!/^[a-z]{2,3}$/.test(primary) || UNKNOWN_LANGUAGES.has(primary)) return null;
  return primary;
}

export function isLanguageCode(value: string): boolean {
  return LANGUAGES.some((language) => language.code === value);
}

/** "German" for `de`; codes that are not in the list are shown as they are. */
export function languageLabel(code: string | null | undefined): string | null {
  const normalized = normalizeLanguage(code);
  if (!normalized) return null;
  return (
    LANGUAGES.find((language) => language.code === normalized)?.label ??
    normalized.toUpperCase()
  );
}

/**
 * The most preferred language of an `Accept-Language` header, e.g. `en` for
 * `en-GB,en;q=0.9,de;q=0.8`. Used while a reader has not chosen a language.
 */
export function languageFromAcceptHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const quality = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="));
      const weight = quality ? Number.parseFloat(quality.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.tag && entry.tag !== "*" && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const entry of ranked) {
    const code = normalizeLanguage(entry.tag);
    if (code) return code;
  }
  return null;
}
