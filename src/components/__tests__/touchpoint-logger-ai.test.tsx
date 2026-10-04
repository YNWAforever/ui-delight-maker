// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ available: vi.fn(), tidy: vi.fn(), save: vi.fn() }));
vi.mock("@/server-functions/ai-note-tidy", () => ({
  isAiNoteTidyAvailable: api.available,
  tidyTouchpointNote: api.tidy,
}));
vi.mock("@/server-functions/touchpoints", () => ({ createTouchpoint: api.save }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/agents">{children}</a>,
}));
import { TouchpointLogger } from "../touchpoint-logger";
function mount() {
  render(
    <TouchpointLogger
      clientId="synthetic-client"
      engagements={[]}
      contacts={[]}
      trigger={<button>Log note</button>}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Log note" }));
  fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Original client facts." } });
}
beforeEach(() => {
  vi.resetAllMocks();
  api.available.mockResolvedValue({ available: true });
  api.tidy.mockResolvedValue({
    tidied: "Clear client facts.",
    runId: "00000000-0000-4000-8000-000000000001",
  });
  api.save.mockResolvedValue({ id: "saved" });
});
afterEach(cleanup);
describe("review optional note tidy before saving", () => {
  it("cancel_restores_original_note", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Tidy with AI" }));
    await screen.findByText("Clear client facts.");
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe(
      "Original client facts.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep original note" }));
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe(
      "Original client facts.",
    );
    expect(api.save).not.toHaveBeenCalled();
  });
  it("accepts the proposed text only after review", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Tidy with AI" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use tidied note" }));
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe(
      "Clear client facts.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save touchpoint" }));
    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith({
        data: expect.objectContaining({ notes: "Clear client facts." }),
      }),
    );
  });
  it("does not overwrite text edited while the optional provider request is pending", async () => {
    let resolve!: (data: { tidied: string }) => void;
    api.tidy.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Tidy with AI" }));
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "New manual facts." } });
    resolve({ tidied: "Old proposal." });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Tidying…" })).toBeNull());
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("New manual facts.");
    expect(screen.queryByRole("button", { name: "Use tidied note" })).toBeNull();
  });
  it("provider failure keeps manual save independent", async () => {
    api.tidy.mockRejectedValue(new Error("provider timeout"));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Tidy with AI" }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Save touchpoint" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save touchpoint" }));
    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith({
        data: expect.objectContaining({ notes: "Original client facts." }),
      }),
    );
  });
  it("ignores a failure from a closed draft after reopening", async () => {
    let reject!: (reason: Error) => void;
    api.tidy.mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Tidy with AI" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Log note" }));
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "New reopened draft." } });
    await act(async () => {
      reject(new Error("Old request failed"));
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe(
      "New reopened draft.",
    );
  });
  it("an old completion cannot unlock a newer request after reopening", async () => {
    let finishOld!: (data: { tidied: string }) => void;
    let finishNew!: (data: { tidied: string }) => void;
    api.tidy
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishOld = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishNew = resolve;
        }),
      );
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Tidy with AI" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Log note" }));
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "New reopened draft." } });
    const nextTidy = screen.getByRole("button", { name: "Tidy with AI" });
    expect((nextTidy as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(nextTidy);
    await act(async () => {
      finishOld({ tidied: "Obsolete suggestion." });
    });
    expect((screen.getByRole("button", { name: "Tidying…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.queryByRole("region", { name: "Review tidied note" })).toBeNull();
    await act(async () => {
      finishNew({ tidied: "Current suggestion." });
    });
    expect(screen.getByRole("region", { name: "Review tidied note" }).textContent).toContain(
      "Current suggestion.",
    );
  });
  it("manual save clears the pending UI state and ignores its later failure", async () => {
    let reject!: (reason: Error) => void;
    api.tidy.mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Tidy with AI" }));
    fireEvent.click(screen.getByRole("button", { name: "Save touchpoint" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Log note" }));
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Another manual draft." },
    });
    expect(
      (screen.getByRole("button", { name: "Tidy with AI" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    await act(async () => {
      reject(new Error("Saved draft's old request failed"));
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe(
      "Another manual draft.",
    );
  });
  it("a pending failure does not add an alert to an edited manual draft", async () => {
    let reject!: (reason: Error) => void;
    api.tidy.mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Tidy with AI" }));
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "New edited facts." } });
    await act(async () => {
      reject(new Error("Original request failed"));
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Tidy with AI" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("New edited facts.");
  });
});
