// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ListPagination } from "../list-pagination";
import { clampPageNumber } from "@/lib/pagination";

afterEach(() => cleanup());

describe("ListPagination", () => {
  it("reports the visible range and requests adjacent pages", async () => {
    const onPageChange = vi.fn();
    render(<ListPagination page={2} limit={50} total={120} onPageChange={onPageChange} />);

    expect(screen.getByText("51–100 of 120")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Previous page" }));
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it("disables navigation at the first and last pages", () => {
    const { rerender } = render(
      <ListPagination page={1} limit={50} total={75} onPageChange={vi.fn()} />,
    );

    expect(
      (screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    rerender(<ListPagination page={2} limit={50} total={75} onPageChange={vi.fn()} />);

    expect(
      (screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("groups thousands like every other count", () => {
    // UX-35: Renewals read "5036" beside "5,041".
    render(<ListPagination page={2} limit={50} total={5036} onPageChange={vi.fn()} />);

    expect(screen.getByText("51–100 of 5,036")).not.toBeNull();
  });

  it("clamps the range to the last page when the URL asks for a page past the end", async () => {
    // `?page=99` is only validated to min(1), so the old arithmetic rendered a reversed range
    // and disabled Next against an unreachable page. It must now show the last real page and
    // ask the caller to rewrite the URL there.
    const onPageChange = vi.fn();
    render(<ListPagination page={99} limit={50} total={120} onPageChange={onPageChange} />);

    expect(screen.getByText("101–120 of 120")).not.toBeNull();
    expect(
      (screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await waitFor(() => expect(onPageChange).toHaveBeenCalledWith(3));
    expect(onPageChange).toHaveBeenCalledTimes(1);
  });

  it("asks for the last page only once while the out-of-range page stays mounted", async () => {
    // Routes pass an inline arrow as onPageChange, so the callback identity changes on every
    // parent render. The rewrite must not re-fire while the requested page is still stale.
    const first = vi.fn();
    const { rerender } = render(
      <ListPagination page={99} limit={50} total={120} onPageChange={first} />,
    );

    await waitFor(() => expect(first).toHaveBeenCalledTimes(1));

    const second = vi.fn();
    rerender(<ListPagination page={99} limit={50} total={120} onPageChange={second} />);

    expect(second).not.toHaveBeenCalled();
  });

  it("does not redirect when the page is exactly the last page", async () => {
    const onPageChange = vi.fn();
    render(<ListPagination page={3} limit={50} total={120} onPageChange={onPageChange} />);

    expect(screen.getByText("101–120 of 120")).not.toBeNull();
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("renders an empty result set without a range or a redirect", () => {
    const onPageChange = vi.fn();
    render(<ListPagination page={1} limit={50} total={0} onPageChange={onPageChange} />);

    expect(screen.getByText("0–0 of 0")).not.toBeNull();
    expect(
      (screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("renders the first page range and leaves Next available", () => {
    const onPageChange = vi.fn();
    render(<ListPagination page={1} limit={50} total={120} onPageChange={onPageChange} />);

    expect(screen.getByText("1–50 of 120")).not.toBeNull();
    expect(
      (screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(onPageChange).not.toHaveBeenCalled();
  });
});

describe("clampPageNumber", () => {
  it("clamps into the real page range and never reports page zero", () => {
    expect(clampPageNumber(99, 120, 50)).toBe(3);
    expect(clampPageNumber(3, 120, 50)).toBe(3);
    expect(clampPageNumber(1, 120, 50)).toBe(1);
    expect(clampPageNumber(0, 120, 50)).toBe(1);
    expect(clampPageNumber(Number.NaN, 120, 50)).toBe(1);
    // No results still has one addressable page, which is what the controls disable around.
    expect(clampPageNumber(1, 0, 50)).toBe(1);
    expect(clampPageNumber(4, 0, 50)).toBe(1);
  });
});
