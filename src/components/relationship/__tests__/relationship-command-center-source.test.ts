import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commandCenterSource = readFileSync(
  new URL("../relationship-command-center.tsx", import.meta.url),
  "utf8",
);
const signalCardSource = readFileSync(
  new URL("../relationship-signal-card.tsx", import.meta.url),
  "utf8",
);

describe("relationship command center dismiss interaction", () => {
  it("requires an operator-provided dismissal reason and guards repeated submits", () => {
    expect(commandCenterSource).toContain("pendingSignalIds");
    expect(commandCenterSource).toContain("dismissReasons");
    expect(commandCenterSource).toContain("reason.trim()");
    expect(commandCenterSource).toContain("isDismissing={pendingSignalIds.includes(signal.id)}");
    expect(signalCardSource).toContain("disabled={isDismissing}");
    expect(commandCenterSource).not.toContain("Bulk actions arrive after signal quality is proven");
  });

  it("keeps the dismissal controls inline and explicitly labeled", () => {
    expect(signalCardSource).toContain("Dismissal reason");
    expect(signalCardSource).toContain("Confirm dismiss");
    expect(signalCardSource).toContain("Cancel");
  });
});
