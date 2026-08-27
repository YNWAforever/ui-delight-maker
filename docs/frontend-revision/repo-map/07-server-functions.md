## Server function catalogue — `src/server-functions/*.ts`

184 exported server functions across 40 files (plus 2 re-export aliases). Every row below comes from the file named in it.

| Export name | File | Method | Input schema (validator + key fields) | Capability check (exact call) | Returns (shape summary) | Calls (repository / read-model) |
|---|---|---|---|---|---|---|
| `getMyAccount` | account.ts | GET | none (no `.validator`) | none — `requireNeonAuthSession()` only | `{...adminUser, profile:{id,email,name,role,status,avatar_url,job_title,phone,locale,timezone,primary_department_id,manager_profile_id,last_active_at,session_invalid_before,suspended_*:null,deactivated_*:null,availability_status,leave_starts_at,leave_ends_at,created_at}, delegations, accessRequests}`; throws `AdminError("CONFLICT")` if no profile | `getAdminUser`, `listMyDelegations`, `listMyAccessRequests` |
| `updateMyProfile` | account.ts | POST | zod `profileUpdateSchema.parse` — `.strict()`: `name`,`job_title`,`phone`,`avatar_url`(url),`locale`,`timezone` (Intl-validated) | none — `requireNeonAuthSession()` | `{ ok: true }` | `updateMyProfile` (repositories/account) |
| `updateMyAvailability` | account.ts | POST | zod `availabilitySchema.parse` — `.strict()`: `availability_status` enum `available\|limited\|away`, `leave_starts_at`,`leave_ends_at` ISO datetime; superRefine: both-or-neither, end > start | none — `requireNeonAuthSession()` | `{ ok: true }` | `updateMyAvailability` (repositories/account) |
| `revokeMyAppSessions` | account.ts | POST | zod `revokeSessionsSchema.parse(data ?? {})` — `z.object({}).strict()` | none — `requireNeonAuthSession()` | `{ ok: true }` | `setSessionInvalidBefore` (admin-users) |
| `createMyDelegation` | account.ts | POST | zod `delegationSchema.parse` — `.strict()`: `delegateProfileId`,`startsAt`,`endsAt` (ISO datetime, end > start),`reason` (`nonEmptyReasonSchema`) | none — `requireNeonAuthSession()`; rejects self-delegation + inactive delegate via `AdminError` | `createWorkDelegation` row | `getAdminUser`, `createWorkDelegation` (admin-access) |
| `cancelMyDelegation` | account.ts | POST | zod `cancelDelegationSchema.parse` — `{id}` `.strict()` | none — `requireNeonAuthSession()` | `{ ok: true }` | `cancelMyDelegation` (repositories/account) |
| `createMyAccessRequest` | account.ts | POST | zod `accessRequestSchema.parse` (shared, `@/lib/admin/schemas`) | none — `requireNeonAuthSession()` | `createAccessRequest` row | `createAccessRequest` (admin-access) |
| `getMyWorkload` | account.ts | GET | none | none — `requireNeonAuthSession()` | `getUserWorkload` result | `getUserWorkload` (admin-users) |
| `getAccountsIndex` | accounts-index.ts | GET | cast `(data ?? {}) as AccountPageFilters` | `requireCapability("accounts.view")` | `getAccountsIndexReadModel(session.profile.id, data)` | `getAccountsIndexReadModel` (read-models/accounts-index) |
| `getAccountsIndexRead` | accounts-index.ts | GET | — | — | alias: `export const getAccountsIndexRead = getAccountsIndex` | — |
| `getAccounts` | accounts.ts | GET | cast `(data ?? {}) as AccountFilters` | `requireCapability("accounts.view")` | `Account[]` from `listAccounts` | `listAccounts` |
| `getAccountsPage` | accounts.ts | GET | cast `(data ?? {}) as AccountPageFilters` | `requireCapability("accounts.view")` | `listAccountsPage` page | `listAccountsPage` |
| `getAccount` | accounts.ts | GET | cast `{ id: string }` | `requireCapability("accounts.view", { resourceType: "account", resourceId: data.id })` | `getAccount` row | `getAccount` (accounts) |
| `getAccountWorkspace` | accounts.ts | GET | cast `{ id: string }` | `requireCapability("accounts.view", { resourceType: "account", resourceId: data.id })` | `getAccountWorkspaceData` result | `getAccountWorkspaceData` |
| `createAccount` | accounts.ts | POST | cast `CreateAccountInput` | `requireCapability("accounts.create")` | created `Account` | `createAccount` |
| `updateAccount` | accounts.ts | POST | cast `{ id: string; updates: Partial<Account> }` | `requireCapability("accounts.update", { resourceType: "account", resourceId: data.id })` | updated `Account` | `updateAccount` |
| `triggerRelationshipIntelligence` | accounts.ts | POST | cast `{ accountId: string }` | `requireCapability("agents.run", { resourceType: "account", resourceId: data.accountId })` | `{triggered:false, run, reason:"already_running"}` \| `{triggered:false, reason:"missing_webhook"}` \| `{triggered:true, run}` (serialized) | `findActiveRun`, `createAgentRun`, `updateAgentRunResult`, `triggerN8n`, `serializeAgentRun` |
| `getAdminOverridesFn` | admin-access.ts | GET | zod `profileSchema.parse` — `{profileId, includeHistory?}` | `requireCapability("permissions.view", { profileId: input.profileId })` | override list (history or active) | `listPermissionOverrideHistory` \| `listActiveOverrides` |
| `getAdminAccessRequestsFn` | admin-access.ts | GET | zod `accessRequestListSchema.parse(data ?? {})` — `{status?: pending\|approved\|rejected\|cancelled\|all}` | `requireCapability("access_requests.decide")` | access-request list | `listAccessRequests` |
| `createAdminPermissionOverrideFn` | admin-access.ts | POST | zod `permissionOverrideSchema.parse` (shared) | `requireCapability("permissions.override", { profileId, ...(departmentId), ...(teamId) })` | created override | `createPermissionOverride` |
| `revokeAdminPermissionOverrideFn` | admin-access.ts | POST | zod `z.object({ id: idSchema }).parse` | `requireCapability("permissions.override")` | revoked override | `revokePermissionOverride` |
| `createAdminAccessRequestFn` | admin-access.ts | POST | zod `accessRequestSchema.parse` | **none** — `requireNeonAuthSession()` only | created access request | `createAccessRequest` |
| `decideAdminAccessRequestFn` | admin-access.ts | POST | zod `decisionSchema.parse` — `{id, decision: approved\|rejected, reason, accessExpiresAt?}` | `requireCapability("access_requests.decide", request.requestType==="team" && request.teamId ? { teamId } : {})` + `assertDeciderCanGrant` → `requireCapability(request.capability)` | decision row; throws `AdminError` for self-decision, manager+capability, non-requestable capability | `getAccessRequest`, `decideAccessRequest` |
| `createAdminWorkDelegationFn` | admin-access.ts | POST | zod `delegationSchema.parse` (shared) | `requireCapability("users.manage", { profileId: input.delegatorProfileId, role: await getProfileRole(...) })` | created delegation | `getProfileRole`, `createWorkDelegation` |
| `cancelAdminWorkDelegationFn` | admin-access.ts | POST | zod `z.object({ id: idSchema }).parse` | `requireCapability("users.manage")` | cancelled delegation | `cancelWorkDelegation` |
| `getAdminAuditLogsFn` | admin-access.ts | GET | zod `auditSchema.parse(data ?? {})` — `actorProfileId?,targetType?,targetId?,action?,severity?,from?,to?,page?,limit?` | `requireCapability("audit.view")` | `{items, ...}` paged audit logs | `listAdminAuditLogs` |
| `getAdminAuditSummaryFn` | admin-access.ts | GET | zod `auditSchema.pick({limit:true}).parse(data ?? {})` | `requireCapability("audit.view")` **inside try/catch** — returns `[]` on `FORBIDDEN`/`OUTSIDE_SCOPE` | audit log `items` array (default limit 5), or `[]` | `listAdminAuditLogs` |
| `exportAdminAuditLogsFn` | admin-access.ts | GET | zod `auditSchema.parse(data ?? {})` | `requireCapability("audit.export")` | paged audit logs | `listAdminAuditLogs` |
| `inviteUsers` | admin-invitations.ts | POST | zod `inviteBatchSchema.parse` — `{invitations: invitationInputSchema[] min 1 max 100}` | `requireCapability("users.invite")`; for managers also `requireInvitationTargets` → `requireCapability("users.invite", {role, departmentId, ownerProfileId, teamId})` per team | `Array<{invitation, inviteUrl, delivery}>` | `createInvitation`, `dispatchInvitationEmail` |
| `getInvitationPreview` | admin-invitations.ts | GET | zod `tokenSchema.parse` — `{token: 16–512 chars}` | **none** (no capability, no session — public token preview) | invitation preview | `getInvitationPreview` (admin-invitations repo) |
| `acceptUserInvitation` | admin-invitations.ts | POST | zod `tokenSchema.parse` | **none** — `requireNeonAuthIdentity()` only | `acceptInvitation` result | `acceptInvitation` |
| `resendUserInvitation` | admin-invitations.ts | POST | zod `invitationIdSchema.parse` — `{invitationId}` | via `authorizeStoredInvitation` → `requireCapability("users.invite")` + `requireInvitationTargets(invitation)` | `{invitation, inviteUrl, delivery}` | `getInvitationById`, `resendInvitation`, `dispatchInvitationEmail` |
| `revokeUserInvitation` | admin-invitations.ts | POST | zod `invitationIdSchema.parse` | via `authorizeStoredInvitation` (same as above) | revoked invitation | `getInvitationById`, `revokeInvitation` |
| `getAdminOrganizationFn` | admin-teams.ts | GET | none | `requireCapability("teams.view")` | departments + teams list | `listDepartmentsAndTeams` |
| `getAdminOrganizationUnitFn` | admin-teams.ts | GET | zod `unitDetailSchema.parse` — `{kind: department\|team, id}` | `requireCapability("teams.view", input.kind==="team" ? {teamId:id} : {departmentId:id})` | organization unit detail | `getOrganizationUnit` |
| `createDepartmentFn` | admin-teams.ts | POST | zod `unitSchema.parse` — `{name, description?, purpose?, headProfileId?, deputyProfileId?, leadProfileId?, defaultOwnerProfileId?, status?}` | `requireCapability("departments.manage")` | created department | `createDepartment` |
| `updateDepartmentFn` | admin-teams.ts | POST | zod `updateUnitSchema.parse` — `{id, input: unitSchema}` | `requireCapability("departments.manage", { departmentId: input.id })` | updated department | `updateDepartment` |
| `createTeamFn` | admin-teams.ts | POST | zod `unitSchema.parse` | `requireCapability("teams.manage")` | created team | `createTeam` |
| `updateTeamFn` | admin-teams.ts | POST | zod `updateUnitSchema.parse` | `requireCapability("teams.manage", { teamId: input.id })` | updated team | `updateTeam` |
| `upsertAdminTeamMembershipFn` | admin-teams.ts | POST | zod `teamMembershipSchema.parse` (shared) | `requireCapability("teams.manage", { teamId, profileId })` | upserted membership | `upsertTeamMembership` |
| `endAdminTeamMembershipFn` | admin-teams.ts | POST | zod `endMembershipSchema.parse` — `{teamId, profileId, endedAt: ISO datetime}` | `requireCapability("teams.manage", { teamId, profileId })` | ended membership | `endTeamMembership` |
| `getAdminNavigationFn` | admin-users.ts | GET | none | `requireAnyCapability(["users.view","teams.view","permissions.view","audit.view"])` then per-item `requireCapability(item.capability)` in try/catch | `AdminNavigationItem[]` (`overview\|people\|teams\|access\|audit`, each `{key,label,capability,href}`), filtered | none (in-file constant list) |
| `getAdminOverviewFn` | admin-users.ts | GET | none | `requireAnyCapability(adminNavigationCapabilities)` | `getAdminOverview` result | `getAdminOverview` |
| `getAdminUsersFn` | admin-users.ts | GET | zod `listUsersSchema.parse(data ?? {})` — `search?,role?,status?,departmentId?,teamId?,page?,limit?` | `requireCapability("users.view")` | paged admin users | `listAdminUsers` |
| `getAdminUserFn` | admin-users.ts | GET | zod `targetSchema.parse` — `{profileId}` | `requireCapability("users.view", { profileId })` | admin user or undefined/null | `getAdminUser` |
| `updateAdminUserFn` | admin-users.ts | POST | zod `profileUpdateSchema.parse` — `{profileId, changes:{name?,jobTitle?,phone?,locale?,timezone?,primaryDepartmentId?,managerProfileId?}}` | `requireCapability("users.manage", await profileTarget(profileId))` (target = `{profileId, role}`) | updated profile | `getProfileRole`, `updateAdminProfile` |
| `changeAdminUserRoleFn` | admin-users.ts | POST | zod `roleChangeSchema.parse` — `{profileId, role, reason}` | `requireCapability("users.manage", await profileTarget(profileId))` + `assertCanAssignRole` | role-change result | `getProfileRole`, `changeUserRole` |
| `suspendAdminUserFn` | admin-users.ts | POST | zod `lifecycleSchema.parse` — `{profileId, reason}` | via `setLifecycle` → `requireCapability("users.suspend", await profileTarget(profileId))` | `setUserStatus` result | `getProfileRole`, `setUserStatus` |
| `reactivateAdminUserFn` | admin-users.ts | POST | zod `lifecycleSchema.parse` | via `setLifecycle` → `requireCapability("users.manage", await profileTarget(profileId))` | `setUserStatus` result | `getProfileRole`, `setUserStatus` |
| `getAdminReassignmentInventoryFn` | admin-users.ts | GET | zod `targetSchema.parse` — `{profileId}` | `requireCapability("users.deactivate", { profileId })` | `ReassignmentInventory` `{profileId, buckets[], totalCount}` | `getReassignmentInventory` |
| `deactivateAdminUserWithReassignmentFn` | admin-users.ts | POST | zod `reassignmentLifecycleSchema.parse` — `{profileId, reason, reviewedInventory, successors: Record<string,string>}` | `requireCapability("users.deactivate", { profileId })` | deactivation result | `deactivateUserWithReassignment` |
| `revokeAdminUserSessionsFn` | admin-users.ts | POST | zod `targetSchema.parse` | `requireCapability("sessions.revoke", { profileId })` | `{ ok: true }` | `setSessionInvalidBefore` |
| `getAgentDirectoryRead` | agent-runs.ts | GET | none | `requireCapability("agents.view")` | `AgentDirectoryRead` | `loadAgentDirectoryRead` (read-models/agent-workspaces) |
| `getAgentHistoryPage` | agent-runs.ts | GET | custom `normalizeAgentHistoryInput` — `{agent (required, non-empty), page (int>0, default 1), limit (int>0, capped at 25)}` | `requireCapability("agents.view")` | `AgentHistoryPageRead` | `loadAgentHistoryPage` |
| `getAiReviewRead` | agent-runs.ts | GET | none | `requireCapabilityChecks([{capability:"approvals.view"},{capability:"agents.view"}])` | `AiReviewRead` | `loadAiReviewRead` |
| `tidyTouchpointNote` | ai-note-tidy.ts | POST | cast `{ notes: string }` | `requireCapability("engagements.update")` + `requireNeonAuthSession()` | `{ tidied: string }`; throws on missing `OPENROUTER_API_KEY`, non-OK response, empty content | none — external `fetch` to openrouter.ai |
| `isAiNoteTidyAvailable` | ai-note-tidy.ts | GET | none | `requireCapability("agents.view")` + `requireNeonAuthSession()` | `{ available: boolean }` | none |
| `getAppShellRead` | app-shell.ts | GET | none | **none directly** — delegates to `getSession`, `getWorkspacePreferences`, `getAdminNavigationFn` (the last does `requireAnyCapability`) | `loadAuthenticatedShell` result | `loadAuthenticatedShell` (server/app-shell/loaders) |
| `getApprovals` | approvals.ts | GET | cast `(data ?? {}) as { status?: string }` | `requireCapability("approvals.view")` + `requireNeonAuthSession()` | `serializeHumanApproval[]` | `listApprovals` |
| `decideApproval` | approvals.ts | POST | cast `{ id, decision: "approved"\|"rejected"\|"escalated", notes? }` | `requireCapability("approvals.decide", { resourceType: "human_approval", resourceId: data.id })` | serialized `HumanApproval` | `decideApproval` (approvals), `applyRiskReviewDecision` (workflows) |
| `getSession` | auth.ts | GET | none | **none** | `AppSession \| null` | `getNeonAuthSession` |
| `signIn` | auth.ts | POST | cast `{ email: string; password: string }` | **none** | `undefined` on success; forwards `set-cookie`; throws with parsed error text | none — `fetch` to Neon Auth `/sign-in/email` |
| `signOut` | auth.ts | POST | none | **none** | `{ ok: true }`; forwards `set-cookie` | none — `fetch` to Neon Auth `/sign-out` |
| `getAutomationPlaybooks` | automation-playbooks.ts | GET | cast `(data ?? {}) as AutomationPlaybookFilters` | `requireCapability("automation.manage")` | `serializeAutomationPlaybook[]` | `listAutomationPlaybooks` |
| `getAutomationPlaybook` | automation-playbooks.ts | GET | cast `{ id: string }` | `requireCapability("automation.manage", { resourceType: "automation_playbook", resourceId: data.id })` | `{ playbook, runs[] }` (both serialized) | `getAutomationPlaybookDetail` |
| `createAutomationPlaybook` | automation-playbooks.ts | POST | cast `CreateAutomationPlaybookInput` | `requireCapability("automation.manage")` | serialized playbook | `createAutomationPlaybook` |
| `updateAutomationPlaybook` | automation-playbooks.ts | POST | cast `{ id; updates: Partial<AutomationPlaybook> }` | `requireCapability("automation.manage", { resourceType: "automation_playbook", resourceId: data.id })` | serialized playbook | `updateAutomationPlaybook` |
| `createAutomationRun` | automation-playbooks.ts | POST | cast `CreateAutomationRunInput` | `requireCapability("automation.manage", playbook_id ? {resourceType:"automation_playbook",resourceId} : account_id ? {resourceType:"supabase_account",resourceId} : {})` | serialized `AutomationRun` | `createAutomationRun` |
| `updateAutomationRun` | automation-playbooks.ts | POST | cast `{ id; updates: Partial<AutomationRun> }` | `requireCapability("automation.manage", { resourceType: "automation_run", resourceId: data.id })` | serialized `AutomationRun` | `updateAutomationRun` |
| `getCampaigns` | campaigns.ts | GET | cast `(data ?? {}) as CampaignFilters` | `requireCapability("campaigns.view")` + `requireNeonAuthSession()` | `Campaign[]` | `listCampaigns` |
| `getCampaignsPage` | campaigns.ts | GET | cast `(data ?? {}) as CampaignPageFilters` | `requireCapability("campaigns.view")` + session | paged campaigns | `listCampaignsPage` |
| `getCampaign` | campaigns.ts | GET | cast `{ id: string }` | `requireCapability("campaigns.view", { resourceType: "campaign", resourceId: data.id })` + session | campaign + members | `getCampaignWithMembers` |
| `createCampaign` | campaigns.ts | POST | cast `CreateCampaignInput` | `requireCapability("campaigns.manage")` | created `Campaign` (owner = session profile id) | `createCampaign` |
| `updateCampaign` | campaigns.ts | POST | cast `{ id; updates: Partial<Campaign> }` | `requireCapability("campaigns.manage", { resourceType: "campaign", resourceId: data.id })` | updated `Campaign` | `updateCampaign` |
| `addCampaignMember` | campaigns.ts | POST | cast `CreateCampaignMemberInput` | `requireCapability("campaigns.manage", { resourceType: "campaign", resourceId: data.campaign_id })` | created member | `createCampaignMember` |
| `createCampaignFollowUpTasksFn` | campaigns.ts | POST | cast `{ campaignId: string }` | `requireCapability("tasks.create", { resourceType: "campaign", resourceId: data.campaignId })` | `createCampaignFollowUpTasks` result | `createCampaignFollowUpTasks` |
| `getClientContacts` | client-contacts.ts | GET | cast `{ clientId: string }` | `requireCapability("contacts.view", { resourceType: "client", resourceId: data.clientId })` + session | `ClientContact[]` | `listClientContacts` |
| `createClientContact` | client-contacts.ts | POST | cast `Pick<ClientContact,"client_id"\|"name"> & Partial<Pick<..,"title"\|"email"\|"phone"\|"is_primary">>` | `requireCapability("contacts.create", { resourceType: "client", resourceId: data.client_id })` + session | created `ClientContact` | `createClientContact` |
| `updateClientContact` | client-contacts.ts | POST | cast `{ id; updates: Partial<ClientContact> }` | `requireCapability("contacts.update", { resourceType: "client_contact", resourceId: data.id })` + session | updated `ClientContact` | `updateClientContact` |
| `deleteClientContact` | client-contacts.ts | POST | cast `{ id: string }` | `requireCapability("contacts.delete", { resourceType: "client_contact", resourceId: data.id })` + session | `{ ok: true }` | `deleteClientContact` |
| `validateClientImportRows` | client-import.ts | POST | cast `{ rows: ImportRow[] }` | `requireCapability("accounts.view")` + session | `validateImportRows` result (`{valid, errors…}`) — **read-only** | `listProducts`, raw `query` on `profiles`, `validateImportRows` |
| `commitClientImportFn` | client-import.ts | POST | cast `{ rows: ImportRow[] }`; re-validates server-side before commit | `requireCapability("accounts.create")` + session | `commitClientImport` result | `listProducts`, `query`, `validateImportRows`, `commitClientImport` |
| `getClientWorkspaceRead` | client-workspace.ts | GET | custom `validateClientWorkspaceInput` — `{clientId}` required non-empty, trimmed | `requireCapabilitySet(["accounts.view"], { optional: ["contacts.view","engagements.view","quotes.view","job_sheets.view"], target: {resourceType:"client", resourceId} })` | `loadClientWorkspaceRead(clientId, undefined, {contacts,engagements,quotes,jobSheets})` — sections gated by optional grants | `loadClientWorkspaceRead` |
| `getClientWorkspaceSection` | client-workspace.ts | GET | custom `validateClientWorkspaceSectionInput` — `{clientId, section ∈ clientWorkspaceSections}` | `requireCapabilitySet(sectionCapabilities[section], { target: {resourceType:"client", resourceId} })` — `contacts`→`["accounts.view","contacts.view"]`, `activity`/`engagements`→`["accounts.view","engagements.view"]`, `commercial`→`["accounts.view","quotes.view"]`, `job_sheets`→`["accounts.view","job_sheets.view"]` | section payload | `loadClientWorkspaceSection` |
| `getClients` | clients.ts | GET | cast `(data ?? {}) as ClientFilters` | `requireCapability("accounts.view")` + session | `Client[]` | `listClients` |
| `getClientsPage` | clients.ts | GET | cast `(data ?? {}) as ClientPageFilters` | `requireCapability("accounts.view")` + session | paged clients | `listClientsPage` |
| `getClient` | clients.ts | GET | cast `{ id: string }` | `requireCapability("accounts.view", { resourceType: "client", resourceId: data.id })` + session | `Client` | `getClient` |
| `createClient` | clients.ts | POST | cast `Pick<Client,"company_name"> & Partial<Pick<..,"industry"\|"tier"\|"account_owner"\|"health_score"\|"renewal_date"\|"arr"\|"account_id"\|"primary_contact_id">>` | `requireCapability("accounts.create")` + session | created `Client` | `createClient` |
| `updateClient` | clients.ts | POST | cast `{ id; updates: Partial<Client> }` | `requireCapability("accounts.update", { resourceType: "client", resourceId: data.id })` + session | updated `Client` | `updateClient` |
| `getCompanyWorkspaceRead` | company-workspace.ts | GET | custom `validateCompanyWorkspaceReadInput` — `{accountId (required), sections: CompanyWorkspaceSection[] }`, must be array, valid members, unique | `requireCapability("accounts.view", { resourceType: "account", resourceId: data.accountId })` | `loadCompanyWorkspaceRead(accountId, sections)` | `loadCompanyWorkspaceRead` |
| `getCompanyWorkspaceCore` | company-workspace.ts | GET | custom `validateCompanyWorkspaceInput` — `{accountId}` | `requireCapability("accounts.view", { resourceType: "account", resourceId: data.accountId })` | `loadCompanyWorkspaceCore(accountId)` | `loadCompanyWorkspaceCore` |
| `getCompanyWorkspaceSection` | company-workspace.ts | GET | custom `validateCompanyWorkspaceSectionInput` — `{accountId, section ∈ commercial\|delivery_finance\|activity\|intelligence}` | `requireCapability("accounts.view", { resourceType: "account", resourceId: data.accountId })` | `loadCompanyWorkspaceSection(accountId, section)` | `loadCompanyWorkspaceSection` |
| `getAccountContacts` | contacts.ts | GET | cast `{ accountId: string }` | `requireCapability("contacts.view", { resourceType: "account", resourceId: data.accountId })` + session | `AccountContact[]` | `listAccountContacts` |
| `createAccountContact` | contacts.ts | POST | cast `CreateAccountContactInput` | `requireCapability("contacts.create", { resourceType: "account", resourceId: data.account_id })` + session | created `AccountContact` | `createAccountContact` |
| `updateAccountContact` | contacts.ts | POST | cast `{ id; updates: Partial<AccountContact> }` | `requireCapability("contacts.update", { resourceType: "account_contact", resourceId: data.id })` + session | updated `AccountContact` | `updateAccountContact` |
| `getCustomerSuccessProfiles` | customer-success.ts | GET | cast `(data ?? {}) as CustomerSuccessProfileFilters` | `requireCapability("engagements.view")` | profile list | `listCustomerSuccessProfiles` |
| `getCustomerSuccessProfile` | customer-success.ts | GET | cast `{ accountId: string }` | `requireCapability("engagements.view", { resourceType: "supabase_account", resourceId: data.accountId })` | account workspace | `getCustomerSuccessAccountWorkspace` |
| `upsertCustomerSuccessProfile` | customer-success.ts | POST | cast `UpsertCustomerSuccessProfileInput` | `requireCapability("engagements.update", { resourceType: "supabase_account", resourceId: data.account_id })` | upserted profile with derived `renewal_risk` / `next_best_action` | `assessRenewalRisk`, `upsertCustomerSuccessProfile` |
| `updateCustomerSuccessProfile` | customer-success.ts | POST | cast `{ id; updates: Partial<Omit<CustomerSuccessProfile,"id"\|"account_id">> }` | `requireCapability("engagements.update", { resourceType: "customer_success_profile", resourceId: data.id })` | updated profile (risk recomputed only when `health_score`/`renewal_date` change) | `getCustomerSuccessRiskInputs`, `assessRenewalRisk`, `updateCustomerSuccessProfile` |
| `createSuccessTouchpoint` | customer-success.ts | POST | cast `CreateSuccessTouchpointInput` | `requireCapability("engagements.create", { resourceType: "supabase_account", resourceId: data.account_id })` | created touchpoint | `createSuccessTouchpoint` |
| `getCustomerSuccessDashboard` | customer-success.ts | GET | none | `requireCapability("engagements.view")` | `{accounts, averageAccountHealth, highRiskAccounts, renewalsDue30}` | `listCustomerSuccessProfilesForDashboard` |
| `getDashboard` | dashboard.ts | GET | none | `requireCapability("leads.view")` | `{...dashboard, approvals[], agentRuns[], activityLogs[]}` (each serialized) | `getDashboardReadModel` |
| `getDashboardRead` | dashboard.ts | GET | — | — | alias: `export const getDashboardRead = getDashboard` | — |
| `getDeals` | deals.ts | GET | cast `(data ?? {}) as DealFilters` | `requireCapability("accounts.view")` | `Deal[]` | `listDeals` |
| `getDeal` | deals.ts | GET | cast `{ id: string }` | `requireCapability("accounts.view", { resourceType: "deal", resourceId: data.id })` | deal workspace | `getDealWorkspace` |
| `createDeal` | deals.ts | POST | cast `CreateDealInput` | `requireCapability("accounts.create")` | created `Deal` | `createDeal` |
| `updateDeal` | deals.ts | POST | cast `{ id; updates: Partial<Deal> }` | `requireCapability("accounts.update", { resourceType: "deal", resourceId: data.id })` | updated `Deal` | `updateDeal` |
| `getForecast` | deals.ts | GET | cast `(data ?? {}) as ForecastDealFilters` | `requireCapability("accounts.view")` | `calculateWeightedForecast(openDeals)` | `listOpenDeals`, `calculateWeightedForecast` |
| `getEngagementEvents` | engagement-events.ts | GET | cast `(data ?? {}) as EngagementEventFilters` | `requireCapability("engagements.view", engagementTarget(data))` — `{resourceType:"supabase_account"}` if `account_id`, else `{resourceType:"contact"}` if `contact_id`, else `{}` | event list | `listEngagementEvents` |
| `createEngagementEvent` | engagement-events.ts | POST | cast `CreateEngagementEventInput` | `requireCapability("engagements.create", engagementTarget(data))` | created event | `createEngagementEvent` |
| `upsertChannelIdentity` | engagement-events.ts | POST | cast `UpsertChannelIdentityInput` | `requireCapability("engagements.update", engagementTarget(data))` | upserted identity | `upsertChannelIdentity` |
| `getEngagementsByClient` | engagements.ts | GET | cast `{ clientId: string }` | `requireCapability("engagements.view", { resourceType: "client", resourceId: data.clientId })` + session | `Engagement[]` | `listEngagementsByClient` |
| `getEngagementsForRenewals` | engagements.ts | GET | cast `(data ?? {}) as RenewalsFilters` | `requireCapability("engagements.view")` + session | renewal engagements | `listEngagementsForRenewals` |
| `createEngagement` | engagements.ts | POST | cast `Pick<Engagement,"client_id"\|"product_id"\|"billing_period"> & Partial<Pick<..,"owner"\|"value"\|"start_date"\|"renewal_date"\|"lead_id"\|"quote_id">>` | `requireCapability("engagements.create", { resourceType: "client", resourceId: data.client_id })` + session | created `Engagement` | `createEngagement` |
| `renewEngagement` | engagements.ts | POST | cast `{ id: string; reason?: string }` | `requireCapability("engagements.update", { resourceType: "engagement", resourceId: data.id })` | renewed engagement | `markEngagementRenewed` |
| `endEngagement` | engagements.ts | POST | cast `{ id: string; reason: string }` | `requireCapability("engagements.update", { resourceType: "engagement", resourceId: data.id })` | ended engagement | `markEngagementEnded` |
| `triggerRiskScoreAgent` | engagements.ts | POST | cast `{ engagementId: string }` | `requireCapability("agents.run", { resourceType: "engagement", resourceId: data.engagementId })` | `{triggered, run?, reason?}` (same 3-way shape as other triggers) | `findActiveRun`, `createAgentRun`, `updateAgentRunResult`, `triggerN8n` |
| `validateEventImportRowsFn` | event-import.ts | POST | cast `{ rows: EventImportRow[] }` | `requireCapability("engagements.view")` **+** `requireCapability("accounts.view")` **+** `requireCapability("contacts.view")` + session | `validateEventImportRows` result — **read-only** | `listEventImportAccountCandidates`, `listEventImportAccountContacts`, `validateEventImportRows` |
| `commitEventImportFn` | event-import.ts | POST | cast `{ campaignId: string; rows: EventImportRow[] }`; re-validates before commit | `requireCapability("engagements.create", {resourceType:"campaign",resourceId:campaignId})` **+** `requireCapability("campaigns.manage", {same target})` **+** `requireCapability("accounts.create")` **+** `requireCapability("contacts.create")` | `{ok:false, errors}` on validation failure, else `commitEventImport` result | `commitEventImport` |
| `getJobSheets` | job-sheets.ts | GET | cast `(data ?? {}) as JobSheetFilters` | `requireCapability("job_sheets.view")` + session | job sheet list | `listJobSheets` |
| `getJobSheetsPage` | job-sheets.ts | GET | cast `(data ?? {}) as JobSheetPageFilters` | `requireCapability("job_sheets.view")` + session | paged job sheets | `listJobSheetsPage` |
| `getJobSheet` | job-sheets.ts | GET | cast `{ id: string }` | `requireCapability("job_sheets.view", { resourceType: "job_sheet", resourceId: data.id })` + session | job sheet detail | `getJobSheet` |
| `updateJobSheetPortions` | job-sheets.ts | POST | cast `{ id: string; portions: NewJobSheetPortion[] }` | `requireCapability("job_sheets.update_billing", { resourceType: "job_sheet", resourceId: data.id })` + session | replaced portions | `replaceJobSheetPortions` |
| `acceptJobSheetForAccounting` | job-sheets.ts | POST | cast `{ id: string }` | `requireCapability("job_sheets.accept", { resourceType: "job_sheet", resourceId: data.id })` | accepted job sheet (`accepted_by` = session profile) | `acceptJobSheet` |
| `updatePortionXeroReference` | job-sheets.ts | POST | cast `UpdateJobSheetXeroReferenceInput` | `requireCapability("job_sheets.update_billing", { resourceType: "job_sheet_portion", resourceId: data.portion_id })` + session | updated portion | `updateJobSheetXeroReference` |
| `getLeads` | leads.ts | GET | cast `GetLeadsInput` — `status?,source?,assigned_to?,contact_id?,account_id?,source_campaign_id?` | `requireCapability("leads.view")` + session | `Lead[]` | `listLeads` |
| `getLeadsPage` | leads.ts | GET | cast `(data ?? {}) as LeadPageFilters` | `requireCapability("leads.view")` + session | paged leads | `listLeadsPage` |
| `getLead` | leads.ts | GET | cast `{ id: string }` | `requireCapability("leads.view", { resourceType: "lead", resourceId: data.id })` + session | `{ lead, activityLogs[] }` (logs serialized) | `getLeadWithActivity` |
| `createLead` | leads.ts | POST | cast `CreateLeadInput` — `company_name`,`source` + optional `enquiry_text`,`contact_*`,`assigned_to`,`contact_id`,`account_id`,`source_campaign_id`,`campaign_member_id` | `requireCapability("leads.create")` + session | created `Lead` | `createLead` |
| `updateLead` | leads.ts | POST | cast `{ id; updates: UpdateLeadInput }` (`status`,`assigned_to`,`lead_score`,`qualification_data`,`contact_id`,`account_id`,`source_campaign_id`,`campaign_member_id`) | `requireCapability("leads.update", { resourceType: "lead", resourceId: data.id })` + session | updated `Lead` | `updateLead` |
| `moveLeadStage` | leads.ts | POST | cast `{ id; status: LeadStatus; reason? }` | `requireCapability("leads.update", { resourceType: "lead", resourceId: data.id })` | stage-move result | `moveLeadStage` |
| `convertWonLead` | leads.ts | POST | cast `{ leadId, productId, value?, billingPeriod, startDate?, renewalDate?, quoteId? }` | `requireCapability("leads.convert", { resourceType: "lead", resourceId: data.leadId })` | conversion result (engagement) | `convertWonLeadToEngagement` |
| `triggerLeadAgent` | leads.ts | POST | cast `{ leadId: string }` | `requireCapability("agents.run", { resourceType: "lead", resourceId: data.leadId })` | `{triggered:false,run,reason:"already_running"}` \| `{triggered:false,reason:"missing_webhook"}` \| `{triggered:true,run}` | `findActiveRun`, `createAgentRun`, `updateAgentRunResult`, `triggerN8n` |
| `triggerLeadReplyDraft` | leads.ts | POST | cast `{ leadId: string }` | `requireCapability("agents.run", { resourceType: "lead", resourceId: data.leadId })` | same 3-way trigger shape | `findActiveRun`, `createAgentRun`, `updateAgentRunResult`, `triggerN8n` |
| `getNotifications` | notifications.ts | GET | none | **none** — `requireNeonAuthSession()` only | `{ notifications, unreadCount }` | `listNotifications`, `countUnreadNotifications` |
| `markNotificationReadFn` | notifications.ts | POST | cast `{ id: string }` | **none** — session only | `markNotificationRead` result | `markNotificationRead` |
| `markAllNotificationsReadFn` | notifications.ts | POST | none | **none** — session only | `{ ok: true }` | `markAllNotificationsRead` |
| `getJobSheetRead` | operations.ts | GET | custom `parseJobSheetInput` — `{id}` required non-empty | `requireCapability("job_sheets.view", { resourceType: "job_sheet", resourceId: data.id })`; then `requireCapabilitySet([], { optional: ["quotes.view"], target:{resourceType:"quote"} })` and `requireCapabilitySet([], { optional: ["accounts.view"], target:{resourceType:"client"} })` | `{...read, quote: quote\|null, client: client\|null}` — nulled when the optional grant is absent | `getJobSheetOperationsRead` |
| `getRenewalsRead` | operations.ts | GET | custom `parseRenewalsInput` — `renewalWindow ∈ all\|overdue\|30\|60\|90\|later`, `risk ∈ low\|medium\|high\|all`, `productId`, `asOf` (YYYY-MM-DD, defaults today), `page`, `limit` | `requireCapabilityChecks([{capability:"engagements.view"},{capability:"products.view"}])` | `loadRenewalsRead` result | `loadRenewalsRead` |
| `getReportSummary` | operations.ts | GET | custom `parseRange` — `{range ∈ 7d\|30d\|90d}` (default `30d`) | `requireCapability("reports.view")` | `loadReportSummary` result | `loadReportSummary` |
| `getReportDataset` | operations.ts | GET | custom `parseDatasetInput` — `{report ∈ revenue\|pipeline\|conversion\|agents\|tasks, range}` | `requireCapability("reports.view")` | `loadReportDataset` result | `loadReportDataset` |
| `getProducts` | products.ts | GET | cast `(data ?? {}) as { activeOnly?: boolean }` | `requireCapability("products.view")` + session | `Product[]` | `listProducts` |
| `createProduct` | products.ts | POST | cast `Pick<Product,"name"\|"billing_type"> & Partial<Pick<..,"description"\|"category"\|"default_term_months">>` | `requireCapability("products.manage")` + session | created `Product` | `createProduct` |
| `updateProduct` | products.ts | POST | cast `{ id; updates: Partial<Product> }` | `requireCapability("products.manage")` + session | updated `Product` | `updateProduct` |
| `deactivateProductFn` | products.ts | POST | cast `{ id: string }` | `requireCapability("products.manage")` + session | deactivated `Product` | `deactivateProduct` |
| `getProjects` | projects.ts | GET | cast `(data ?? {}) as ProjectFilters` | `requireCapability("engagements.view")` | `Project[]` | `listProjects` |
| `getProject` | projects.ts | GET | cast `{ id: string }` | `requireCapability("engagements.view", { resourceType: "project", resourceId: data.id })` | project workspace | `getProjectWorkspace` |
| `createProject` | projects.ts | POST | cast `CreateProjectInput` | `requireCapability("engagements.create")` | created `Project` | `createProject` |
| `updateProject` | projects.ts | POST | cast `{ id; updates: Partial<Project> }` | `requireCapability("engagements.update", { resourceType: "project", resourceId: data.id })` | updated `Project` | `updateProject` |
| `createProjectFromWonDeal` | projects.ts | POST | cast `{ dealId: string }` | `requireCapability("engagements.create", { resourceType: "deal", resourceId: data.dealId })` | created `Project`; throws `"A project can only be created from a won deal."` when draft is null | `getDealForProject`, `buildProjectFromWonDeal`, `createProject` |
| `getQuoteCreateBootstrap` | quote-workspace.ts | GET | custom `parseBootstrapInput` — `{leadId?, clientId?, productId?}` (trimmed, optional) | `requireCapabilityChecks([{capability:"quotes.view"},{capability:"leads.view"},{capability:"accounts.view"},{capability:"products.view"}])` | `loadQuoteCreateBootstrap` result | `loadQuoteCreateBootstrap` |
| `getQuoteReferencePage` | quote-workspace.ts | GET | custom `parseReferenceInput` — `{kind ∈ lead\|client\|product\|pricing, search?, selectedId?, page?, limit?}` | `requireCapabilityChecks([{capability:"quotes.view"}, ...(referenceCapabilities[kind] ? [{capability}] : [])])` — `lead`→`leads.view`, `client`→`accounts.view`, `product`→`products.view`, `pricing`→none | `QuoteReferencePage` | `listQuoteReferencePage` |
| `getQuoteDetailRead` | quote-workspace.ts | GET | custom `parseIdInput` — `{id}` required | `requireCapability("quotes.view", { resourceType: "quote", resourceId: id })`, then `authorizeLinkedQuoteParties` → `requireCapabilityChecks` on `accounts.view`(client) / `leads.view`(lead) when linked | `getQuoteWorkspaceDetail` result | `getQuoteWorkspaceDetail` |
| `getQuoteVersionsSection` | quote-workspace.ts | GET | custom `parseVersionInput` — `{id, page?, limit?}` | `requireCapability("quotes.view", { resourceType: "quote", resourceId: id })` | paged version summaries | `listQuoteVersionSummariesPage` |
| `getQuoteDocumentRead` | quote-workspace.ts | GET | custom `parseIdInput` | `requireCapability("quotes.view", {resourceType:"quote", resourceId})` + `authorizeLinkedQuoteParties` | `loadQuoteDocumentRead` result | `loadQuoteDocumentRead` |
| `getQuotes` | quotes.ts | GET | cast `GetQuotesInput` — `status?,lead_id?,client_id?,contact_id?,account_id?,deal_id?` | `requireCapability("quotes.view")` + session | `Quote[]` | `listQuotes` |
| `getQuotesPage` | quotes.ts | GET | cast `(data ?? {}) as QuotePageFilters` | `requireCapability("quotes.view")` + session | paged quotes | `listQuotesPage` |
| `getQuote` | quotes.ts | GET | cast `{ id: string }` | `requireCapability("quotes.view", { resourceType: "quote", resourceId: data.id })` + session | `Quote` | `getQuote` |
| `createQuote` | quotes.ts | POST | cast `CreateQuoteInput` (exported type) — `lead_id`,`currency` + optional `client_id`,`contact_id`,`account_id`,`deal_id`,`line_items`,`total_value`,`valid_until`,`number`,`quote_template_id`,`document_sections`,`cover_text`,`assumptions`,`payment_terms` | `requireCapability("quotes.create")` | created `Quote` (`created_by` = session profile) | `createQuote` |
| `updateQuote` | quotes.ts | POST | cast `{ id; updates: Partial<Quote> }`; `assertNoLifecycleQuoteUpdates` blocks `status`,`accepted_version_id`,`issued_version_id`,`accepted_at`,`accepted_by`,`pdf_url`,`approved_by` | `requireCapability("quotes.update", { resourceType: "quote", resourceId: data.id })` + session | updated `Quote` | `updateQuote` |
| `requestQuoteApproval` | quotes.ts | POST | cast `{ id: string }` | `requireCapability("quotes.request_approval", { resourceType: "quote", resourceId: data.id })` + session | `Quote` with `status:"pending_approval"` | `updateQuoteLifecycle` |
| `triggerQuoteAgent` | quotes.ts | POST | cast `{ leadId: string }` | `requireCapability("agents.run", { resourceType: "lead", resourceId: data.leadId })` | 3-way trigger shape | `findActiveRun`, `createAgentRun`, `updateAgentRunResult`, `triggerN8n` |
| `getPricingTemplates` | quotes.ts | GET | none | `requireCapability("quotes.view")` + session | `PricingTemplate[]` | `listActivePricingTemplates` |
| `getQuoteTemplates` | quotes.ts | GET | none | `requireCapability("quotes.view")` + session | quote templates | `listQuoteTemplates` |
| `getQuotePdfTemplates` | quotes.ts | GET | none | `requireCapability("quotes.view")` + session | PDF templates for `"quote"` | `listPdfTemplates` |
| `getQuoteVersions` | quotes.ts | GET | cast `{ quoteId: string }` | `requireCapability("quotes.view", { resourceType: "quote", resourceId: data.quoteId })` + session | `QuoteVersion[]` | `listQuoteVersions` |
| `approveQuote` | quotes.ts | POST | cast `{ id: string }` | `requireCapability("quotes.approve", { resourceType: "quote", resourceId: data.id })` | approved `Quote` (idempotent when already approved/sent); throws if status not approvable | `getQuote`, `updateQuoteLifecycle` |
| `rejectQuote` | quotes.ts | POST | cast `{ id: string; approvalId?: string; notes?: string }` | `requireCapability("quotes.approve", { resourceType: "quote", resourceId: data.id })` | rejected `Quote`; optionally records approval decision | `getApproval`, `getQuote`, `updateQuoteLifecycle`, `decideApproval` |
| `issueQuoteVersion` | quotes.ts | POST | cast `{ id: string; pdfTemplateId?: string \| null }` | `requireCapability("quotes.issue", { resourceType: "quote", resourceId: data.id })` | `{ quote, version }` | `getQuote`, `listQuoteVersions`, `createQuoteVersion`, `listQuoteLineItems`, `updateQuoteLifecycle` |
| `approveAndIssueQuote` | quotes.ts | POST | cast `{ id, approvalId, pdfTemplateId?, notes? }` | `requireCapability("quotes.issue", { resourceType: "quote", resourceId: data.id })` | `{ quote, version }`; asserts approval is `quote_send`, matches quote, is pending | `getApproval`, `getQuote`, `updateQuoteLifecycle`, `createQuoteVersion`, `decideApproval` |
| `acceptQuoteAndCreateJobSheet` | quotes.ts | POST | cast `{ id: string }` | `requireCapability("job_sheets.accept", { resourceType: "quote", resourceId: data.id })` | `{ quote, jobSheet }` | `getQuote`, `listQuoteLineItems`, `listQuoteVersions`, `createQuoteVersion`, `updateQuoteLifecycle`, `createJobSheetFromAcceptedQuote` |
| `getRelationshipSignals` | relationship-signals.ts | GET | cast `(data ?? {}) as { account_id?, signal_type?, openOnly? }` | `requireCapability("engagements.view")` + session | signal list | `listRelationshipSignals` |
| `dismissRelationshipSignalFn` | relationship-signals.ts | POST | custom exported `parseDismissRelationshipSignalInput` — `{id, reason}` both required non-empty after trim | `requireCapability("engagements.update", { resourceType: "relationship_signal", resourceId: data.id })` | dismissed signal (`dismissed_by`, `dismissal_reason`) | `dismissRelationshipSignal` |
| `getLeadWorkspaceRead` | relationship-workspaces.ts | GET | custom `parseIdInput` — `{id}` required | `requireCapabilityChecks([{capability:"leads.view", target:{resourceType:"lead", resourceId:id}}, {capability:"quotes.view"}])` | `loadLeadWorkspaceRead` result | `loadLeadWorkspaceRead` |
| `getCampaignWorkspaceRead` | relationship-workspaces.ts | GET | custom `parseIdInput` | `requireCapability("campaigns.view", { resourceType: "campaign", resourceId: data.id })` | campaign + attendee summary | `getCampaignWithAttendeeSummary` |
| `getCampaignWorkspaceSection` | relationship-workspaces.ts | GET | custom `parseCampaignSectionInput` — `{campaignId (required), page?, limit?}` | `requireCapability("campaigns.view", { resourceType: "campaign", resourceId: data.campaignId })` | attendee-import section page | `listCampaignAttendeeImportSection` |
| `getRelationshipIndexRead` | relationship-workspaces.ts | GET | custom `parseRelationshipIndexInput` — `{page?, limit?, severity ∈ low\|medium\|high, signalType?}` | `requireCapabilitySet(["accounts.view", "engagements.view"])` | paged relationship index | `listRelationshipIndexPage` |
| `searchWorkspace` | search.ts | GET | cast `{ query: string; limit?: number }` (query trimmed, limit defaults 20) | `requireAnyCapability(["accounts.view","contacts.view","leads.view","quotes.view"])` | `searchWorkspace` results | `searchWorkspace` (repositories/workspace-search) |
| `getTasks` | tasks.ts | GET | cast `GetTasksInput` — `status?,priority?,assigned_to?,client_id?,contact_id?,account_id?,deal_id?,project_id?` | `requireCapability("tasks.view")` + session | `Task[]` (priority filtered in-handler) | `listTasks` |
| `createTask` | tasks.ts | POST | cast `CreateTaskInput` — `title` + optional `description`,`assigned_to`,`lead_id`,`client_id`,`contact_id`,`account_id`,`deal_id`,`project_id`,`due_date`,`priority` | `requireCapability("tasks.create")` + session | created `Task` | `createTask` |
| `updateTask` | tasks.ts | POST | cast `{ id; updates: Partial<Task> }` | `requireCapability("tasks.update", { resourceType: "task", resourceId: data.id })` + session | updated `Task` | `updateTask` |
| `getTouchpointsByClient` | touchpoints.ts | GET | cast `{ clientId: string }` | `requireCapability("engagements.view", { resourceType: "client", resourceId: data.clientId })` + session | touchpoint list | `listTouchpointsByClient` |
| `createTouchpoint` | touchpoints.ts | POST | cast `{ client_id, engagement_id?, contact_id?, type: TouchpointNewType, sentiment?, notes?, occurred_at? }` | `requireCapability("engagements.create", { resourceType: "client", resourceId: data.client_id })` | created touchpoint (`logged_by` = session profile) | `createTouchpoint` |
| `getWorkspacePreferences` | workspace-preferences.ts | GET | cast `(data ?? {}) as { objectType?: WorkspaceObject }`; `rejectCallerProfileId` throws if caller sends `profileId` | **none** — `requireNeonAuthSession()` only | `{ views, favorites }` | `listWorkspaceViews`, `listWorkspaceFavorites` |
| `savePersonalWorkspaceView` | workspace-preferences.ts | POST | cast `SaveViewData` — `{objectType, name, config, isDefault?}`; `rejectCallerProfileId` | **none** — session only | saved view | `saveWorkspaceView` |
| `togglePersonalWorkspaceFavorite` | workspace-preferences.ts | POST | cast `ToggleFavoriteData` — `{kind, label, href, viewId?, accountId?}`; `rejectCallerProfileId` | **none** — session only | toggled favorite | `toggleWorkspaceFavorite` |

