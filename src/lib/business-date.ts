export const BUSINESS_TIME_ZONE = "Asia/Hong_Kong";

export function getBusinessDateKey(
  now: Date = new Date(),
  timeZone: string = BUSINESS_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (!year || !month || !day) throw new Error("Unable to calculate business date");
  return `${year}-${month}-${day}`;
}
