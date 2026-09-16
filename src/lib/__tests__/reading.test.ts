import { describe, expect, it } from "vitest";
import { deriveProgress, deriveSessions } from "../reading";

const day = (n: number) => new Date(2026, 0, n);

describe("deriveProgress", () => {
  it("returns nothing without events", () => {
    expect(deriveProgress([], 300)).toEqual({ percent: null, page: null, asOf: null });
  });

  it("uses the latest progress marker", () => {
    const progress = deriveProgress(
      [
        { type: "started", occurredAt: day(1), page: null, percent: null },
        { type: "progress", occurredAt: day(3), page: 150, percent: null },
        { type: "note", occurredAt: day(4), page: null, percent: null },
      ],
      300,
    );
    expect(progress).toEqual({ percent: 50, page: 150, asOf: day(3) });
  });

  it("derives pages from a percentage", () => {
    const progress = deriveProgress(
      [{ type: "progress", occurredAt: day(2), page: null, percent: 25 }],
      200,
    );
    expect(progress.page).toBe(50);
  });

  it("is complete once finished", () => {
    const progress = deriveProgress(
      [
        { type: "progress", occurredAt: day(2), page: 10, percent: null },
        { type: "finished", occurredAt: day(9), page: null, percent: null },
      ],
      120,
    );
    expect(progress).toEqual({ percent: 100, page: 120, asOf: day(9) });
  });

  it("resets after a re-read starts", () => {
    const progress = deriveProgress(
      [
        { type: "finished", occurredAt: day(2), page: null, percent: null },
        { type: "started", occurredAt: day(5), page: null, percent: null },
      ],
      100,
    );
    expect(progress).toEqual({ percent: 0, page: 0, asOf: day(5) });
  });
});

describe("deriveProgress tie-breaking", () => {
  it("prefers the later-created event when timestamps are equal", () => {
    const at = day(3);
    const progress = deriveProgress(
      [
        { type: "started", occurredAt: at, page: null, percent: null, createdAt: new Date(1) },
        { type: "progress", occurredAt: at, page: 30, percent: null, createdAt: new Date(2) },
      ],
      100,
    );
    expect(progress).toEqual({ percent: 30, page: 30, asOf: at });
  });
});

describe("deriveSessions", () => {
  it("pairs starts with finishes", () => {
    const sessions = deriveSessions([
      { type: "started", occurredAt: day(1), page: null, percent: null },
      { type: "finished", occurredAt: day(11), page: null, percent: null },
      { type: "started", occurredAt: day(20), page: null, percent: null },
    ]);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ outcome: "finished", days: 10 });
    expect(sessions[1]).toMatchObject({ outcome: null, endedAt: null });
  });

  it("ignores an end without a start", () => {
    expect(
      deriveSessions([
        { type: "abandoned", occurredAt: day(1), page: null, percent: null },
      ]),
    ).toEqual([]);
  });
});
