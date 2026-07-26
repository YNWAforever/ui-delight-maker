import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adminPeopleSearchSchema } from "@/lib/admin/schemas";

const peopleSource = readFileSync(new URL("../admin.people.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../admin.people.$id.tsx", import.meta.url), "utf8");

describe("admin people URL state", () => {
  it("falls back safely for invalid filters and keeps the selection contract", () => {
    const parsed = adminPeopleSearchSchema.parse({
      q: "  ada ",
      status: "unknown",
      role: "unknown",
      activity: "unknown",
      page: "invalid",
      user: "profile-1",
    });

    expect(parsed.q).toBe("ada");
    expect(parsed.status).toBeUndefined();
    expect(parsed.role).toBeUndefined();
    expect(parsed.activity).toBeUndefined();
    expect(parsed.page).toBe(1);
    expect(parsed.user).toBe("profile-1");
  });
});
