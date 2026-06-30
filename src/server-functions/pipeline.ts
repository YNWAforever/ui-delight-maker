import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import { getPipelineData as getPipelineDataFromNeon } from "@/server/repositories/pipeline";
import {
  serializePipelineData,
  type SerializablePipelineData as PipelineData,
} from "@/server-functions/serializers";
export type { PipelineData };

export const getPipelineData = createServerFn({ method: "GET" }).handler(async () => {
  await requireNeonAuthSession();
  return serializePipelineData(await getPipelineDataFromNeon());
});
