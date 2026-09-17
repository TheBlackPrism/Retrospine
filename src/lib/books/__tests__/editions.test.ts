import { describe, expect, it } from "vitest";
import { collapseEditions, editionKey, workTitleKey } from "../editions";
import type { BookMetadata } from "../types";

function volume(overrides: Partial<BookMetadata> & { googleId: string }): BookMetadata {
  return {
    title: "Red Rising",
    subtitle: null,
    authors: ["Pierce Brown"],
    publisher: null,
    publishedDate: null,
    description: null,
    pageCount: null,
    categories: [],
    language: "en",
    isbn13: null,
    isbn10: null,
    coverUrl: null,
    thumbnailUrl: null,
    googleSeries: null,
    ...overrides,
  };
}

describe("workTitleKey", () => {
  it("ignores case, accents and punctuation", () => {
    expect(workTitleKey("Harry Potter and the Philosopher's Stone")).toBe(
      "harry potter and the philosopher s stone",
    );
    expect(workTitleKey("Ärger im Café!")).toBe("arger im cafe");
  });

  it("drops bracketed asides and volume markers", () => {
    expect(workTitleKey("Red Rising (Red Rising Series Book 1)")).toBe("red rising");
    expect(workTitleKey("Red Rising Book 1")).toBe("red rising");
    expect(workTitleKey("Golden Son, Vol. 2")).toBe("golden son");
    expect(workTitleKey("Golden Son #2")).toBe("golden son");
  });

  it("drops subtitles that only describe the form or the series", () => {
    expect(workTitleKey("Red Rising: A Novel")).toBe("red rising");
    expect(workTitleKey("Red Rising - Roman")).toBe("red rising");
    expect(workTitleKey("Golden Son: Book 2 of the Red Rising Saga")).toBe("golden son");
    expect(workTitleKey("Morning Star: Red Rising Series 3")).toBe("morning star");
    expect(workTitleKey("Equal Rites: A Discworld Novel")).toBe("equal rites");
    expect(workTitleKey("Red Rising: 1")).toBe("red rising");
    expect(
      workTitleKey(
        "Red Rising: An Explosive Dystopian Sci-Fi Novel (#1 New York Times Bestselling Red Rising Series Book 1)",
      ),
    ).toBe("red rising");
    expect(workTitleKey("Golden Son: Red Rising Book 2")).toBe("golden son");
    expect(workTitleKey("Golden Son: Red Rising 2")).toBe("golden son");
    expect(workTitleKey("The Final Empire: Mistborn Book One")).toBe("the final empire");
    expect(workTitleKey("The Eye of the World: Book One of The Wheel of Time")).toBe(
      "the eye of the world",
    );
  });

  it("drops subtitles that only describe the printing", () => {
    expect(workTitleKey("Harry Potter and the Philosopher's Stone - Ravenclaw Edition")).toBe(
      "harry potter and the philosopher s stone",
    );
    expect(
      workTitleKey("The Book of Dust: La Belle Sauvage Collector's Edition (Book of Dust, Volume 1)"),
    ).toBe("the book of dust la belle sauvage");
    expect(workTitleKey("Dune: House Atreides Deluxe Edition")).toBe("dune house atreides");
    expect(workTitleKey("Pierce Brown's Red Rising: Sons of Ares Signed Edition")).toBe(
      "pierce brown s red rising sons of ares",
    );
  });

  it("treats Google's subtitle field like a colon subtitle", () => {
    expect(workTitleKey("Dune", "House Atreides")).toBe("dune house atreides");
    expect(workTitleKey("Red Rising", "Roman")).toBe("red rising");
    expect(workTitleKey("Light Bringer", "A Red Rising Novel")).toBe("light bringer");
    expect(
      workTitleKey(
        "Morning Star",
        "the explosive third book in the globally bestselling Red Rising series",
      ),
    ).toBe("morning star");
    expect(
      workTitleKey("Leviathan Falls", "Book 9 of the Expanse (now a Prime Original series)"),
    ).toBe("leviathan falls");
    expect(workTitleKey("Drive", "An Expanse Short Story")).toBe("drive");
    expect(workTitleKey("Dune: House Atreides", "House Atreides")).toBe("dune house atreides");
  });

  it("keeps the name around an issue number and drops the number itself", () => {
    expect(workTitleKey("Pierce Brown's Red Rising: Sons of Ares Vol 2- Wrath")).toBe(
      "pierce brown s red rising sons of ares wrath",
    );
    expect(workTitleKey("Pierce Brown's Red Rising: Sons of Ares Vol. 2", "Wrath")).toBe(
      "pierce brown s red rising sons of ares wrath",
    );
    expect(workTitleKey("Pierce Brown's Red Rising: Sons of Ares Vol. 3: Forbidden Song")).toBe(
      "pierce brown s red rising sons of ares forbidden song",
    );
    expect(workTitleKey("Pierce Brown's Red Rising: Sons Of Ares #3")).toBe(
      "pierce brown s red rising sons of ares",
    );
    expect(workTitleKey("Dune: House Atreides #11 (of 12)")).toBe("dune house atreides");
    expect(workTitleKey("Dune: House Atreides Vol. 1 HC")).toBe("dune house atreides");
  });

  it("keeps subtitles that name a different book", () => {
    expect(workTitleKey("Dune: House Atreides")).toBe("dune house atreides");
    expect(workTitleKey("Dune: House Harkonnen")).toBe("dune house harkonnen");
    expect(workTitleKey("The Book of Dust: La Belle Sauvage")).toBe(
      "the book of dust la belle sauvage",
    );
    expect(workTitleKey("Red Rising: Sons of Ares")).toBe("red rising sons of ares");
  });

  it("keeps bundles and graphic novels apart from the novel", () => {
    expect(workTitleKey("Red Rising: The Complete Trilogy")).not.toBe("red rising");
    expect(workTitleKey("Red Rising: Books 1-3")).not.toBe("red rising");
    expect(workTitleKey("The Hobbit: Graphic Novel")).not.toBe("the hobbit");
    expect(
      workTitleKey("RED RISING Omnibus", "Books 1-3 of this heart-pounding and instant bestselling SF series!"),
    ).not.toBe("red rising");
  });

  it("leaves numbers that belong to the title alone", () => {
    expect(workTitleKey("Fahrenheit 451")).toBe("fahrenheit 451");
    expect(workTitleKey("Catch-22")).toBe("catch 22");
    expect(workTitleKey("No Country for Old Men")).toBe("no country for old men");
  });
});

