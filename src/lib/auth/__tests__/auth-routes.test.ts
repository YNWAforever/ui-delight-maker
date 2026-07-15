import { describe, expect, it } from "vitest";
import { getLoginAuthPath, isPublicAuthPath } from "@/lib/auth/auth-routes";

describe("auth route visibility", () => {
  it("keeps login auth flows public", () => {
    expect(isPublicAuthPath("/login")).toBe(true);
    expect(isPublicAuthPath("/login/sign-up")).toBe(true);
    expect(isPublicAuthPath("/login/sign-in")).toBe(true);
    expect(isPublicAuthPath("/invite/raw-token")).toBe(true);
    expect(isPublicAuthPath("/invite/raw-token/complete")).toBe(true);
  });

  it("does not treat login-looking app paths as public auth routes", () => {
    expect(isPublicAuthPath("/login-help")).toBe(false);
    expect(isPublicAuthPath("/loginish/sign-up")).toBe(false);
  });

  it("derives the requested Neon auth view from nested login paths", () => {
    expect(getLoginAuthPath("/login")).toBe("sign-in");
    expect(getLoginAuthPath("/login/sign-up")).toBe("sign-up");
  });
});
