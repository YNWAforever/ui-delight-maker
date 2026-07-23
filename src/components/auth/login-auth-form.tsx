import { AuthView } from "@neondatabase/auth-ui";

import { NeonAuthProvider } from "@/components/auth/neon-auth-provider";

type LoginAuthFormProps = {
  authPath: string;
  redirectTo: string;
};

export function LoginAuthForm({ authPath, redirectTo }: LoginAuthFormProps) {
  return (
    <NeonAuthProvider redirectTo={redirectTo} emailOTP={false} basePath="/login" signUp>
      <AuthView path={authPath} cardFooter={false} />
    </NeonAuthProvider>
  );
}
