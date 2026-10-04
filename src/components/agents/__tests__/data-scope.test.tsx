import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentDataScope, DemoOriginLabel } from "../data-scope";

describe("AI origin presentation", () => {
  it("keeps unknown provenance separate and labels the statistics basis", () => {
    expect(renderToStaticMarkup(<DemoOriginLabel value={undefined} />)).toContain("Origin unknown");
    expect(renderToStaticMarkup(<DemoOriginLabel value={true} />)).toContain(">Demo<");
    const html = renderToStaticMarkup(<AgentDataScope value="all" onChange={() => {}} />);
    expect(html).toContain("含示範資料");
    expect(html).toContain("Unknown origin");
    expect(html).toContain("Confirmed non-demo");
    expect(html).toContain("Data origin");
  });
});
