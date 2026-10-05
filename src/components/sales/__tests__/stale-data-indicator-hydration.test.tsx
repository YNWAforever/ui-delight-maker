// @vitest-environment jsdom

import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaleDataIndicator } from "../states";

/**
 * Server HTML hydrated by the browser, the way TanStack Start does it.
 *
 * On the server a query has its data and is not fetching. In the browser the same query can
 * start a refetch on mount, and React Query reports that on the very first render — so the
 * indicator rendered "Refreshing…" where the server had rendered "Updated …", a text mismatch
 * that throws away the server HTML (React error #418, audit UX-23). Each side also records
 * its own fetch time, so the timestamp itself may differ.
 */
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function hydrate(server: React.ReactElement, client: React.ReactElement) {
  const container = document.createElement("div");
  container.innerHTML = renderToString(server);
  document.body.appendChild(container);
  const recoverable: unknown[] = [];
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  await act(async () => {
    hydrateRoot(container, client, { onRecoverableError: (error) => recoverable.push(error) });
  });
  const hydrationMessages = consoleError.mock.calls
    .map((args) => String(args[0]))
    .filter((message) => /hydrat/i.test(message));
  return { container, recoverable, hydrationMessages };
}

describe("StaleDataIndicator hydration", () => {
  it("hydrates cleanly when the browser starts a refetch on mount", async () => {
    const { container, recoverable, hydrationMessages } = await hydrate(
      <StaleDataIndicator updatedAt="2026-10-05T02:00:00.000Z" isRefetching={false} />,
      <StaleDataIndicator updatedAt="2026-10-05T02:00:00.000Z" isRefetching />,
    );

    expect(recoverable).toEqual([]);
    expect(hydrationMessages).toEqual([]);
    // Once mounted it does say so.
    expect(container.textContent).toContain("Refreshing");
  });

  it("hydrates cleanly when server and browser recorded different fetch times", async () => {
    const { recoverable, hydrationMessages } = await hydrate(
      <StaleDataIndicator updatedAt="2026-10-05T02:00:00.000Z" />,
      <StaleDataIndicator updatedAt="2026-10-05T02:00:03.000Z" />,
    );

    expect(recoverable).toEqual([]);
    expect(hydrationMessages).toEqual([]);
  });
});
