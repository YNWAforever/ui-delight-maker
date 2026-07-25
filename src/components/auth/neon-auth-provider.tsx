import type { ComponentProps, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import { crmQueryKeys } from "@/lib/query-keys";
import { getAuthClient } from "@/lib/auth/neon-auth";

type NeonAuthProviderProps = Omit<
  ComponentProps<typeof NeonAuthUIProvider>,
  "authClient" | "children"
> & {
  children: ReactNode;
};

export function NeonAuthProvider({ children, onSessionChange, ...props }: NeonAuthProviderProps) {
  const queryClient = useQueryClient();

  return (
    <NeonAuthUIProvider
      authClient={getAuthClient()}
      {...props}
      onSessionChange={async () => {
        queryClient.removeQueries({ queryKey: crmQueryKeys.shell(), exact: true });
        await onSessionChange?.();
      }}
    >
      {children}
    </NeonAuthUIProvider>
  );
}
