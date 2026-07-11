import type {
  WorkspaceFavorite,
  WorkspaceObject,
  WorkspaceView,
  WorkspaceViewConfig,
} from "@/lib/types";
import { normalizeWorkspaceViewConfig } from "@/lib/workspace-preferences";
import { query, queryOne } from "@/server/db/neon.server";

export type SaveWorkspaceViewInput = {
  profileId: string;
  objectType: WorkspaceObject;
  name: string;
  config: unknown;
  isDefault?: boolean;
};

export type ToggleWorkspaceFavoriteInput = {
  profileId: string;
  kind: WorkspaceFavorite["kind"];
  label: string;
  href: string;
  viewId?: string | null;
  accountId?: string | null;
};

export async function listWorkspaceViews(
  profileId: string,
  objectType: WorkspaceObject,
): Promise<WorkspaceView[]> {
  const rows = await query<WorkspaceView>(
    `select * from workspace_views
     where profile_id = $1 and object_type = $2
     order by is_default desc, updated_at desc`,
    [profileId, objectType],
  );
  return rows.map((row) => ({ ...row, config: normalizeWorkspaceViewConfig(row.config) }));
}

export async function saveWorkspaceView(input: SaveWorkspaceViewInput): Promise<WorkspaceView> {
  const config: WorkspaceViewConfig = normalizeWorkspaceViewConfig(input.config);
  const row = await queryOne<WorkspaceView>(
    `insert into workspace_views (profile_id, object_type, name, config, is_default)
     values ($1, $2, $3, $4::jsonb, $5)
     on conflict (profile_id, object_type, name)
     do update set
       config = excluded.config,
       is_default = excluded.is_default,
       updated_at = now()
     returning *`,
    [
      input.profileId,
      input.objectType,
      input.name.trim(),
      JSON.stringify(config),
      input.isDefault ?? false,
    ],
  );
  if (!row) throw new Error("Failed to save workspace view");
  return { ...row, config: normalizeWorkspaceViewConfig(row.config) };
}

export function listWorkspaceFavorites(profileId: string): Promise<WorkspaceFavorite[]> {
  return query<WorkspaceFavorite>(
    `select * from workspace_favorites
     where profile_id = $1
     order by created_at desc`,
    [profileId],
  );
}

export async function toggleWorkspaceFavorite(
  input: ToggleWorkspaceFavoriteInput,
): Promise<WorkspaceFavorite | null> {
  const existing = await queryOne<WorkspaceFavorite>(
    `select * from workspace_favorites
     where profile_id = $1 and kind = $2 and href = $3`,
    [input.profileId, input.kind, input.href],
  );

  if (existing) {
    await query(
      `delete from workspace_favorites
       where id = $1 and profile_id = $2`,
      [existing.id, input.profileId],
    );
    return null;
  }

  const favorite = await queryOne<WorkspaceFavorite>(
    `insert into workspace_favorites
       (profile_id, kind, label, href, view_id, account_id)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [
      input.profileId,
      input.kind,
      input.label.trim(),
      input.href,
      input.viewId ?? null,
      input.accountId ?? null,
    ],
  );
  if (!favorite) throw new Error("Failed to create workspace favorite");
  return favorite;
}
