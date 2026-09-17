import { describe, expect, it } from "vitest";
import {
  collectPatches,
  extractRefreshToken,
  extractTokenResponse,
  isbn10To13,
  isbnFromPublicationId,
  normalizeIsbn13,
  parseInventory,
  parseReadingState,
  readingStateFor,
  titlesMatch,
} from "../parse";

describe("ISBN helpers", () => {
  it("converts ISBN-10 to ISBN-13", () => {
    expect(isbn10To13("0-552-13106-4")).toBe("9780552131063");
    expect(isbn10To13("155404295X")).toBe("9781554042951");
    expect(isbn10To13("123")).toBeNull();
  });

  it("normalises ISBN-13 and EAN values", () => {
    expect(normalizeIsbn13("978-3-641-24360-9")).toBe("9783641243609");
    expect(normalizeIsbn13("0552131064")).toBe("9780552131063");
    expect(normalizeIsbn13("")).toBeNull();
    expect(normalizeIsbn13("1234567890123")).toBeNull();
  });

  it("finds the ISBN inside a publication id", () => {
    expect(isbnFromPublicationId("DT0400.9783641243609_A40398678")).toBe("9783641243609");
    expect(isbnFromPublicationId("bosh_3_395490135492823841139311838")).toBeNull();
  });
});

describe("titlesMatch", () => {
  it("ignores subtitles, case and punctuation", () => {
    expect(titlesMatch("Equal Rites: A Discworld Novel", "Equal rites")).toBe(true);
    expect(titlesMatch("Der Schwarm", "Der Schwarm – Roman")).toBe(true);
    expect(titlesMatch("Dune", "Dune Messiah")).toBe(false);
    expect(titlesMatch("The Hobbit", "The Silmarillion")).toBe(false);
  });
});

const legacyInventory = {
  PublicationInventory: {
    ebook: [
      {
        resellerId: "3",
        epubMetaData: {
          identifier: "DT0400.9783641243609_A40398678",
          title: "Chaos Walking - Die Mission",
          author: [{ name: "Patrick Ness" }],
          isbn: "9783641243609",
          publisher: "Random House ebook",
          language: "de",
          type: "EBOOK",
          issued: 1607900400000,
          fileResource: [
            {
              type: "COVER_IMAGE",
              resource: "https://cdp.pageplace.de/cdp/public/publications/DT0400/9783641243609_A40398678/cover",
            },
          ],
          deliverable: [
            {
              identifier: "DT0400.9783641243609_A40398678",
              title: "Chaos Walking - Die Mission (E-Only)",
              subtitle: "Die Vorgeschichte",
              purchased: 1612116184445,
              contentFormat: "application/epub+zip",
              preview: false,
            },
          ],
        },
      },
      {
        resellerId: "3",
        epubMetaData: {
          identifier: "DT0400.9783842028357_A29383154",
          title: "Gratis-Leseprobe: Kamo",
          author: [{ firstName: "Ban", lastName: "Zarbo" }],
          type: "EBOOK",
          deliverable: [{ identifier: "DT0400.9783842028357_A29383154", preview: true }],
        },
      },
    ],
    edata: [
      {
        resellerId: "3",
        epubMetaData: {
          identifier: "bosh_3_395490135492823841139311838",
          title: "MacBest",
          author: "Terry Pratchett",
          type: "EDATA",
          fileResource: [
            { type: "COVER_IMAGE", resource: "https://bosh.pageplace.de/bosh/rest/cover/abc/def" },
          ],
          deliverable: [{ identifier: "bosh_3_395490135492823841139311838" }],
        },
      },
    ],
    audiobook: [],
  },
};

