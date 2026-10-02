export function verdictFor(input: {
  sampled: number;
  alsoInNeon: number;
  complete: boolean;
}): string {
  const { sampled, alsoInNeon, complete } = input;
  if (sampled === 0) return "no rows in source snapshot — migrate by deleting the code";

  const scope = complete ? `all ${sampled} rows` : `${sampled} of the table sampled`;

  if (alsoInNeon === sampled) {
    return complete
      ? `SAME SET (${sampled}/${sampled}) — replicated; migration is a foreign-key repoint`
      : `CONSISTENT WITH SAME SET (${alsoInNeon}/${sampled}, ${scope}) — re-run with a larger SAMPLE to confirm`;
  }

  if (alsoInNeon === 0) {
    return complete
      ? `DISJOINT (0/${sampled}) — two unrelated entity sets, needs a product decision`
      : `CONSISTENT WITH DISJOINT (0/${sampled}, ${scope}) — re-run with a larger SAMPLE before acting on this`;
  }

  return `PARTIAL (${alsoInNeon}/${sampled}, ${scope}) — needs an identity mapping`;
}
