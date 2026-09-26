import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  requireNeonAuthSession: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const chain = {
      validator(validator: (data: unknown) => unknown) {
        validate = validator;
        return chain;
      },
      handler<T extends ({ data }: { data: never }) => unknown>(handler: T) {
        return async ({ data }: { data: unknown }) => handler({ data: validate(data) } as never);
      },
    };
    return chain;
  },
}));

vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: mocks.requireCapability,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: mocks.requireNeonAuthSession,
}));

vi.mock("@/server/repositories/tasks", () => ({
  createTask: mocks.createTask,
  updateTask: mocks.updateTask,
  listTasks: vi.fn(),
}));

import { BulkIdsSchema } from "@/lib/operations/input-schemas";
import { createTask, updateTask } from "../tasks";

const TASK_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCapability.mockResolvedValue(undefined);
  mocks.requireNeonAuthSession.mockResolvedValue({ profile: { id: TASK_ID } });
  mocks.createTask.mockResolvedValue({ id: TASK_ID });
  mocks.updateTask.mockResolvedValue({ id: TASK_ID });
});

describe("ClientOps write boundary validation", () => {
  it("rejects a blank task title before any repository write", async () => {
    await expect(createTask({ data: { title: "   " } })).rejects.toThrow();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it("rejects an impossible calendar date before writing a task", async () => {
    await expect(
      createTask({ data: { title: "Follow up", due_date: "2026-02-30" } }),
    ).rejects.toThrow();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it("rejects an unknown task priority before writing", async () => {
    await expect(
      createTask({ data: { title: "Follow up", priority: "urgent" } }),
    ).rejects.toThrow();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it("rejects an unknown update field before writing", async () => {
    await expect(
      updateTask({ data: { id: TASK_ID, updates: { created_by_agent: "spoof" } } }),
    ).rejects.toThrow();
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it("rejects a malformed record ID before writing", async () => {
    await expect(updateTask({ data: { id: "", updates: { status: "done" } } })).rejects.toThrow();
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it("preserves an explicit null clear and omits an absent field", async () => {
    await updateTask({ data: { id: TASK_ID, updates: { description: null } } });
    expect(mocks.updateTask).toHaveBeenCalledWith(TASK_ID, { description: null });

    await createTask({ data: { title: "Follow up" } });
    expect(mocks.createTask).toHaveBeenCalledWith({ title: "Follow up" });
  });
});

it("caps explicit bulk IDs at 100 and rejects duplicates", () => {
  const ids = Array.from(
    { length: 101 },
    (_, index) => "00000000-0000-4000-8000-" + String(index + 1).padStart(12, "0"),
  );
  expect(BulkIdsSchema.safeParse(ids.slice(0, 100)).success).toBe(true);
  expect(BulkIdsSchema.safeParse(ids).success).toBe(false);
  expect(BulkIdsSchema.safeParse([ids[0], ids[0]]).success).toBe(false);
});
