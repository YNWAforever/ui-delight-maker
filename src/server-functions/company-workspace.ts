import { createServerFn } from "@tanstack/react-start";
import type { Capability } from "@/lib/admin/types";
import {
  loadRequestAuthorization,
  requireCapability,
  requireCapabilitySet,
  type RequestAuthorization,
} from "@/server/auth/authorization.server";
import {
  loadCompanyWorkspaceCore,
  loadCompanyWorkspaceRead,
  loadCompanyWorkspaceSection,
} from "@/server/company-workspace/loaders";
import type { CompanyWorkspaceSection } from "@/server/company-workspace/types";

type CompanyWorkspaceInput = { accountId: string };
type CompanyWorkspaceSectionInput = CompanyWorkspaceInput & {
  section: CompanyWorkspaceSection;
};
type CompanyWorkspaceReadInput = CompanyWorkspaceInput & {
  sections: CompanyWorkspaceSection[];
};

const companyWorkspaceSections = [
  "commercial",
  "delivery_finance",
  "activity",
  "intelligence",
] as const;

/**
 * The capabilities that own each section's data.
 *
 * `accounts.view` was the only gate on this workspace, so an actor allowed to see the account
 * could still read leads, quotes, engagements, tasks and job sheets whose own capabilities they
 * were denied. Each section now requires the capability of the table it loads, checked on the
 * same account target as the account read.
 */
const sectionCapabilities = {
  commercial: ["accounts.view", "leads.view", "quotes.view", "engagements.view"],
  delivery_finance: ["accounts.view", "tasks.view", "job_sheets.view"],
  activity: ["accounts.view", "engagements.view"],
  intelligence: ["accounts.view"],
} as const satisfies Record<CompanyWorkspaceSection, readonly Capability[]>;

const accountTarget = (accountId: string) => ({
  resourceType: "account",
  resourceId: accountId,
});

async function authorizeCompanySection(
  accountId: string,
  section: CompanyWorkspaceSection,
  context: RequestAuthorization,
) {
  await requireCapabilitySet(sectionCapabilities[section], {
    target: accountTarget(accountId),
    context,
  });
}

/**
 * The union of the capabilities every requested section requires, checked in one call.
 *
 * One call resolves the account target's ownership once instead of once per section, but the
 * union still gates *every* requested section: a read is refused unless the caller may load
 * each one. `accounts.view` is always present because the read also returns the account's core
 * record, so an empty section list still gate-keeps like `getAccount`.
 */
function requiredCapabilitiesForSections(
  sections: readonly CompanyWorkspaceSection[],
): Capability[] {
  const required = new Set<Capability>(["accounts.view"]);
  for (const section of sections) {
    for (const capability of sectionCapabilities[section]) required.add(capability);
  }
  return [...required];
}

function validateCompanyWorkspaceInput(data: unknown): CompanyWorkspaceInput {
  if (
    !data ||
    typeof data !== "object" ||
    typeof (data as { accountId?: unknown }).accountId !== "string" ||
    !(data as { accountId: string }).accountId.trim()
  ) {
    throw new Error("Company Workspace account ID is required");
  }
  return { accountId: (data as { accountId: string }).accountId.trim() };
}

function validateCompanyWorkspaceSectionInput(data: unknown): CompanyWorkspaceSectionInput {
  const input = validateCompanyWorkspaceInput(data);
  const section = (data as { section?: unknown }).section;
  if (!companyWorkspaceSections.includes(section as CompanyWorkspaceSection)) {
    throw new Error("Invalid Company Workspace section");
  }
  return { ...input, section: section as CompanyWorkspaceSection };
}

function validateCompanyWorkspaceReadInput(data: unknown): CompanyWorkspaceReadInput {
  const input = validateCompanyWorkspaceInput(data);
  const rawSections = (data as { sections?: unknown }).sections;
  const sections = rawSections === undefined ? [] : rawSections;
  if (!Array.isArray(sections)) throw new Error("Company Workspace sections must be an array");
  if (
    sections.some(
      (section) => !companyWorkspaceSections.includes(section as CompanyWorkspaceSection),
    )
  ) {
    throw new Error("Invalid Company Workspace section");
  }
  if (new Set(sections).size !== sections.length) {
    throw new Error("Company Workspace sections must be unique");
  }
  return { ...input, sections: sections as CompanyWorkspaceSection[] };
}

export const getCompanyWorkspaceRead = createServerFn({ method: "GET" })
  .validator(validateCompanyWorkspaceReadInput)
  .handler(async ({ data }) => {
    // This read returns core and overview for every caller, but each requested section loads a
    // different table. Gate the account itself and every requested section in one pass, before
    // any loader runs, so a denied capability cannot be bypassed by requesting that section.
    const context = await loadRequestAuthorization();
    await requireCapabilitySet(requiredCapabilitiesForSections(data.sections), {
      target: accountTarget(data.accountId),
      context,
    });
    return loadCompanyWorkspaceRead(data.accountId, data.sections, undefined, undefined, context);
  });

export const getCompanyWorkspaceCore = createServerFn({ method: "GET" })
  .validator(validateCompanyWorkspaceInput)
  .handler(async ({ data }) => {
    // The same guard `getAccount` applies to this account's data. A bare session check let this
    // path skip two things it enforces: an explicit permission-override deny, and the manager
    // scope check — so a manager barred from an account could still read it here, which is the
    // primary account screen. requireCapability loads the session itself, so no separate
    // session check is needed.
    await requireCapability("accounts.view", {
      resourceType: "account",
      resourceId: data.accountId,
    });
    return loadCompanyWorkspaceCore(data.accountId);
  });

export const getCompanyWorkspaceSection = createServerFn({ method: "GET" })
  .validator(validateCompanyWorkspaceSectionInput)
  .handler(async ({ data }) => {
    // Each independent section retry has to re-apply the account guard *and* the capability
    // that owns the section's data: otherwise a caller denied leads.view, quotes.view,
    // engagements.view, tasks.view or job_sheets.view could still read that table here.
    const context = await loadRequestAuthorization();
    await authorizeCompanySection(data.accountId, data.section, context);
    return loadCompanyWorkspaceSection(data.accountId, data.section, undefined, context);
  });
