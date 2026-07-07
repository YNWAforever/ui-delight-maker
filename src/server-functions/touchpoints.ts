import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  createTouchpoint as createTouchpointInNeon,
  listTouchpointsByClient,
} from "@/server/repositories/touchpoints";
import type { TouchpointNewSentiment, TouchpointNewType } from "@/lib/types";

export const getTouchpointsByClient = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { clientId: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return listTouchpointsByClient(data.clientId);
  });

export const createTouchpoint = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        client_id: string;
        engagement_id?: string | null;
        contact_id?: string | null;
        type: TouchpointNewType;
        sentiment?: TouchpointNewSentiment;
        notes?: string | null;
        occurred_at?: string;
      },
  )
  .handler(async ({ data }) => {
    const session = await requireNeonAuthSession();
    return createTouchpointInNeon({ ...data, logged_by: session.user.id });
  });
