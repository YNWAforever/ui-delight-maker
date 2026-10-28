// Structural contract shared by pg and Neon; no application DB singleton/env access.
export type WfmQueryable = {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
};
