import type { AttendeeStatus } from "@/lib/types";

import { findAccountMatch, normalizeContactEmail, type AccountMatchResult } from "./matching";

const VALID_ATTENDEE_STATUSES: ReadonlySet<AttendeeStatus> = new Set([
  "attended",
  "met",
  "high_intent",
  "unknown",
]);

export type EventImportRow = {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  attendee_status: string;
  interests: string[];
  notes: string;
};

export type EventImportError = { index: number; reason: string };

export type EventImportValidationInput = {
  rows: EventImportRow[];
  accounts: Array<{ id: string; name: string; domain?: string | null }>;
};

export type EventImportValidRow = Omit<EventImportRow, "attendee_status"> & {
  attendee_status: AttendeeStatus;
  account_match: AccountMatchResult;
};

export type EventImportValidationResult = {
  valid: EventImportValidRow[];
  errors: EventImportError[];
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function normalizeAttendeeStatus(value: string): AttendeeStatus | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "attended";
  }

  return VALID_ATTENDEE_STATUSES.has(normalized as AttendeeStatus)
    ? (normalized as AttendeeStatus)
    : null;
}

export function parseEventAttendeeCsv(csv: string): EventImportRow[] {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine).map((header) => header.toLowerCase());

  return lines.filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));

    return {
      company_name: record.company_name ?? "",
      contact_name: record.contact_name ?? "",
      email: record.email ?? "",
      phone: record.phone ?? "",
      attendee_status: record.attendee_status || "attended",
      interests: (record.interests ?? "")
        .split(";")
        .map((interest) => interest.trim())
        .filter(Boolean),
      notes: record.notes ?? "",
    };
  });
}

export function validateEventImportRows(
  input: EventImportValidationInput,
): EventImportValidationResult {
  const valid: EventImportValidRow[] = [];
  const errors: EventImportError[] = [];
  const seen = new Set<string>();

  input.rows.forEach((row, index) => {
    if (!row.company_name.trim() && !row.contact_name.trim()) {
      errors.push({ index, reason: "Company or contact name is required." });
      return;
    }

    const attendeeStatus = normalizeAttendeeStatus(row.attendee_status);
    if (!attendeeStatus) {
      errors.push({
        index,
        reason: "Attendee status must be attended, met, high_intent, or unknown.",
      });
      return;
    }

    const email = normalizeContactEmail(row.email);
    const dedupeKey = `${row.company_name.trim().toLowerCase()}|${email ?? row.contact_name.trim().toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      errors.push({ index, reason: "Duplicate attendee in file." });
      return;
    }
    seen.add(dedupeKey);

    valid.push({
      ...row,
      email: email ?? "",
      attendee_status: attendeeStatus,
      account_match: findAccountMatch({ companyName: row.company_name, accounts: input.accounts }),
    });
  });

  return { valid, errors };
}
