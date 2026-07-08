import { createServerFn } from "@tanstack/react-start";
import type { AccountTimelineKind } from "@/lib/relationship/types";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { getAccountTimeline as getAccountTimelineFromNeon } from "@/server/repositories/account-timeline";
import { listActivityLogs } from "@/server/repositories/activity-logs";
import { serializeActivityLog } from "@/server-functions/serializers";

export const getActivityLogsForClient = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { clientId: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    const logs = await listActivityLogs({ object_id: data.clientId });
    return logs.map(serializeActivityLog);
  });

export const getAccountTimeline = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { accountId: string; kinds?: AccountTimelineKind[] })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return getAccountTimelineFromNeon(data);
  });
