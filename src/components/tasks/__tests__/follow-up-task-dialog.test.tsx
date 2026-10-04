// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createTaskMock, toastSuccessMock } = vi.hoisted(() => ({
  createTaskMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("@/server-functions/tasks", () => ({ createTask: createTaskMock }));
vi.mock("sonner", () => ({ toast: { success: toastSuccessMock, error: vi.fn() } }));

import { FollowUpTaskDialog } from "../follow-up-task-dialog";

beforeEach(() => {
  // 10:00 in Hong Kong, so "two days from now" is unambiguous.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T02:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  createTaskMock.mockReset();
  toastSuccessMock.mockReset();
});

function renderDialog(onCreated = vi.fn()) {
  render(
    <FollowUpTaskDialog
      link={{ lead_id: "lead-1" }}
      defaultTitle="Follow up with 香港拯救貓狗協會有限公司"
      onCreated={onCreated}
    />,
  );
  return { onCreated };
}

describe("FollowUpTaskDialog", () => {
  it("creates a task linked to the record, due in two business-calendar days", async () => {
    createTaskMock.mockResolvedValue({ id: "task-1" });
    const { onCreated } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Add follow-up task" }));
    const title = screen.getByRole("textbox", { name: "What needs to happen" }) as HTMLInputElement;
    expect(title.value).toBe("Follow up with 香港拯救貓狗協會有限公司");
    expect((screen.getByLabelText("Due") as HTMLInputElement).value).toBe("2026-10-07");

    await userEvent.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() =>
      expect(createTaskMock).toHaveBeenCalledWith({
        data: {
          title: "Follow up with 香港拯救貓狗協會有限公司",
          due_date: "2026-10-07",
          priority: "medium",
          lead_id: "lead-1",
        },
      }),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Follow-up task created");
    expect(onCreated).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("asks for a title instead of sending an empty one", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Add follow-up task" }));
    const title = screen.getByRole("textbox", { name: "What needs to happen" });
    await userEvent.clear(title);
    await userEvent.click(screen.getByRole("button", { name: "Create task" }));

    expect(screen.getByText("Say what needs to happen next.")).toBeTruthy();
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("keeps the dialog and the typed title when the server refuses", async () => {
    createTaskMock.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432"));
    const { onCreated } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Add follow-up task" }));
    const title = screen.getByRole("textbox", { name: "What needs to happen" });
    await userEvent.clear(title);
    await userEvent.type(title, "Send revised deck");
    await userEvent.click(screen.getByRole("button", { name: "Create task" }));

    const alert = await screen.findByRole("alert");
    // The raw driver message never reaches the screen.
    expect(alert.textContent).not.toContain("ECONNREFUSED");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((title as HTMLInputElement).value).toBe("Send revised deck");
    expect(onCreated).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("never prefills a title longer than the server accepts", async () => {
    // Self-review of fe30e41: maxLength limits typing, not a prefilled value, and the schema
    // refuses titles over 255 characters.
    render(<FollowUpTaskDialog link={{ lead_id: "lead-1" }} defaultTitle={"貓".repeat(300)} />);
    await userEvent.click(screen.getByRole("button", { name: "Add follow-up task" }));

    const title = screen.getByRole("textbox", { name: "What needs to happen" }) as HTMLInputElement;
    expect(title.value).toHaveLength(255);
  });
});
