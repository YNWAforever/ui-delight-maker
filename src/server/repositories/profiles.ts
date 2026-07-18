import type { Profile } from "@/lib/types";
import { queryOne } from "@/server/db/neon.server";

type AuthUserForProfile = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

const PROFILE_COLUMNS = `
  id, email, name, role, status, avatar_url, job_title, phone, locale, timezone,
  primary_department_id, manager_profile_id, last_active_at, session_invalid_before,
  suspended_at, suspended_by, suspension_reason, deactivated_at, deactivated_by,
  deactivation_reason, availability_status, leave_starts_at, leave_ends_at, created_at
`;

function fallbackName(user: AuthUserForProfile) {
  if (user.name) return user.name;
  if (user.email) return user.email.split("@")[0] ?? user.email;
  return "Fimmick user";
}

// Invitation acceptance is the only normal caller that may create a business profile.
export async function ensureProfileForAuthUser(user: AuthUserForProfile) {
  const profile = await queryOne<Profile>(
    `
      insert into profiles (id, email, name, avatar_url)
      values ($1, $2, $3, $4)
      on conflict (id) do update set
        email = excluded.email,
        name = coalesce(profiles.name, excluded.name),
        avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url)
      returning ${PROFILE_COLUMNS}
    `,
    [user.id, user.email ?? null, fallbackName(user), user.image ?? null],
  );

  if (!profile) {
    throw new Error("Failed to create or load profile for authenticated user");
  }

  return profile;
}

export async function getProfileById(id: string) {
  return queryOne<Profile>(`select ${PROFILE_COLUMNS} from profiles where id = $1`, [id]);
}

export async function getProfileByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  return queryOne<Profile>(`select ${PROFILE_COLUMNS} from profiles where lower(email) = $1`, [
    normalizedEmail,
  ]);
}