---

## Files whose exports do NOT perform a capability check

**All exports in the file are capability-free** (session-only or fully unauthenticated):

| File | What guards it instead |
|---|---|
| `src/server-functions/account.ts` (all 8) | `requireNeonAuthSession()` only — all operations are scoped to `session.profile.id`, so the session *is* the authorization |
| `src/server-functions/auth.ts` (`getSession`, `signIn`, `signOut`) | nothing — these are the auth endpoints themselves |
| `src/server-functions/notifications.ts` (all 3) | `requireNeonAuthSession()` only; scoped to `session.profile.id` |
| `src/server-functions/workspace-preferences.ts` (all 3) | `requireNeonAuthSession()` + `rejectCallerProfileId` guard; scoped to `session.profile.id` |
| `src/server-functions/app-shell.ts` (`getAppShellRead`) | no direct check; composes `getSession`, `getWorkspacePreferences`, `getAdminNavigationFn` — only the last one enforces `requireAnyCapability` |

**Files with a mix** — specific exports lacking a capability check:

- `src/server-functions/admin-access.ts` → **`createAdminAccessRequestFn`** (`requireNeonAuthSession()` only; deliberate — anyone may *request* access). Also **`getAdminAuditSummaryFn`** checks `audit.view` but swallows `FORBIDDEN`/`OUTSIDE_SCOPE` and returns `[]`.
- `src/server-functions/admin-invitations.ts` → **`getInvitationPreview`** (no capability, no session at all — public token lookup) and **`acceptUserInvitation`** (`requireNeonAuthIdentity()` only, no capability).

