import { AuthView } from "@neondatabase/auth-ui";

import { NeonAuthProvider } from "@/components/auth/neon-auth-provider";

type LoginAuthFormProps = {
  authPath: string;
  redirectTo: string;
};

export function LoginAuthForm({ authPath, redirectTo }: LoginAuthFormProps) {
  const invitationSignUp = authPath === "sign-up" && /^\/invite\/[^/]+\/complete$/.test(redirectTo);
  return (
    <NeonAuthProvider
      redirectTo={redirectTo}
      emailOTP={false}
      basePath="/login"
      signUp={invitationSignUp}
    >
      <AuthView path={invitationSignUp ? "sign-up" : "sign-in"} cardFooter={false} />
    </NeonAuthProvider>
  );
}
