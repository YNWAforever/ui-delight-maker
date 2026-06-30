type FilterValue = string | number | boolean | null | Date | undefined;

export function buildFilters(filters: Array<[string, FilterValue]>, startIndex = 1) {
  const values: Exclude<FilterValue, undefined>[] = [];
  const clauses: string[] = [];
  let nextIndex = startIndex;

  for (const [column, value] of filters) {
    if (value === undefined) continue;
    if (value === null) {
      clauses.push(`${column} is null`);
      continue;
    }
    clauses.push(`${column} = $${nextIndex}`);
    values.push(value);
    nextIndex += 1;
  }

  return {
    sql: clauses.length > 0 ? ` where ${clauses.join(" and ")}` : "",
    values,
    nextIndex,
  };
}

export function buildUpdate<T extends Record<string, unknown>>(
  updates: T,
  allowedColumns: Array<keyof T & string>,
  startIndex = 1,
) {
  const values: unknown[] = [];
  const assignments: string[] = [];
  let nextIndex = startIndex;

  for (const column of allowedColumns) {
    const value = updates[column];
    if (value === undefined) continue;
    assignments.push(`${column} = $${nextIndex}`);
    values.push(value);
    nextIndex += 1;
  }

  if (assignments.length === 0) {
    throw new Error("No allowed update fields were provided");
  }

  return {
    sql: assignments.join(", "),
    values,
    nextIndex,
  };
}
