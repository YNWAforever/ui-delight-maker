import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminError } from "@/lib/admin/errors";
import { adminUserDetailSearchSchema } from "@/lib/admin/schemas";
import { crmQueryKeys } from "@/lib/query-keys";
import { routeQueryOptions } from "@/lib/route-query";
import { getAdminUserFn } from "@/server-functions/admin-users";
import { formatDateTime } from "@/lib/format";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserDetailPanel } from "@/components/admin/user-detail-panel";

const adminUserQuery = (profileId: string) =>
  routeQueryOptions({
    queryKey: crmQueryKeys.admin.detail(profileId),
    queryFn: () => getAdminUserFn({ data: { profileId } }),
  });
export const Route = createFileRoute("/admin/people/$id")({
  validateSearch: adminUserDetailSearchSchema,
  loader: async ({ context, params }) => {
    try {
      return {
        user: await context.queryClient.ensureQueryData(adminUserQuery(params.id)),
        forbidden: false,
      };
    } catch (error) {
      if (error instanceof AdminError && ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)) {
        return { user: null, forbidden: true };
      }
      throw error;
    }
  },
  head: () => ({ meta: [{ title: "User record · People · Fimmick ClientOps" }] }),
  component: AdminUserRoute,
});

function AdminUserRoute() {
  const search = Route.useSearch();
  const params = Route.useParams();
  const loaderData = Route.useLoaderData();
  const { data: userData } = useQuery({
    ...adminUserQuery(params.id),
    initialData: loaderData.user ?? undefined,
    enabled: !loaderData.forbidden,
  });
  const user = userData ?? null;
  const forbidden = loaderData.forbidden;
  const navigate = useNavigate({ from: Route.fullPath });

  if (forbidden) {
    return (
      <div
        role="alert"
        className="m-6 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-5 text-sm text-destructive"
      >
        This user record is outside your access scope.
      </div>
    );
  }
  if (!user) {
    return (
      <div
        role="status"
        className="m-6 rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground"
      >
        User record not found.
      </div>
    );
  }

  const name = user.name || user.email || "Unnamed user";
  return (
    <div className="min-w-0">
      <div className="border-b border-border px-4 py-5 md:px-6">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          People / {name}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{user.email || "No email"}</p>
      </div>
      <div className="px-4 py-4 md:px-6">
        <Tabs
          value={search.tab ?? "profile"}
          onValueChange={(tab) =>
            navigate({
              search: (current) => ({
                ...current,
                tab: tab === "profile" ? undefined : (tab as NonNullable<typeof search.tab>),
              }),
              replace: true,
            })
          }
        >
          <div className="max-w-full overflow-x-auto pb-1">
            <TabsList className="w-max">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="access">Access</TabsTrigger>
              <TabsTrigger value="teams">Teams</TabsTrigger>
              <TabsTrigger value="work">Work</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="profile" className="mt-4">
            <UserDetailPanel user={user} />
          </TabsContent>
          <TabsContent value="access" className="mt-4">
            <section className="rounded-md border border-border px-4 py-5">
              <h2 className="text-sm font-semibold text-foreground">Effective access</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Role grants and scoped overrides are evaluated server-side for every protected
                action.
              </p>
              <p className="mt-4 text-sm font-medium capitalize text-foreground">
                Base role: {user.role.replace("_", " ")}
              </p>
            </section>
          </TabsContent>
          <TabsContent value="teams" className="mt-4">
            <section className="rounded-md border border-border px-4 py-5">
              <h2 className="text-sm font-semibold text-foreground">Current teams</h2>
              {user.teams && user.teams.length > 0 ? (
                <ul className="mt-3 divide-y divide-border">
                  {user.teams.map((team) => (
                    <li
                      key={team.teamId}
                      className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                    >
                      <span className="font-medium text-foreground">{team.teamName}</span>
                      <span className="capitalize text-muted-foreground">
                        {team.membershipRole}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No active team memberships.</p>
              )}
            </section>
          </TabsContent>
          <TabsContent value="work" className="mt-4">
            <section className="rounded-md border border-border px-4 py-5">
              <h2 className="text-sm font-semibold text-foreground">Assigned workload</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(user.workload ?? {}).map(([key, value]) => (
                  <div key={key} className="rounded-md bg-muted/30 px-3 py-3">
                    <p className="text-xs capitalize text-muted-foreground">
                      {key.replace(/([A-Z])/g, " $1")}
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </TabsContent>
          <TabsContent value="security" className="mt-4">
            <section className="rounded-md border border-border px-4 py-5">
              <h2 className="text-sm font-semibold text-foreground">Security state</h2>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Account status</dt>
                  <dd className="mt-1 text-sm capitalize text-foreground">{user.status}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Session invalidated before</dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {user.sessionInvalidBefore
                      ? formatDateTime(user.sessionInvalidBefore)
                      : "No session revocation recorded"}
                  </dd>
                </div>
              </dl>
            </section>
          </TabsContent>
          <TabsContent value="activity" className="mt-4">
            <section className="rounded-md border border-border px-4 py-5">
              <h2 className="text-sm font-semibold text-foreground">Activity</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Last active:{" "}
                {user.lastActiveAt ? formatDateTime(user.lastActiveAt) : "Never active"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Created: {formatDateTime(user.createdAt)}
              </p>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
