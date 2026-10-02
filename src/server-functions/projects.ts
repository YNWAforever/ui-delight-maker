import { authorizeDomainLinks } from "@/server/auth/domain-links.server";
// src/server-functions/projects.ts
import { createServerFn } from "@tanstack/react-start";
import { requireCapability, loadRequestAuthorization } from "@/server/auth/authorization.server";
import { buildProjectFromWonDeal } from "@/lib/lifecycle-utils";
import {
  createProject as createProjectInRepository,
  getDealForProject,
  getProjectWorkspace,
  listProjects,
  updateProject as updateProjectInRepository,
  type CreateProjectInput,
  type ProjectFilters,
} from "@/server/repositories/projects";
import type { Project } from "@/lib/types";

export const getProjects = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as ProjectFilters)
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability("engagements.view", {}, context);
    return listProjects(data, context);
  });

export const getProject = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "engagements.view",
      { resourceType: "project", resourceId: data.id },
      context,
    );
    return getProjectWorkspace(data.id, context);
  });

export const createProject = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as CreateProjectInput)
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability("engagements.create", {}, context);
    await authorizeDomainLinks("engagements.create", data, context);
    return createProjectInRepository(data);
  });

export const updateProject = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Project> })
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "engagements.update",
      { resourceType: "project", resourceId: data.id },
      context,
    );
    await authorizeDomainLinks("engagements.update", data.updates, context);
    return updateProjectInRepository(data.id, data.updates);
  });

export const createProjectFromWonDeal = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { dealId: string })
  .handler(async ({ data }) => {
    const context = await loadRequestAuthorization();
    await requireCapability(
      "engagements.create",
      {
        resourceType: "deal",
        resourceId: data.dealId,
      },
      context,
    );
    // Read, decide, write — the decision stays here because it is a rule about the deal, not a
    // way of fetching one. `buildProjectFromWonDeal` returns null for any deal that is not won,
    // and that has to be a refusal rather than an empty insert.
    const projectDraft = buildProjectFromWonDeal(await getDealForProject(data.dealId));
    if (!projectDraft) {
      throw new Error("A project can only be created from a won deal.");
    }

    return createProjectInRepository(projectDraft);
  });
