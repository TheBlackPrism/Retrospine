import { describe, expect, it } from "vitest";
import {
  normalizeCoverUrl,
  normalizeVolume,
  type GoogleVolume,
} from "../google-books";

const fixture: GoogleVolume = {
  id: "wrOQLV6xB-wC",
  volumeInfo: {
    title: "Harry Potter and the Philosopher's Stone",
    authors: ["J. K. Rowling"],
    publisher: "Bloomsbury",
    publishedDate: "1997-06-26",
    description: "Harry Potter thinks he is an ordinary boy.",
    industryIdentifiers: [
      { type: "ISBN_10", identifier: "0747532699" },
      { type: "ISBN_13", identifier: "9780747532699" },
    ],
    pageCount: 223,
    categories: ["Juvenile Fiction"],
    language: "en",
    imageLinks: {
      smallThumbnail:
        "http://books.google.com/books/content?id=wrOQLV6xB-wC&printsec=frontcover&img=1&zoom=5&edge=curl&source=gbs_api",
      thumbnail:
        "http://books.google.com/books/content?id=wrOQLV6xB-wC&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api",
    },
    seriesInfo: {
      bookDisplayNumber: "1",
      volumeSeries: [
        { seriesId: "3XjNzgEACAAJ", seriesBookType: "ISSUE", orderNumber: 1 },
      ],
    },
  },
};

describe("normalizeVolume", () => {
  it("maps the fields we store", () => {
    const book = normalizeVolume(fixture);
    expect(book.googleId).toBe("wrOQLV6xB-wC");
    expect(book.title).toBe("Harry Potter and the Philosopher's Stone");
    expect(book.authors).toEqual(["J. K. Rowling"]);
    expect(book.isbn13).toBe("9780747532699");
    expect(book.isbn10).toBe("0747532699");
    expect(book.pageCount).toBe(223);
    expect(book.googleSeries).toEqual({ seriesId: "3XjNzgEACAAJ", position: 1 });
  });

  it("produces https cover links without the page curl", () => {
    const book = normalizeVolume(fixture);
    expect(book.thumbnailUrl).toMatch(/^https:\/\/books\.google\.com\//);
    expect(book.thumbnailUrl).not.toContain("edge=curl");
    expect(book.coverUrl).toContain("zoom=2");
  });

  it("copes with sparse volumes", () => {
    const book = normalizeVolume({ id: "x" });
    expect(book.title).toBe("Untitled");
    expect(book.authors).toEqual([]);
    expect(book.coverUrl).toBeNull();
    expect(book.googleSeries).toBeNull();
  });

  it("falls back to the display number when orderNumber is missing", () => {
    const book = normalizeVolume({
      id: "y",
      volumeInfo: {
        title: "Second",
        seriesInfo: { bookDisplayNumber: "2", volumeSeries: [{ seriesId: "s" }] },
      },
    });
    expect(book.googleSeries).toEqual({ seriesId: "s", position: 2 });
  });
});

describe("normalizeCoverUrl", () => {
  it("returns null for missing or invalid input", () => {
    expect(normalizeCoverUrl(undefined)).toBeNull();
    expect(normalizeCoverUrl("not a url")).toBeNull();
  });
});
