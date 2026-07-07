import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  dismissRelationshipSignal,
  listRelationshipSignals,
} from "@/server/repositories/relationship-signals";

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
  .validator((data: unknown) => data as { id: string; reason: string })
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    return dismissRelationshipSignal(data.id, {
      dismissed_by: session.user.id,
      dismissal_reason: data.reason,
    });
  });