Every other file has a capability check on every export.

---

## Mutations (write) vs reads

### Writes (mutations) — 90

`account.ts`: `updateMyProfile`, `updateMyAvailability`, `revokeMyAppSessions`, `createMyDelegation`, `cancelMyDelegation`, `createMyAccessRequest`
`accounts.ts`: `createAccount`, `updateAccount`, `triggerRelationshipIntelligence`
`admin-access.ts`: `createAdminPermissionOverrideFn`, `revokeAdminPermissionOverrideFn`, `createAdminAccessRequestFn`, `decideAdminAccessRequestFn`, `createAdminWorkDelegationFn`, `cancelAdminWorkDelegationFn`
`admin-invitations.ts`: `inviteUsers`, `acceptUserInvitation`, `resendUserInvitation`, `revokeUserInvitation`
`admin-teams.ts`: `createDepartmentFn`, `updateDepartmentFn`, `createTeamFn`, `updateTeamFn`, `upsertAdminTeamMembershipFn`, `endAdminTeamMembershipFn`
`admin-users.ts`: `updateAdminUserFn`, `changeAdminUserRoleFn`, `suspendAdminUserFn`, `reactivateAdminUserFn`, `deactivateAdminUserWithReassignmentFn`, `revokeAdminUserSessionsFn`
`approvals.ts`: `decideApproval`
`auth.ts`: `signIn`, `signOut` (external auth state + `set-cookie`, no app DB write)
`automation-playbooks.ts`: `createAutomationPlaybook`, `updateAutomationPlaybook`, `createAutomationRun`, `updateAutomationRun`
`campaigns.ts`: `createCampaign`, `updateCampaign`, `addCampaignMember`, `createCampaignFollowUpTasksFn`
`client-contacts.ts`: `createClientContact`, `updateClientContact`, `deleteClientContact`
`client-import.ts`: `commitClientImportFn`
`clients.ts`: `createClient`, `updateClient`
`contacts.ts`: `createAccountContact`, `updateAccountContact`
`customer-success.ts`: `upsertCustomerSuccessProfile`, `updateCustomerSuccessProfile`, `createSuccessTouchpoint`
`deals.ts`: `createDeal`, `updateDeal`
`engagement-events.ts`: `createEngagementEvent`, `upsertChannelIdentity`
`engagements.ts`: `createEngagement`, `renewEngagement`, `endEngagement`, `triggerRiskScoreAgent`
`event-import.ts`: `commitEventImportFn`
`job-sheets.ts`: `updateJobSheetPortions`, `acceptJobSheetForAccounting`, `updatePortionXeroReference`
`leads.ts`: `createLead`, `updateLead`, `moveLeadStage`, `convertWonLead`, `triggerLeadAgent`, `triggerLeadReplyDraft`
`notifications.ts`: `markNotificationReadFn`, `markAllNotificationsReadFn`
`products.ts`: `createProduct`, `updateProduct`, `deactivateProductFn`
`projects.ts`: `createProject`, `updateProject`, `createProjectFromWonDeal`
`quotes.ts`: `createQuote`, `updateQuote`, `requestQuoteApproval`, `triggerQuoteAgent`, `approveQuote`, `rejectQuote`, `issueQuoteVersion`, `approveAndIssueQuote`, `acceptQuoteAndCreateJobSheet`
`relationship-signals.ts`: `dismissRelationshipSignalFn`
`tasks.ts`: `createTask`, `updateTask`
`touchpoints.ts`: `createTouchpoint`
`workspace-preferences.ts`: `savePersonalWorkspaceView`, `togglePersonalWorkspaceFavorite`