describe("parseInventory", () => {
  it("reads purchased books, uploads and samples from the bosh document", () => {
    const items = parseInventory(legacyInventory);
    expect(items).toHaveLength(3);

    const book = items[0];
    expect(book.publicationId).toBe("DT0400.9783641243609_A40398678");
    expect(book.kind).toBe("ebook");
    expect(book.title).toBe("Chaos Walking - Die Mission (E-Only)");
    expect(book.subtitle).toBe("Die Vorgeschichte");
    expect(book.authors).toEqual(["Patrick Ness"]);
    expect(book.isbn13).toBe("9783641243609");
    expect(book.coverUrl).toBe(
      "https://cdp.pageplace.de/cdp/public/publications/DT0400/9783641243609_A40398678/cover?size=BS-B03",
    );
    expect(book.purchasedAt?.getTime()).toBe(1612116184445);
    expect(book.isSample).toBe(false);

    const sample = items[1];
    expect(sample.isSample).toBe(true);
    expect(sample.authors).toEqual(["Ban Zarbo"]);
    expect(sample.isbn13).toBe("9783842028357");

    const upload = items[2];
    expect(upload.kind).toBe("upload");
    expect(upload.authors).toEqual(["Terry Pratchett"]);
    expect(upload.isbn13).toBeNull();
    // Covers behind the authenticated bosh endpoint cannot be shown by a browser.
    expect(upload.coverUrl).toBeNull();
  });

  it("reads the paged document of the newer inventory service", () => {
    const items = parseInventory({
      page: {
        content: [
          {
            publicationId: "DT0400.9783739673417_A27522964",
            contentType: "EBOOK",
            authors: [{ name: null, firstName: "Caterina", lastName: "di Montebasso" }],
            title: "Das Relikt",
            isbnEan: "9783739673417",
            language: "de",
            publisher: "BookRix",
            purchasedDate: 1612116343128,
            fileResources: [
              {
                resource: "https://cdp.pageplace.de/cdp/public/publications/DT0400/9783739673417_A27522964/cover",
                type: "COVER_IMAGE",
              },
            ],
            contentSources: ["PURCHASED"],
          },
          {
            uuid: "bosh_3_395490135492823841139311838",
            publicationId: "bosh_3_395490135492823841139311838",
            contentType: "EBOOK",
            authors: [{ name: "Terry Pratchett" }],
            title: "MacBest",
            contentSources: ["USER_UPLOAD"],
            defaultCover: true,
            fileResources: [{ type: "COVER_IMAGE", resource: "https://cdp.pageplace.de/x/cover" }],
          },
          {
            uuid: "1234",
            publicationId: "DT0400.9783842028357_A29383154",
            contentType: "EBOOK",
            title: "Leseprobe",
            contentSources: ["PREVIEW"],
          },
        ],
      },
    });
    expect(items).toHaveLength(3);
    expect(items[0].authors).toEqual(["Caterina di Montebasso"]);
    expect(items[0].isbn13).toBe("9783739673417");
    expect(items[0].kind).toBe("ebook");
    expect(items[1].kind).toBe("upload");
    expect(items[1].coverUrl).toBeNull();
    expect(items[2].isSample).toBe(true);
    expect(items[2].deliverableId).toBe("1234");
  });

  it("tolerates garbage", () => {
    expect(parseInventory(null)).toEqual([]);
    expect(parseInventory({ PublicationInventory: { ebook: [null, {}] } })).toEqual([]);
  });
});

