import { useDeferredValue, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { crmQueryKeys } from "@/lib/query-keys";
import { getQuoteReferencePage } from "@/server-functions/quote-workspace";

type QuoteReferenceKind = "lead" | "client" | "product" | "pricing";

type ReferencePage<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export function useQuoteReferenceData<T>(
  kind: QuoteReferenceKind,
  initialData: ReferencePage<T>,
  selectedId?: string,
) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());
  const filters = {
    kind,
    search: deferredSearch || undefined,
    selectedId: selectedId || undefined,
    page,
    limit: 25,
  };
  const query = useQuery({
    queryKey: crmQueryKeys.quotes.list({ resource: "quote-reference", ...filters }),
    queryFn: async () => (await getQuoteReferencePage({ data: filters })) as ReferencePage<T>,
    initialData: page === 1 && !deferredSearch ? initialData : undefined,
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });

  useEffect(() => setPage(1), [deferredSearch, selectedId]);

  return {
    ...query,
    data: query.data ?? initialData,
    search,
    setSearch,
    page,
    setPage,
  };
}
