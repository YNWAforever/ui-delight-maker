// @vitest-environment jsdom
import { renderToReadableStream } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  previewImportFn: vi.fn(),
  commitImportFn: vi.fn(),
  resumeImportFn: vi.fn(),
  getImportResultFn: vi.fn(),
}));
vi.mock("@/server-functions/import-sessions", () => api);
import { ImportSessionPanel } from "../import-session-panel";
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.resetAllMocks();
});
describe("CSV importer hydration", () => {
  it.each(["lead", "client", "event"] as const)(
    "withholds the %s file picker until its upload handler can attach",
    async (kind) => {
      const stream = await renderToReadableStream(<ImportSessionPanel kind={kind} />);
      await stream.allReady;
      const html = await new Response(stream).text();
      expect(html).not.toContain('type="file"');
      expect(html).not.toContain("Source system ID namespace");
      expect(html).toContain("Loading CSV import");
    },
  );
  it("handles an upload as soon as the hydrated picker becomes available", async () => {
    const csvText = "\uFEFFcompany_name,contact_email\r\n假公司,fake@example.test\r\n";
    api.previewImportFn.mockResolvedValue({
      sessionId: "synthetic-session",
      previewHash: "synthetic-hash",
      previewExpiresAt: "2099-01-01T00:00:00Z",
      state: "preview",
      processed: 0,
      total: 1,
      rows: [
        {
          recordIndex: 1,
          sourceLine: 2,
          action: "create",
          status: null,
          errors: [],
          id: null,
          retryable: false,
        },
      ],
    });
    render(<ImportSessionPanel kind="lead" />);
    const input = await screen.findByLabelText("CSV file (up to 5 MiB and 5,000 rows)");
    const file = new File([csvText], "synthetic.csv", { type: "text/csv" });
    // jsdom does not implement File.text; this supplies the browser API, not an import result.
    Object.defineProperty(file, "text", { value: async () => csvText });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(api.previewImportFn).toHaveBeenCalledWith({
        data: { kind: "lead", csvText },
      }),
    );
    expect(await screen.findByText("State: preview")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Commit next 20" })).toBeTruthy();
    expect(api.commitImportFn).not.toHaveBeenCalled();
    expect(api.resumeImportFn).not.toHaveBeenCalled();
  });
});

describe("saved CSV result read recovery", () => {
  it.each(["lead", "client", "event"] as const)(
    "retains %s key, blocks replacement, and retries only its receipt read",
    async (kind) => {
      const key = "clientops-import:" + kind + ":";
      const saved = {
        sessionId: "saved-session",
        previewHash: "same-hash",
        previewExpiresAt: "2099-01-01T00:00:00Z",
        idempotencyKey: "same-key",
      };
      localStorage.setItem(key, JSON.stringify(saved));
      api.getImportResultFn
        .mockRejectedValueOnce(new Error("Network interrupted"))
        .mockResolvedValueOnce({
          sessionId: saved.sessionId,
          state: "paused",
          processed: 0,
          total: 1,
          rows: [
            {
              recordIndex: 1,
              sourceLine: 2,
              action: "create",
              status: null,
              errors: [],
              id: null,
              retryable: false,
            },
          ],
        });
      render(<ImportSessionPanel kind={kind} />);
      await screen.findByRole("alert");
      const file = screen.getByLabelText(
        "CSV file (up to 5 MiB and 5,000 rows)",
      ) as HTMLInputElement;
      const retry = screen.getByRole("button", { name: "Retry loading result" });
      expect(file.disabled).toBe(true);
      expect(
        (
          screen.getByLabelText(
            "Source system ID namespace (required with external_id)",
          ) as HTMLInputElement
        ).disabled,
      ).toBe(true);
      // Even a synthetic change cannot replace an unresolved saved receipt.
      fireEvent.change(file, {
        target: {
          files: [
            {
              name: "replacement.csv",
              text: async () => "company_name,contact_email\nFake,fake@example.test",
            },
          ],
        },
      });
      expect(api.previewImportFn).not.toHaveBeenCalled();
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual(saved);
      fireEvent.click(retry);
      expect(await screen.findByRole("button", { name: "Continue next 20" })).toBeTruthy();
      expect(api.getImportResultFn.mock.calls).toEqual([
        [{ data: { sessionId: saved.sessionId } }],
        [{ data: { sessionId: saved.sessionId } }],
      ]);
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual(saved);
      expect(api.commitImportFn).not.toHaveBeenCalled();
      expect(api.resumeImportFn).not.toHaveBeenCalled();
    },
  );
});
