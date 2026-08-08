import { describe, expect, it } from "vitest";

import * as cache from "../cache";

type GetDisplayedOpenSignalCount = (input: {
  totalCount: number;
  visibleSignalIds: readonly string[];
  dismissedSignalIds: readonly string[];
}) => number;

describe("getDisplayedOpenSignalCount", () => {
  it("keeps an aggregate above the top-five projection and subtracts only dismissed visible rows", () => {
    const getDisplayedOpenSignalCount = (
      cache as typeof cache & {
        getDisplayedOpenSignalCount?: GetDisplayedOpenSignalCount;
      }
    ).getDisplayedOpenSignalCount;

    expect(getDisplayedOpenSignalCount).toBeTypeOf("function");
    if (!getDisplayedOpenSignalCount) return;

    const visibleSignalIds = ["signal-1", "signal-2", "signal-3", "signal-4", "signal-5"];

    expect(
      getDisplayedOpenSignalCount({
        totalCount: 8,
        visibleSignalIds,
        dismissedSignalIds: [],
      }),
    ).toBe(8);
    expect(
      getDisplayedOpenSignalCount({
        totalCount: 8,
        visibleSignalIds,
        dismissedSignalIds: ["signal-2", "signal-2", "signal-outside-projection"],
      }),
    ).toBe(7);
    expect(
      getDisplayedOpenSignalCount({
        totalCount: 0,
        visibleSignalIds,
        dismissedSignalIds: ["signal-1"],
      }),
    ).toBe(0);
  });
});
