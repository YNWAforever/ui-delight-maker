import { chmod, copyFile, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Atomically persist a rotated WFM refresh token to `path` (mode 0600).
 * Stages both files in a private directory on the destination filesystem, then renames.
 * Never logs or returns the token value.
 */
export async function persistRefreshToken(path: string, token: string): Promise<void> {
  if (!token) throw new Error("Refusing to persist an empty refresh token");
  let staging: string | undefined;
  try {
    staging = await mkdtemp(join(dirname(path), ".wfm-refresh-"));
    const tmp = join(staging, "token");
    const backup = join(staging, "backup");
    await writeFile(tmp, token, { mode: 0o600, flag: "wx" });
    let hasBackup = true;
    try {
      await copyFile(path, backup);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      hasBackup = false;
    }
    // Only ENOENT from reading the old token is optional; backup failures must abort.
    if (hasBackup) {
      await chmod(backup, 0o600);
      await rename(backup, `${path}.bak`);
    }
    await rename(tmp, path);
  } catch {
    throw new Error("WFM refresh token persistence failed");
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}
