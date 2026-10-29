import { chmod, copyFile, rename, writeFile } from "node:fs/promises";

/**
 * Atomically persist a rotated WFM refresh token to `path` (mode 0600).
 * Writes `${path}.tmp`, backs up any existing file to `${path}.bak`, then renames.
 * Never logs or returns the token value.
 */
export async function persistRefreshToken(path: string, token: string): Promise<void> {
  if (!token) throw new Error("Refusing to persist an empty refresh token");
  const tmp = `${path}.tmp`;
  await writeFile(tmp, token, { mode: 0o600 });
  await chmod(tmp, 0o600);
  try {
    await copyFile(path, `${path}.bak`);
    await chmod(`${path}.bak`, 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await rename(tmp, path);
}
