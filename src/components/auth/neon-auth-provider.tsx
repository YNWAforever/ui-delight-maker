import type { ComponentProps, ReactNode } from "react";
import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import { getAuthClient } from "@/lib/auth/neon-auth";

type NeonAuthProviderProps = Omit<
  ComponentProps<typeof NeonAuthUIProvider>,
  "authClient" | "children"
> & {
  children: ReactNode;
};

export function NeonAuthProvider({ children, ...props }: NeonAuthProviderProps) {
  return (
    <NeonAuthUIProvider authClient={getAuthClient()} {...props}>
      {children}
    </NeonAuthUIProvider>
  );
}
