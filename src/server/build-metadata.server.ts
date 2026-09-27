/** Public release identifier only. Never serialize the environment itself. */
export function readPublicBuildMetadata(env: Record<string, string | undefined> = process.env): {
  commitSha: string | null;
} {
  const candidate = env.VERCEL_GIT_COMMIT_SHA ?? env.GITHUB_SHA;
  return { commitSha: candidate && /^[a-f0-9]{40}$/.test(candidate) ? candidate : null };
}
