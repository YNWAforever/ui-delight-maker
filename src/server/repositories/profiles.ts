import type { Profile } from "@/lib/types";
import { queryOne } from "@/server/db/neon.server";

type AuthUserForProfile = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

function fallbackName(user: AuthUserForProfile) {
  if (user.name) return user.name;
  if (user.email) return user.email.split("@")[0] ?? user.email;
  return "Fimmick user";
}

export async function ensureProfileForAuthUser(user: AuthUserForProfile) {
  const profile = await queryOne<Profile>(
    `
      insert into profiles (id, email, name, avatar_url)
      values ($1, $2, $3, $4)
      on conflict (id) do update set
        email = excluded.email,
        name = coalesce(profiles.name, excluded.name),
        avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url)
      returning id, name, role, avatar_url, created_at
    `,
    [user.id, user.email ?? null, fallbackName(user), user.image ?? null],
  );

  if (!profile) {
    throw new Error("Failed to create or load profile for authenticated user");
  }

  return profile;
}

export async function getProfileById(id: string) {
  return queryOne<Profile>(
    "select id, name, role, avatar_url, created_at from profiles where id = $1",
    [id],
  );
}
