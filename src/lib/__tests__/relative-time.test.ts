import { describe, expect, it } from "vitest";
import { relativeTime } from "../format";

const NOW = new Date("2026-07-26T12:00:00Z").getTime();
const at = (iso: string) => relativeTime(iso, NOW);

describe("relativeTime", () => {
  it("reads past timestamps as ago and future ones as from now", () => {
    expect(at("2026-07-26T10:00:00Z")).toBe("2h ago");
    expect(at("2026-07-26T14:00:00Z")).toBe("2h from now");
  });

  it("steps through seconds, minutes, hours and days", () => {
    expect(at("2026-07-26T11:59:30Z")).toBe("30s ago");
    expect(at("2026-07-26T11:30:00Z")).toBe("30m ago");
    expect(at("2026-07-26T09:00:00Z")).toBe("3h ago");
    expect(at("2026-07-23T12:00:00Z")).toBe("3d ago");
  });

  it("does not report a recent timestamp as being in the future", () => {
    // The defect this replaces: `now` was pinned to 2026-05-20, so anything created after
    // that date — i.e. everything, by mid-2026 — rendered as "from now". A notification
    // that arrived an hour ago read as arriving months from now.
    const anHourAgo = new Date(NOW - 3600_000).toISOString();
    expect(at(anHourAgo)).toBe("1h ago");
    expect(at(anHourAgo)).not.toContain("from now");
  });
});
