import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  dismissRelationshipSignal,
  listRelationshipSignals,
} from "@/server/repositories/relationship-signals";

type DismissRelationshipSignalInput = {
  id: string;
  reason: string;
};

export function parseDismissRelationshipSignalInput(data: unknown): DismissRelationshipSignalInput {
  if (!data || typeof data !== "object") {
    throw new Error("id and reason are required");
  }

  const candidate = data as Partial<DismissRelationshipSignalInput>;
  const id = candidate.id?.trim();
  const reason = candidate.reason?.trim();

  if (!id || !reason) {
    throw new Error("id and reason are required");
  }

  return { id, reason };
}

export const getRelationshipSignals = createServerFn({ method: "GET" })
  .validator(
    (data: unknown) =>
      (data ?? {}) as { account_id?: string; signal_type?: string; openOnly?: boolean },
  )
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return listRelationshipSignals(data);
  });

export const dismissRelationshipSignalFn = createServerFn({ method: "POST" })
  .validator(parseDismissRelationshipSignalInput)
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    return dismissRelationshipSignal(data.id, {
      dismissed_by: session.user.id,
      dismissal_reason: data.reason,
    });
  });
