import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { persistRefreshToken } from "../refresh-persist.server";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("persistRefreshToken", () => {
  it("atomically replaces the token with 0600 and keeps a .bak", async () => {
    dir = await mkdtemp(join(tmpdir(), "wfm-refresh-"));
    const path = join(dir, "refresh_token.txt");
    await writeFile(path, "old-token", { mode: 0o600 });
    await persistRefreshToken(path, "new-token");
    expect(await readFile(path, "utf8")).toBe("new-token");
    expect(await readFile(`${path}.bak`, "utf8")).toBe("old-token");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(`${path}.bak`)).mode & 0o777).toBe(0o600);
    await expect(stat(`${path}.tmp`)).rejects.toThrow();
  });

  it("writes a fresh file without .bak when none exists", async () => {
    dir = await mkdtemp(join(tmpdir(), "wfm-refresh-"));
    const path = join(dir, "refresh_token.txt");
    await persistRefreshToken(path, "first");
    expect(await readFile(path, "utf8")).toBe("first");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await expect(stat(`${path}.bak`)).rejects.toThrow();
  });

  it("rejects empty tokens", async () => {
    await expect(persistRefreshToken("/nonexistent/x", "")).rejects.toThrow();
  });

  it("does not follow a pre-existing temporary symlink", async () => {
    dir = await mkdtemp(join(tmpdir(), "wfm-refresh-"));
    const path = join(dir, "refresh_token.txt");
    const unrelated = join(dir, "unrelated.txt");
    await writeFile(unrelated, "unrelated", { mode: 0o644 });
    await symlink(unrelated, `${path}.tmp`);
    await persistRefreshToken(path, "new-token");
    expect(await readFile(unrelated, "utf8")).toBe("unrelated");
    expect(await readFile(path, "utf8")).toBe("new-token");
    expect((await lstat(path)).isSymbolicLink()).toBe(false);
  });

  it("replaces a backup symlink without writing to its target", async () => {
    dir = await mkdtemp(join(tmpdir(), "wfm-refresh-"));
    const path = join(dir, "refresh_token.txt");
    const unrelated = join(dir, "unrelated.txt");
    await writeFile(path, "old-token", { mode: 0o600 });
    await writeFile(unrelated, "unrelated", { mode: 0o644 });
    await symlink(unrelated, `${path}.bak`);
    await persistRefreshToken(path, "new-token");
    expect(await readFile(unrelated, "utf8")).toBe("unrelated");
    expect((await lstat(`${path}.bak`)).isSymbolicLink()).toBe(false);
    expect(await readFile(`${path}.bak`, "utf8")).toBe("old-token");
    expect((await stat(`${path}.bak`)).mode & 0o777).toBe(0o600);
  });

  it("cleans staging files on failure and preserves the original token", async () => {
    dir = await mkdtemp(join(tmpdir(), "wfm-refresh-"));
    const path = join(dir, "refresh_token.txt");
    await writeFile(path, "old-token", { mode: 0o600 });
    await mkdir(`${path}.bak`);
    await expect(persistRefreshToken(path, "new-token")).rejects.toThrow(
      /^WFM refresh token persistence failed$/,
    );
    expect(await readFile(path, "utf8")).toBe("old-token");
    expect((await readdir(dir)).sort()).toEqual(["refresh_token.txt", "refresh_token.txt.bak"]);
  });
});
