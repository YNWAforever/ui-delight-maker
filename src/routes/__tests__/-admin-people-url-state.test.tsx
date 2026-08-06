import { describe, expect, it } from "vitest";
import { adminPeopleSearchSchema } from "@/lib/admin/schemas";
import { Route as AdminPeopleRoute } from "@/routes/admin.people";

describe("admin people URL state", () => {
  /**
   * The route has to parse its search params through the shared schema, not a local copy.
   *
   * This file used to read admin.people.tsx and admin.people.$id.tsx into two variables and
   * never assert on either: the fallback test below exercised the schema directly, so a route
   * that swapped in its own inline zod object — losing `page: "invalid" -> 1` and the rest —
   * kept passing. Asserting the route's own `validateSearch` closes that.
   */
  it("parses its URL state with the shared schema", () => {
    expect(AdminPeopleRoute.options.validateSearch).toBe(adminPeopleSearchSchema);
  });

  it("applies the route's own validateSearch to invalid filters", () => {
    const validateSearch = AdminPeopleRoute.options
      .validateSearch as typeof adminPeopleSearchSchema;

    expect(validateSearch.parse({ page: "invalid", status: "unknown", user: "profile-1" })).toEqual(
      expect.objectContaining({ page: 1, status: undefined, user: "profile-1" }),
    );
  });

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
