import type { Account, WorkspaceFavorite, WorkspaceView } from "@/lib/types";
import { query } from "@/server/db/neon.server";
import { listAccountsPage, type AccountPageFilters } from "@/server/repositories/accounts";
import {
  listWorkspaceFavorites,
  listWorkspaceViews,
} from "@/server/repositories/workspace-preferences";

type CountRow = {
  account_id: string;
  count: number | string;
};

export type AccountIndexCounts = {
  linkedClientCount: number;
  openSignalCount: number;
};

export interface AccountsIndexReadModel {
  accounts: Account[];
  accountCounts: Record<string, AccountIndexCounts>;
  pagination: {
    total: number;
    page: number;
    limit: number;
  };
  preferences: {
    views: WorkspaceView[];
    favorites: WorkspaceFavorite[];
  };
}

function indexCounts(rows: CountRow[]) {
  return new Map(rows.map((row) => [row.account_id, Number(row.count)]));
}

async function getCurrentPageCounts(accountIds: string[]) {
  const [clientRows, signalRows] = await Promise.all([
    query<CountRow>(
      `select account_id, count(*) as count
       from clients
       where account_id = any($1::uuid[])
       group by account_id`,
      [accountIds],
    ),
    query<CountRow>(
      `select account_id, count(*) as count
       from relationship_signals
       where dismissed_at is null
         and account_id = any($1::uuid[])
       group by account_id`,
      [accountIds],
    ),
  ]);

  const clientsByAccount = indexCounts(clientRows);
  const signalsByAccount = indexCounts(signalRows);

  return Object.fromEntries(
    accountIds.map((accountId) => [
      accountId,
      {
        linkedClientCount: clientsByAccount.get(accountId) ?? 0,
        openSignalCount: signalsByAccount.get(accountId) ?? 0,
      },
    ]),
  );
}

export async function getAccountsIndexReadModel(
  profileId: string,
  filters: AccountPageFilters = {},
): Promise<AccountsIndexReadModel> {
  const pagePromise = listAccountsPage(filters);
  const preferencesPromise = Promise.all([
    listWorkspaceViews(profileId, "account"),
    listWorkspaceFavorites(profileId),
  ]);
  const [page, [views, favorites]] = await Promise.all([pagePromise, preferencesPromise]);
  const accountIds = page.items.map((account) => account.id);
  const accountCounts = accountIds.length > 0 ? await getCurrentPageCounts(accountIds) : {};

  return {
    accounts: page.items,
    accountCounts,
    pagination: { total: page.total, page: page.page, limit: page.limit },
    preferences: { views, favorites },
  };
}