describe("editionKey", () => {
  it("combines the title with the first author's surname", () => {
    expect(editionKey({ googleId: "a", title: "Red Rising", authors: ["Pierce Brown"] })).toBe(
      "red rising|brown",
    );
    expect(editionKey({ googleId: "b", title: "Red Rising", authors: ["Brown, Pierce"] })).toBe(
      "red rising|brown",
    );
    expect(editionKey({ googleId: "c", title: "Red Rising", authors: ["J. K. Rowling"] })).toBe(
      "red rising|rowling",
    );
  });

  it("tells Dune apart from Dune: House Atreides however Google splits the title", () => {
    const dune = editionKey({ googleId: "d", title: "Dune", authors: ["Frank Herbert"] });
    const atreides = editionKey({
      googleId: "h",
      title: "Dune",
      subtitle: "House Atreides",
      authors: ["Brian Herbert", "Kevin J. Anderson"],
    });
    expect(dune).toBe("dune|herbert");
    expect(atreides).toBe("dune house atreides|herbert");
    expect(editionKey({ googleId: "c", title: "Dune: House Atreides #3", authors: ["Brian Herbert"] })).toBe(
      atreides,
    );
  });

  it("never merges volumes whose title folds to nothing", () => {
    expect(editionKey({ googleId: "x", title: "???", authors: [] })).toBe("id:x");
    expect(editionKey({ googleId: "y", title: "!!!", authors: [] })).toBe("id:y");
  });
});

