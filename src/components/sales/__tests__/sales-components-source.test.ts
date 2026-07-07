import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commandHeader = readFileSync(new URL("../command-header.tsx", import.meta.url), "utf8");
const contextPanel = readFileSync(new URL("../context-panel.tsx", import.meta.url), "utf8");
const emptyState = readFileSync(new URL("../work-surface-empty.tsx", import.meta.url), "utf8");

describe("sales UI primitives", () => {
  it("keeps command headers compact and action-oriented", () => {
    expect(commandHeader).toContain("CommandHeader");
    expect(commandHeader).toContain("status");
    expect(commandHeader).toContain("actions");
    expect(commandHeader).toContain("border-b");
    expect(commandHeader).toContain("<header");
  });

  it("ships a context panel with a mobile drawer label", () => {
    expect(contextPanel).toContain("SalesContextPanel");
    expect(contextPanel).toContain("aria-label");
    expect(contextPanel).toContain("Sheet");
    expect(contextPanel).toContain("SheetDescription");
    expect(contextPanel).toContain("lg:sticky");
  });

  it("keeps mobile context panels controlled as a prop pair", () => {
    expect(contextPanel).toContain("type SalesContextPanelProps");
    expect(contextPanel).toContain("ControlledSalesContextPanelProps");
    expect(contextPanel).toContain("UncontrolledSalesContextPanelProps");
    expect(contextPanel).toContain("mobileOpen: boolean");
    expect(contextPanel).toContain("onMobileOpenChange: (open: boolean) => void");
    expect(contextPanel).toContain("mobileOpen?: never");
    expect(contextPanel).toContain("onMobileOpenChange?: never");
  });

  it("keeps empty states sales-actionable", () => {
    expect(emptyState).toContain("WorkSurfaceEmpty");
    expect(emptyState).toContain("action");
    expect(emptyState).toContain("border-dashed");
  });
});
