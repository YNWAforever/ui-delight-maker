/**
 * The name a row's checkbox, expander and action menu are announced with.
 *
 * Per-row controls need names that tell one row from the next. They used to borrow the row
 * key — a database id — so a screen reader announced "Select row 3f2a9b1c-…" for every lead,
 * quote and task (audit UX-05). Tables pass a `rowLabel` that reads the record the way a
 * person would (company, quote number, person); without one, the row's position is used,
 * which is at least speakable. An id is never the fallback.
 */
export function rowControlName(label: string | null | undefined, index: number): string {
  const trimmed = label?.trim();
  return trimmed ? trimmed : `row ${index + 1}`;
}