describe("parseReadingState", () => {
  const book = "DT0400.9783739673417_A27522964";

  it("uses the latest bookmark and the finished tag", () => {
    const states = parseReadingState([
      {
        op: "add",
        path: `/publications/${book}/bookmark/606779074`,
        value: { modified: 1612116931592, progress: 0.043393 },
      },
      {
        op: "replace",
        path: `/publications/${book}/bookmark/606779074`,
        value: { modified: 1612116637854, progress: 0.41666666 },
      },
      {
        op: "add",
        path: `/publications/${book}/tags/606892107`,
        value: { modified: 1612300784084, name: "Zweicoll", category: "collection" },
      },
      {
        op: "add",
        path: `/publications/DT0400.9783641243609_A40398678/tags/1`,
        value: { modified: 1612300784084, name: "collection_finished_readings_name", category: "system" },
      },
    ]);
    const state = states.get(book);
    expect(state).toEqual({
      // Newer bookmark within two minutes: the further one wins; here the
      // second write is older, so the first (newer) one is kept.
      progress: 4,
      progressAt: new Date(1612116931592),
      finished: false,
      finishedAt: null,
    });
    const finished = states.get("DT0400.9783641243609_A40398678");
    expect(finished?.finished).toBe(true);
    expect(finished?.finishedAt).toEqual(new Date(1612300784084));
    expect(finished?.progress).toBeNull();
  });

  it("prefers the bookmark further into the book when written at the same time", () => {
    const states = parseReadingState([
      { op: "add", path: `/publications/${book}/bookmark/1`, value: { modified: 1000, progress: 0.5 } },
      { op: "replace", path: `/publications/${book}/bookmark/1`, value: { modified: 1500, progress: 0.3 } },
    ]);
    expect(states.get(book)?.progress).toBe(50);
  });

  it("treats a removed finished tag as not finished and reading to the end as finished", () => {
    const states = parseReadingState([
      { op: "add", path: `/publications/${book}/tags/1`, value: { modified: 1, name: "collection_finished_readings_name" } },
      { op: "remove", path: `/publications/${book}/tags/1`, value: { modified: 2, name: "collection_finished_readings_name" } },
      { op: "add", path: `/publications/other/bookmark/2`, value: { modified: 3, progress: 0.99 } },
      { op: "add", path: `/audiobooks/audio/bookmark/3`, value: { modified: 4, currentPosition: "9", lastPosition: "10" } },
    ]);
    expect(states.get(book)?.finished).toBe(false);
    expect(states.get("other")).toMatchObject({ finished: true, progress: 99 });
    expect(states.get("audio")).toMatchObject({ finished: false, progress: 90 });
  });

  it("looks publications up by either id", () => {
    const states = parseReadingState([
      { op: "add", path: "/publications/bosh_3_1/bookmark/1", value: { modified: 5, progress: 0.2 } },
    ]);
    expect(
      readingStateFor(states, { publicationId: "DT0400.1", deliverableId: "bosh_3_1" })?.progress,
    ).toBe(20);
    expect(readingStateFor(states, { publicationId: "nope", deliverableId: null })).toBeNull();
  });

  it("collects patches and conflicts from a sync response", () => {
    expect(
      collectPatches({
        revision: "x",
        patches: [{ op: "add", path: "/publications/a/bookmark/1", value: { progress: 1 } }],
        conflicts: [{ serverState: { op: "add", path: "/publications/b/bookmark/1", value: { progress: 0.5 } } }],
      }),
    ).toHaveLength(2);
    expect(collectPatches(undefined)).toEqual([]);
  });
});

describe("extractRefreshToken", () => {
  it("accepts a bare token, a quoted token and the whole token response", () => {
    expect(extractRefreshToken("  abc-123 \n")).toBe("abc-123");
    expect(extractRefreshToken('"abc-123",')).toBe("abc-123");
    expect(
      extractRefreshToken('{"access_token":"x","refresh_token":"r-1","expires_in":3600}'),
    ).toBe("r-1");
    expect(extractRefreshToken('{"refresh_token": "r-2", broken')).toBe("r-2");
    expect(extractRefreshToken("{}")).toBe("");
  });
});

describe("extractTokenResponse", () => {
  it("reads the access token the web reader already obtained", () => {
    const tokens = extractTokenResponse(
      '{"access_token":"a-1","refresh_token":"r-1","expires_in":3600,"refresh_expires_in":3600,"token_type":"bearer"}',
    );
    expect(tokens).toEqual({
      accessToken: "a-1",
      refreshToken: "r-1",
      expiresIn: 3600,
      refreshExpiresIn: 3600,
    });
  });

  it("defaults the access-token lifetime and tolerates a missing refresh expiry", () => {
    expect(extractTokenResponse('{"access_token":"a","refresh_token":"r"}')).toEqual({
      accessToken: "a",
      refreshToken: "r",
      expiresIn: 3600,
      refreshExpiresIn: null,
    });
  });

  it("returns null for a bare token or an incomplete response", () => {
    expect(extractTokenResponse("just-a-refresh-token")).toBeNull();
    expect(extractTokenResponse('{"refresh_token":"r"}')).toBeNull();
    expect(extractTokenResponse('{"access_token":"a"}')).toBeNull();
    expect(extractTokenResponse("{ broken")).toBeNull();
  });
});
