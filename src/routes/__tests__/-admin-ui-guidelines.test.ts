import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

const sources = {
  pageHeader: read("../../components/page-header.tsx"),
  globalSearch: read("../../components/global-search.tsx"),
  settings: read("../settings.tsx"),
  leads: read("../leads.tsx"),
  leadDetail: read("../leads.$id.tsx"),
  clients: read("../clients.tsx"),
  clientDetail: read("../clients.$id.tsx"),
  quotes: read("../quotes.$id.tsx"),
  newQuote: read("../quotes.new.tsx"),
  agents: read("../agents.tsx"),
  stageMoveDialog: read("../../components/pipeline/stage-move-dialog.tsx"),
  format: read("../../lib/format.ts"),
  tabs: read("../../components/ui/tabs.tsx"),
  accordion: read("../../components/ui/accordion.tsx"),
  progress: read("../../components/ui/progress.tsx"),
  sheet: read("../../components/ui/sheet.tsx"),
  styles: read("../../styles.css"),
};

describe("admin UI guideline regressions", () => {
  it("keeps dense admin layouts resilient to long copy and narrow screens", () => {
    expect(sources.pageHeader).toContain("min-w-0");
    expect(sources.pageHeader).toContain("flex-wrap");
    expect(sources.pageHeader).toContain("break-words");

    for (const source of [
      sources.settings,
      sources.leadDetail,
      sources.clientDetail,
      sources.quotes,
    ]) {
      expect(source).toContain("overflow-x-auto");
      expect(source).toContain('className="w-max"');
    }

    expect(sources.leads).toContain('Table className="min-w-');
    expect(sources.clients).toContain('Table className="min-w-');
    expect(sources.agents).toContain('Table className="min-w-');
  });

  it("keeps repeated admin controls structurally accessible", () => {
    expect(sources.globalSearch).toContain('aria-hidden="true"');
    expect(sources.globalSearch).toContain('aria-label="Search workspace"');
    expect(sources.globalSearch).toContain('name="global-search"');
    expect(sources.globalSearch).toContain('autoComplete="off"');

    expect(sources.settings).toContain(
      'aria-label={k.revealed ? "Hide API key" : "Reveal API key"}',
    );
    expect(sources.settings).toContain('aria-label="Copy API key"');
    expect(sources.settings).toContain('type="email"');
    expect(sources.settings).toContain("spellCheck={false}");

    for (const source of [sources.leads, sources.clientDetail, sources.newQuote]) {
      expect(source).toContain("htmlFor=");
      expect(source).toContain("name=");
    }
  });

  it("uses shared Intl formatters instead of ad hoc locale formatting", () => {
    expect(sources.format).toContain("new Intl.NumberFormat");

    for (const source of [
      sources.leads,
      sources.leadDetail,
      sources.clients,
      sources.clientDetail,
      sources.quotes,
      sources.newQuote,
      sources.agents,
    ]) {
      expect(source).not.toContain(".toLocaleString(");
    }
  });

  it("avoids broad transitions and keeps motion/touch behavior intentional", () => {
    for (const source of [
      sources.tabs,
      sources.accordion,
      sources.progress,
      sources.agents,
      sources.sheet,
    ]) {
      expect(source).not.toContain("transition-all");
    }

    expect(sources.sheet).toContain("motion-reduce:");
    expect(sources.sheet).toContain("overscroll-contain");
    expect(sources.styles).toContain("color-scheme");
    expect(sources.styles).toContain("touch-action: manipulation");
    expect(sources.styles).toContain("prefers-reduced-motion");
    expect(sources.stageMoveDialog).toContain("follow-up…");
  });
});
