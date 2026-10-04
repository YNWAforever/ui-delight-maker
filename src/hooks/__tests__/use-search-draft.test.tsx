// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useSearchDraft } from "../use-search-draft";

describe("useSearchDraft", () => {
  it("keeps a trailing space the person is still typing when its trimmed commit comes back", () => {
    const { result, rerender } = renderHook(({ committed }) => useSearchDraft(committed), {
      initialProps: { committed: "" },
    });

    act(() => result.current[1]("renewal "));
    // The route commits "renewal" to the URL, and the URL comes back as the committed value.
    rerender({ committed: "renewal" });

    expect(result.current[0]).toBe("renewal ");
  });

  it("follows the URL when it changes from elsewhere (Back, Clear, a saved view)", () => {
    const { result, rerender } = renderHook(({ committed }) => useSearchDraft(committed), {
      initialProps: { committed: "renewal" },
    });

    act(() => result.current[1]("renewal "));
    rerender({ committed: "" });
    expect(result.current[0]).toBe("");

    rerender({ committed: "northstar" });
    expect(result.current[0]).toBe("northstar");
  });

  it("starts from the committed value", () => {
    const { result } = renderHook(() => useSearchDraft("harbour"));

    expect(result.current[0]).toBe("harbour");
  });
});