**Read-only despite `method: "POST"`** (3): `validateClientImportRows` (client-import.ts), `validateEventImportRowsFn` (event-import.ts), `tidyTouchpointNote` (ai-note-tidy.ts — external LLM call, no persistence).

### Reads — 94
Every `method: "GET"` export. No GET export writes. Notable GETs that still call into agent/read-model machinery but do not persist: `getAgentDirectoryRead`, `getAgentHistoryPage`, `getAiReviewRead`, `getAppShellRead`, `isAiNoteTidyAvailable`, `getForecast`, `getCustomerSuccessDashboard`, `getAdminNavigationFn`, `exportAdminAuditLogsFn`.

The read/write split maps exactly onto the GET/POST split, with the three read-only POSTs above as the only exceptions.

---

## Conventions

**Definition wrapper.** Every server function without exception is
```ts
import { createServerFn } from "@tanstack/react-start";
export const name = createServerFn({ method: "GET" | "POST" })
  .validator((data: unknown) => …)   // omitted when there is no input
  .handler(async ({ data }) => { … });
```
There is no project-local wrapper, no `middleware()` usage, and no auth applied via TanStack middleware — the guard is always the first statement inside `.handler`. Files also export a few plain helpers (`normalizeAgentHistoryInput` in agent-runs.ts, `parseDismissRelationshipSignalInput` in relationship-signals.ts), exported types (`CreateQuoteInput` in quotes.ts), type re-exports (agent-runs.ts, quote-workspace.ts), and two plain aliases (`getAccountsIndexRead`, `getDashboardRead`).

