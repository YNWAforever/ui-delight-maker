import { AuthView } from "@neondatabase/auth-ui";

import { NeonAuthProvider } from "@/components/auth/neon-auth-provider";

type LoginAuthFormProps = {
  authPath: string;
  redirectTo: string;
};

export function LoginAuthForm({ authPath, redirectTo }: LoginAuthFormProps) {
  const invitationSignUp = authPath === "sign-up" && /^\/invite\/[^/]+\/complete$/.test(redirectTo);
  const viewPath = invitationSignUp
    ? "sign-up"
    : authPath === "forgot-password" || authPath === "reset-password"
      ? authPath
      : "sign-in";
  return (
    <NeonAuthProvider
      redirectTo={redirectTo}
      emailOTP={false}
      basePath="/login"
      signUp={invitationSignUp}
    >
      <AuthView path={viewPath} cardFooter={false} />
    </NeonAuthProvider>
  );
}
