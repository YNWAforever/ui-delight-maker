// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { StatusBadge } from "../status-badge";

afterEach(() => cleanup());

describe("StatusBadge", () => {
  it("renders an unknown label when a legacy status is missing", () => {
    expect(() => render(<StatusBadge value={null} />)).not.toThrow();
    expect(screen.getByText("Unknown")).not.toBeNull();
  });
});