describe("collapseEditions", () => {
  it("keeps one result per work in the order Google returned them", () => {
    const groups = collapseEditions(
      [
        volume({ googleId: "rr-hardcover" }),
        volume({ googleId: "gs", title: "Golden Son" }),
        volume({ googleId: "rr-paperback", title: "Red Rising: A Novel" }),
        volume({ googleId: "rr-de", language: "de" }),
        volume({ googleId: "other", authors: ["Someone Else"] }),
      ],
      "en",
    );
    expect(groups.map((group) => group.editions.length)).toEqual([3, 1, 1]);
    expect(groups[0].editions.map((edition) => edition.googleId)).toContain("rr-de");
    expect(groups[1].editions[0].googleId).toBe("gs");
    expect(groups[2].editions[0].googleId).toBe("other");
  });

  it("keeps the volumes of a comic apart from each other and from the novel", () => {
    const comic = { authors: ["Pierce Brown", "Rik Hoskin"] };
    const groups = collapseEditions(
      [
        volume({ googleId: "wrath-hc", title: "Pierce Brown's Red Rising: Sons of Ares Vol 2- Wrath", ...comic }),
        volume({ googleId: "wrath-tp", title: "Pierce Brown's Red Rising: Sons of Ares Vol. 2", subtitle: "Wrath", ...comic }),
        volume({ googleId: "issue-3", title: "Pierce Brown's Red Rising: Sons Of Ares #3", ...comic }),
        volume({ googleId: "vol-1", title: "Pierce Brown's Red Rising: Sons Of Ares", ...comic }),
        volume({ googleId: "forbidden", title: "Pierce Brown's Red Rising: Sons of Ares Vol. 3: Forbidden Song", ...comic }),
        volume({ googleId: "novel" }),
        volume({
          googleId: "novel-uk",
          title: "Red Rising: An Explosive Dystopian Sci-Fi Novel (#1 New York Times Bestselling Red Rising Series Book 1)",
        }),
        volume({ googleId: "novel-de", subtitle: "Roman", language: "de" }),
      ],
      "en",
    );
    expect(groups.map((group) => group.editions.map((edition) => edition.googleId))).toEqual([
      ["wrath-hc", "wrath-tp"],
      ["issue-3", "vol-1"],
      ["forbidden"],
      ["novel", "novel-uk", "novel-de"],
    ]);
  });

  it("prefers the reader's language, then richer metadata, then Google's order", () => {
    const [group] = collapseEditions(
      [
        volume({ googleId: "de-cover", language: "de", thumbnailUrl: "https://c/de.jpg" }),
        volume({ googleId: "en-plain" }),
        volume({ googleId: "en-cover", thumbnailUrl: "https://c/en.jpg" }),
        volume({ googleId: "en-cover-isbn", thumbnailUrl: "https://c/en2.jpg", isbn13: "9780000000001" }),
      ],
      "en",
    );
    expect(group.editions.map((edition) => edition.googleId)).toEqual([
      "en-cover-isbn",
      "en-cover",
      "en-plain",
      "de-cover",
    ]);
  });

  it("ranks an edition of unknown language between a match and a mismatch", () => {
    const [group] = collapseEditions(
      [
        volume({ googleId: "fr", language: "fr" }),
        volume({ googleId: "unknown", language: null }),
        volume({ googleId: "en", language: "en-GB" }),
      ],
      "en",
    );
    expect(group.editions.map((edition) => edition.googleId)).toEqual(["en", "unknown", "fr"]);
  });

  it("falls back to Google's order without a language preference", () => {
    const [group] = collapseEditions(
      [volume({ googleId: "de", language: "de" }), volume({ googleId: "en" })],
      null,
    );
    expect(group.editions[0].googleId).toBe("de");
  });

  it("pools the series reference from any edition of the work", () => {
    const [group] = collapseEditions(
      [
        volume({ googleId: "en", thumbnailUrl: "https://c/en.jpg" }),
        volume({
          googleId: "de",
          language: "de",
          googleSeries: { seriesId: "series-1", position: 1 },
        }),
      ],
      "en",
    );
    expect(group.editions[0].googleId).toBe("en");
    expect(group.googleSeries).toEqual({ seriesId: "series-1", position: 1 });
  });

  it("takes the volume number from a sibling when the best edition has none", () => {
    const [group] = collapseEditions(
      [
        volume({ googleId: "en", googleSeries: { seriesId: "series-1", position: null } }),
        volume({ googleId: "en-2", googleSeries: { seriesId: "series-1", position: 1 } }),
        volume({ googleId: "de", language: "de", googleSeries: { seriesId: "series-de", position: 7 } }),
      ],
      "en",
    );
    expect(group.googleSeries).toEqual({ seriesId: "series-1", position: 1 });
  });

  it("takes the lowest volume number when merged issues of a comic disagree", () => {
    const comic = { authors: ["Pierce Brown", "Rik Hoskin"] };
    const [group] = collapseEditions(
      [
        volume({ googleId: "trade", title: "Pierce Brown's Red Rising: Sons Of Ares", ...comic }),
        volume({
          googleId: "issue-3",
          title: "Pierce Brown's Red Rising: Sons Of Ares #3",
          googleSeries: { seriesId: "comic", position: 3 },
          ...comic,
        }),
        volume({
          googleId: "issue-1",
          title: "Pierce Brown's Red Rising: Sons Of Ares #1",
          googleSeries: { seriesId: "comic", position: 1 },
          ...comic,
        }),
      ],
      "en",
    );
    expect(group.editions.map((edition) => edition.googleId)).toEqual(["issue-3", "issue-1", "trade"]);
    expect(group.googleSeries).toEqual({ seriesId: "comic", position: 1 });
  });

  it("reports no series when no edition knows one", () => {
    const [group] = collapseEditions([volume({ googleId: "a" }), volume({ googleId: "b" })], "en");
    expect(group.googleSeries).toBeNull();
  });
});
