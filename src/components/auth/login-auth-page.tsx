import { AuthView } from "@neondatabase/auth-ui";
import { Sparkles } from "lucide-react";
import { NeonAuthProvider } from "@/components/auth/neon-auth-provider";

type LoginAuthPageProps = {
  authPath?: string;
};

export function LoginAuthPage({ authPath = "sign-in" }: LoginAuthPageProps) {
  const isSignUp = authPath === "sign-up";

  return (
    <NeonAuthProvider redirectTo="/" emailOTP={false} basePath="/login" signUp>
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-semibold">Fimmick ClientOps</h1>
            <p className="text-sm text-muted-foreground">
              {isSignUp
                ? "Create an account with your @fimmick.com email"
                : "Sign in to your workspace"}
            </p>
          </div>
          <AuthView path={authPath} cardFooter={false} />
        </div>
      </div>
    </NeonAuthProvider>
  );
}
