// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ListPagination } from "../list-pagination";

afterEach(() => cleanup());

describe("ListPagination", () => {
  it("reports the visible range and requests adjacent pages", async () => {
    const onPageChange = vi.fn();
    render(<ListPagination page={2} limit={50} total={120} onPageChange={onPageChange} />);

    expect(screen.getByText("51-100 of 120")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Previous page" }));
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it("disables navigation at the first and last pages", () => {
    const { rerender } = render(
      <ListPagination page={1} limit={50} total={75} onPageChange={vi.fn()} />,
    );

    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(false);

    rerender(<ListPagination page={2} limit={50} total={75} onPageChange={vi.fn()} />);

    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
