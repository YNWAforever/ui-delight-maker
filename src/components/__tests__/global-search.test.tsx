// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { searchWorkspaceMock, navigateMock } = vi.hoisted(() => ({
  searchWorkspaceMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("@/server-functions/search", () => ({ searchWorkspace: searchWorkspaceMock }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigateMock }));

import { GlobalSearch } from "../global-search";

afterEach(() => cleanup());

describe("GlobalSearch", () => {
  it("searches only after three meaningful characters", async () => {
    searchWorkspaceMock.mockResolvedValue([]);
    render(<GlobalSearch />);
    const input = screen.getByRole("textbox", { name: "Search workspace" });

    await userEvent.type(input, "Ac");
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(searchWorkspaceMock).not.toHaveBeenCalled();

    await userEvent.type(input, "me");
    await waitFor(() => expect(searchWorkspaceMock).toHaveBeenCalledTimes(1));
    expect(searchWorkspaceMock).toHaveBeenCalledWith({ data: { query: "Acme", limit: 20 } });
  });
});
