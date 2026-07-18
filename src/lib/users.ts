// src/lib/users.ts
import type { UserRole } from "./types";
export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export const APP_USERS: AppUser[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Ada Wong",
    email: "ada@fimmick.com",
    role: "admin",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Marcus Lee",
    email: "marcus@fimmick.com",
    role: "manager",
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    name: "Priya Shah",
    email: "priya@fimmick.com",
    role: "sales",
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    name: "Kenji Tan",
    email: "kenji@fimmick.com",
    role: "sales",
  },
  {
    id: "00000000-0000-0000-0000-000000000005",
    name: "Sara Lin",
    email: "sara@fimmick.com",
    role: "client_success",
  },
];

export const userById = (id: string): AppUser | undefined => APP_USERS.find((u) => u.id === id);

export const USER_RECORD: Record<string, string> = Object.fromEntries(
  APP_USERS.map((u) => [u.id, u.name]),
);
