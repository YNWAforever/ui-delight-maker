import type { ReactNode } from "react";
import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import { authClient } from "@/lib/auth/neon-auth.client";

export function NeonAuthProvider({ children }: { children: ReactNode }) {
  return <NeonAuthUIProvider authClient={authClient}>{children}</NeonAuthUIProvider>;
}
