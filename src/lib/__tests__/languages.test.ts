import { describe, expect, it } from "vitest";
import {
  isLanguageCode,
  languageFromAcceptHeader,
  languageLabel,
  normalizeLanguage,
} from "../languages";

describe("normalizeLanguage", () => {
  it("keeps the primary subtag only", () => {
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("en-GB")).toBe("en");
    expect(normalizeLanguage(" DE_ch ")).toBe("de");
  });

  it("returns null for empty, malformed or undetermined values", () => {
    expect(normalizeLanguage(null)).toBeNull();
    expect(normalizeLanguage("")).toBeNull();
    expect(normalizeLanguage("english")).toBeNull();
    expect(normalizeLanguage("und")).toBeNull();
  });
});

describe("languageFromAcceptHeader", () => {
  it("picks the language with the highest quality", () => {
    expect(languageFromAcceptHeader("de;q=0.8,en-GB,en;q=0.9")).toBe("en");
    expect(languageFromAcceptHeader("fr-CH, fr;q=0.9, en;q=0.8")).toBe("fr");
  });

  it("skips wildcards and languages with q=0", () => {
    expect(languageFromAcceptHeader("*")).toBeNull();
    expect(languageFromAcceptHeader("en;q=0, de;q=0.5")).toBe("de");
    expect(languageFromAcceptHeader(null)).toBeNull();
  });
});

describe("languageLabel", () => {
  it("names known languages and echoes unknown codes", () => {
    expect(languageLabel("de")).toBe("German");
    expect(languageLabel("en-US")).toBe("English");
    expect(languageLabel("eo")).toBe("EO");
    expect(languageLabel(null)).toBeNull();
  });
});

describe("isLanguageCode", () => {
  it("only accepts codes from the list", () => {
    expect(isLanguageCode("en")).toBe(true);
    expect(isLanguageCode("xx")).toBe(false);
  });
});
