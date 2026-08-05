import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import type { WorkspaceFavorite, WorkspaceObject } from "@/lib/types";
import {
  listWorkspaceFavorites,
  listWorkspaceViews,
  saveWorkspaceView,
  toggleWorkspaceFavorite,
} from "@/server/repositories/workspace-preferences";

type SaveViewData = {
  objectType: WorkspaceObject;
  name: string;
  config: unknown;
  isDefault?: boolean;
};

type ToggleFavoriteData = {
  kind: WorkspaceFavorite["kind"];
  label: string;
  href: string;
  viewId?: string | null;
  accountId?: string | null;
};

function rejectCallerProfileId(data: unknown) {
  if (data && typeof data === "object" && "profileId" in data) {
    throw new Error("profileId is managed by the authenticated session");
  }
}

export const getWorkspacePreferences = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as { objectType?: WorkspaceObject })
  .handler(async ({ data }) => {
    rejectCallerProfileId(data);
    const session = await requireNeonAuthSession();
    const objectType = data.objectType ?? "account";
    const [views, favorites] = await Promise.all([
      listWorkspaceViews(session.profile.id, objectType),
      listWorkspaceFavorites(session.profile.id),
    ]);
    return { views, favorites };
  });

export const savePersonalWorkspaceView = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as SaveViewData)
  .handler(async ({ data }) => {
    rejectCallerProfileId(data);
    const session = await requireNeonAuthSession();
    return saveWorkspaceView({ ...data, profileId: session.profile.id });
  });

export const togglePersonalWorkspaceFavorite = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as ToggleFavoriteData)
  .handler(async ({ data }) => {
    rejectCallerProfileId(data);
    const session = await requireNeonAuthSession();
    return toggleWorkspaceFavorite({ ...data, profileId: session.profile.id });
  });
