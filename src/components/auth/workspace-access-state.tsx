import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type WorkspaceAccessStateName =
  | "invited"
  | "suspended"
  | "deactivated"
  | "unverified"
  | "no_profile";

type WorkspaceAccessStateProps = {
  state: WorkspaceAccessStateName;
  /** Server-resolved identity email; required to submit the OTP for the unverified state. */
  email?: string;
  onSignOut?: () => void;
};

type WorkspaceAccessStateMessage = {
  title: string;
  description: string;
  /** Overrides the default sign-out label when the state needs a more specific action. */
  actionLabel?: string;
};

const messages: Record<WorkspaceAccessStateName, WorkspaceAccessStateMessage> = {
  invited: {
    title: "Invitation pending",
    description:
      "Use the invitation link sent to your email address to finish setting up workspace access. Ask your administrator if you need a new invitation.",
  },
  suspended: {
    title: "Workspace access suspended",
    description: "Your account is suspended. Contact your administrator for help.",
  },
  deactivated: {
    title: "Workspace access deactivated",
    description: "Your account is deactivated. Contact your administrator for help.",
  },
  unverified: {
    title: "Verify your email address",
    description:
      "Neon Auth emailed a verification code to your address. Enter it below; check your spam folder if it has not arrived.",
    actionLabel: "Use a different account",
  },
  no_profile: {
    title: "Workspace access pending",
    description:
      "Your identity is signed in, but workspace access requires an administrator invitation. Contact your administrator for help.",
  },
};

const VERIFY_EMAIL_ENDPOINT = "/api/auth/email-otp/verify-email";
const SEND_VERIFICATION_ENDPOINT = "/api/auth/email-otp/send-verification-otp";
const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 45;
const GENERIC_ERROR = "We could not verify that code. Please try again.";
const NETWORK_ERROR = "We could not reach the verification service. Please try again.";
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_OTP: "That code is not valid",
  OTP_EXPIRED: "That code expired — send a new one",
  TOO_MANY_ATTEMPTS: "Too many attempts — wait a moment and try again",
};

function errorMessageFromCode(code: string | null) {
  if (!code) return GENERIC_ERROR;
  return ERROR_MESSAGES[code] ?? GENERIC_ERROR;
}

async function readErrorCode(response: Response) {
  try {
    const payload = (await response.json()) as { code?: unknown };
    return typeof payload.code === "string" ? payload.code : null;
  } catch {
    return null;
  }
}

async function postAuthJson(path: string, body: Record<string, string>) {
  return fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function VerifyEmailForm({ email }: { email: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSent, setResendSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => {
      setResendCooldown((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const canSubmit = code.length === CODE_LENGTH && !submitting;

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await postAuthJson(VERIFY_EMAIL_ENDPOINT, { email, otp: code });
      if (!response.ok) {
        setError(errorMessageFromCode(await readErrorCode(response)));
        return;
      }
      // autoSignInAfterVerification sets the session cookie, so reload into the active workspace.
      window.location.replace("/");
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resending || resendCooldown > 0) return;

    setResending(true);
    setError(null);
    setResendSent(false);
    try {
      const response = await postAuthJson(SEND_VERIFICATION_ENDPOINT, {
        email,
        type: "email-verification",
      });
      if (!response.ok) {
        setError(errorMessageFromCode(await readErrorCode(response)));
        return;
      }
      setResendSent(true);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="mt-5 space-y-3">
      <p className="text-sm text-muted-foreground">
        Code sent to <span className="font-medium text-foreground">{email}</span>
      </p>
      <form className="space-y-2" onSubmit={handleVerify}>
        <Input
          ref={inputRef}
          aria-label="Verification code"
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={CODE_LENGTH}
          placeholder="6-digit code"
          value={code}
          disabled={submitting}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH));
            setError(null);
          }}
          className="text-center tracking-[0.4em]"
        />
        <Button type="submit" className="w-full" disabled={!canSubmit}>
          {submitting ? "Verifying…" : "Verify email"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="space-y-1">
        <button
          type="button"
          className="text-sm font-medium text-primary underline underline-offset-4 disabled:opacity-60 disabled:no-underline"
          disabled={resending || resendCooldown > 0}
          onClick={handleResend}
        >
          {resending
            ? "Sending…"
            : resendCooldown > 0
              ? `Resend code in ${resendCooldown}s`
              : "Resend code"}
        </button>
        {resendSent && (
          <p role="status" className="text-xs text-muted-foreground">
            A new code was sent. Check your inbox and spam folder.
          </p>
        )}
      </div>
    </div>
  );
}

export function WorkspaceAccessState({ state, email, onSignOut }: WorkspaceAccessStateProps) {
  const message = messages[state];
  return (
    <section className="rounded-md border bg-card p-5 text-center" aria-live="polite">
      <h2 className="text-lg font-semibold">{message.title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{message.description}</p>
      {state === "unverified" && email && <VerifyEmailForm email={email} />}
      {onSignOut && (
        <button
          type="button"
          className="mt-5 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
          onClick={onSignOut}
        >
          {message.actionLabel ?? "Sign out"}
        </button>
      )}
    </section>
  );
}
