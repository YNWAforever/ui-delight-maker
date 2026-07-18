// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getInvitationPreviewMock, acceptUserInvitationMock, redirectMock } = vi.hoisted(() => ({
  getInvitationPreviewMock: vi.fn(),
  acceptUserInvitationMock: vi.fn(),
  redirectMock: vi.fn((options: unknown) => ({ ...(options as object), isRedirect: true })),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (options: object) => ({
    path,
    options,
    useLoaderData: vi.fn(),
    useParams: vi.fn(),
  }),
  Link: () => null,
  redirect: redirectMock,
}));

vi.mock("@/server-functions/admin-invitations", () => ({
  getInvitationPreview: getInvitationPreviewMock,
  acceptUserInvitation: acceptUserInvitationMock,
}));

import { Route as InvitationRoute } from "../invite.$token";
import { Route as InvitationCompletionRoute } from "../invite.$token.complete";

describe("invitation activation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInvitationPreviewMock.mockResolvedValue({
      email: "person@example.com",
      intendedRole: "sales",
      expiresAt: "2026-07-23T00:00:00.000Z",
      status: "pending",
    });
    acceptUserInvitationMock.mockResolvedValue({
      id: "profile-1",
      status: "active",
    });
  });

  it("loads a safe preview and converts invalid tokens into a non-sensitive state", async () => {
    const loader = InvitationRoute.options.loader as unknown as (context: {
      params: { token: string };
    }) => Promise<unknown>;

    await expect(loader({ params: { token: "raw-token" } })).resolves.toEqual({
      state: "ready",
      preview: {
        email: "person@example.com",
        intendedRole: "sales",
        expiresAt: "2026-07-23T00:00:00.000Z",
        status: "pending",
      },
    });

    getInvitationPreviewMock.mockRejectedValueOnce(new Error("database detail"));
    await expect(loader({ params: { token: "bad-token" } })).resolves.toEqual({
      state: "unavailable",
    });
  });

  it("accepts the invitation and redirects to the welcome account view", async () => {
    const loader = InvitationCompletionRoute.options.loader as unknown as (context: {
      params: { token: string };
    }) => Promise<unknown>;

    await expect(loader({ params: { token: "raw-token" } })).rejects.toMatchObject({
      href: "/account?welcome=1",
      isRedirect: true,
    });
    expect(acceptUserInvitationMock).toHaveBeenCalledWith({ data: { token: "raw-token" } });
  });

  it("renders clear unavailable and activation failure copy", () => {
    const previewSource = readFileSync(
      resolve(process.cwd(), "src/routes/invite.$token.tsx"),
      "utf8",
    );
    const completionSource = readFileSync(
      resolve(process.cwd(), "src/routes/invite.$token.complete.tsx"),
      "utf8",
    );

    expect(previewSource).toContain("Invitation unavailable");
    expect(previewSource).toContain("invalid, expired, revoked, or already used");
    expect(completionSource).toContain("We could not activate this invitation");
  });
});
