import { describe, expect, it } from "vitest";

import { escapeLikePattern, MAX_LIKE_PATTERN_LENGTH } from "../sql-like";

describe("escapeLikePattern", () => {
  it("backslash-escapes the LIKE metacharacters and the escape character itself", () => {
    // Unescaped, `%` matches every row and `_` matches any one character, so a typed `%` would
    // turn a filtered list into a tenant-wide one.
    expect(escapeLikePattern("100%_x")).toBe("100\\%\\_x");
    expect(escapeLikePattern("back\\slash")).toBe("back\\\\slash");
  });

  it("leaves an ordinary search term unchanged", () => {
    expect(escapeLikePattern("Acme CRM")).toBe("Acme CRM");
  });

  it("trims the term", () => {
    expect(escapeLikePattern("  Acme  ")).toBe("Acme");
  });

  it("caps the term at the shared maximum length", () => {
    expect(MAX_LIKE_PATTERN_LENGTH).toBe(100);
    expect(escapeLikePattern("a".repeat(500))).toBe("a".repeat(MAX_LIKE_PATTERN_LENGTH));
    // The cap applies to the raw input, before escaping: a 100-character run of metacharacters
    // still escapes to a longer fragment, which is the bound the callers rely on.
    expect(escapeLikePattern("%".repeat(150))).toBe("\\%".repeat(MAX_LIKE_PATTERN_LENGTH));
  });

  it("accepts a tighter caller-supplied cap", () => {
    expect(escapeLikePattern("abcdef", 4)).toBe("abcd");
  });
});
