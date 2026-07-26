import { describe, expect, it } from "vitest";
import { slaChip } from "../approval-sla";

const NOW = new Date("2026-07-26T12:00:00Z").getTime();
const raisedHoursAgo = (hours: number) => new Date(NOW - hours * 3600_000).toISOString();

describe("slaChip", () => {
  it("counts down while the 4-hour SLA is intact", () => {
    expect(slaChip(raisedHoursAgo(1), NOW).text).toBe("3.0h left");
  });

  it("switches to minutes inside the final hour", () => {
    expect(slaChip(raisedHoursAgo(3.5), NOW).text).toBe("30m left");
  });

  it("reports a breach once the window has passed", () => {
    expect(slaChip(raisedHoursAgo(5), NOW).text).toBe("SLA breached");
  });

  it("does not breach an approval raised moments ago", () => {
    // The defect this replaces: `now` was pinned to 2026-05-20, so every approval raised
    // before that date read "SLA breached" forever, and every one raised after it showed a
    // countdown of hundreds of hours. Neither told anyone anything true.
    expect(slaChip(raisedHoursAgo(0.1), NOW).text).not.toBe("SLA breached");
  });
});