**Validators — three coexisting styles.**
1. *Type cast* (the majority, ~120 fns): `.validator((data: unknown) => data as X)` or `.validator((data: unknown) => (data ?? {}) as XFilters)` for optional-filter GETs. No runtime validation; the cast is documentation only.
2. *Zod* (all admin-surface files — `account.ts`, `admin-access.ts`, `admin-invitations.ts`, `admin-teams.ts`, `admin-users.ts`): `.validator((data: unknown) => someSchema.parse(data))`, with shared schemas imported from `@/lib/admin/schemas` (`invitationInputSchema`, `teamMembershipSchema`, `accessRequestSchema`, `permissionOverrideSchema`, `delegationSchema`, `nonEmptyReasonSchema`, `userRoleSchema`, `profileStatusSchema`, `capabilitySchema`, `NON_REQUESTABLE_CAPABILITIES`). These files re-`parse` inside the handler as well (`const input = schema.parse(data)`), so the schema runs twice.
3. *Hand-written parse functions* (read-model/workspace files — `client-workspace.ts`, `company-workspace.ts`, `operations.ts`, `quote-workspace.ts`, `relationship-workspaces.ts`, `agent-runs.ts`, `relationship-signals.ts`): named `parseXInput` / `validateXInput`, throwing plain `Error` with a human message, trimming strings, clamping `page`/`limit`, and checking enum membership against a local `Set`/`const` tuple.

**Authorization.** Four helpers from `@/server/auth/authorization.server`, each of which loads the session itself via `requireNeonAuthSession()` inside `loadAuthorizationContext()`:
- `requireCapability(capability, target = {}) → AppSession` — the dominant form.
- `requireCapabilityChecks(checks: {capability, target?}[]) → AppSession` — several capabilities, each with its own target.
- `requireCapabilitySet(required[], { optional?, target? }) → Partial<Record<Capability, boolean>>` — required-throw + optional-probe; the returned map drives conditional section loading (`client-workspace.ts`, `operations.ts#getJobSheetRead`).
- `requireAnyCapability(capabilities[], target = {}) → AppSession` — OR semantics (`search.ts`, `admin-users.ts`).

Targets are either resource-shaped (`{ resourceType: "account" | "client" | "lead" | "quote" | "deal" | "project" | "engagement" | "campaign" | "task" | "job_sheet" | "job_sheet_portion" | "contact" | "account_contact" | "client_contact" | "human_approval" | "relationship_signal" | "automation_playbook" | "automation_run" | "customer_success_profile" | "supabase_account", resourceId }`) or org-shaped (`{ profileId, role?, teamId?, departmentId?, ownerProfileId? }` — used throughout the admin files). `resolveAuthorizationTarget` widens a resource target with its `ownerProfileId` for manager-scope checks.

**Redundant session calls.** Many older files call `await requireNeonAuthSession()` *after* `requireCapability(...)` even though the capability helper already loads the session; several newer files (`company-workspace.ts`, `deals.ts`, `projects.ts`, `automation-playbooks.ts`) carry comments explaining this is unnecessary and omit it. When the handler needs the actor id it uses `const session = await requireNeonAuthSession()` (or the `AppSession` returned by `requireCapability`, via the local `actorId(session)` / `idOf(session)` helpers in the admin files) and reads `session.profile.id`.

**Error handling.** No try/catch wrapper convention and no shared error-mapping layer — handlers throw and TanStack surfaces it. Two error vocabularies:
- `AdminError(code, message)` from `@/lib/admin/errors`, codes `UNAUTHENTICATED | FORBIDDEN | OUTSIDE_SCOPE | CONFLICT | VALIDATION_FAILED | LAST_SUPER_ADMIN | OPEN_WORK_REMAINS | STALE_ADMIN_STATE`. All authorization denials become `AdminError` via `decisionError()`: `OUTSIDE_SCOPE` for a scope miss, `FORBIDDEN` otherwise. Admin-surface handlers throw `AdminError` directly for business-rule violations.
- Plain `new Error("…")` in the domain files, for validator failures and workflow assertions (`"Only approved quotes can be issued"`, `"A project can only be created from a won deal."`, `"Quote lifecycle fields must be changed through workflow actions"`, `"OPENROUTER_API_KEY is not configured"`). `requireNeonAuthSession()` throws a bare `new Error("Authentication required")`.

Only two places catch: `getAdminAuditSummaryFn` and `getAdminNavigationFn`, both catching `AdminError` with code `FORBIDDEN`/`OUTSIDE_SCOPE` to degrade gracefully (empty list / filtered nav) and re-throwing anything else. The n8n trigger functions catch dispatch failures, record `status: "failed"` on the agent run via `updateAgentRunResult`, then re-throw.

**Serialization.** Rows containing non-JSON-safe fields are passed through `@/lib/serializable` helpers before returning: `serializeAgentRun`, `serializeHumanApproval`, `serializeActivityLog`, `serializeAgentToolCall`, `serializeAutomationPlaybook`, `serializeAutomationRun`.

**Layering.** Handlers call `@/server/repositories/*` for data access and `@/server/read-models/*` (or `@/server/company-workspace/loaders`, `@/server/app-shell/loaders`) for composed page reads. Business rules that read the clock or make judgements deliberately live in the handler, not the repository (`calculateWeightedForecast`, `assessRenewalRisk`, `buildProjectFromWonDeal`, the quote lifecycle assertions).