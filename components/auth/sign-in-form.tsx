"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { FormStatus } from "@/components/auth/form-status";
import { PasswordField } from "@/components/auth/password-field";
import { useI18n } from "@/components/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";

import {
  buildAuthHref,
  getAuthErrorKey,
  safeRedirectPath,
} from "./auth-utils";
import type { AuthErrorMessageKey } from "@/lib/i18n/messages/types";
import { claimInvitationWithRetry } from "./invitation-claim";

interface SignInFormProps {
  readonly invitationToken?: string;
  readonly initialEmail?: string;
  readonly nextPath?: string;
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "claim-error" }
  | { kind: "error"; messageKey: AuthErrorMessageKey }
  | { kind: "success" };

export function SignInForm({
  invitationToken,
  initialEmail = "",
  nextPath = "/",
}: SignInFormProps) {
  const { messages } = useI18n();
  const copy = messages.auth.login;
  const router = useRouter();
  const destination = safeRedirectPath(nextPath);
  const [email, setEmail] = useState(initialEmail);
  const [authenticated, setAuthenticated] = useState(false);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const pending = state.kind === "loading" || state.kind === "success";
  const fieldsDisabled = pending || authenticated;
  const joinHref = useMemo(
    () =>
      buildAuthHref("/join", {
        email,
        nextPath: destination,
        token: invitationToken,
      }),
    [destination, email, invitationToken],
  );

  async function finishInvitationClaim() {
    if (invitationToken) await claimInvitationWithRetry(invitationToken);

    setState({ kind: "success" });
    router.replace(destination);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "loading" });

    if (authenticated) {
      try {
        await finishInvitationClaim();
      } catch {
        setState({ kind: "claim-error" });
      }
      return;
    }

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");

    try {
      const result = await signIn.email({
        email: email.trim().toLowerCase(),
        password,
        rememberMe: formData.get("rememberMe") === "on",
      });

      if (result.error) {
        setState({
          kind: "error",
          messageKey: getAuthErrorKey(result.error, "sign-in"),
        });
        return;
      }

      setAuthenticated(true);
      try {
        await finishInvitationClaim();
      } catch {
        setState({ kind: "claim-error" });
      }
    } catch (error) {
      setState({
        kind: "error",
        messageKey: getAuthErrorKey(error, "sign-in"),
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" aria-busy={pending}>
      <div className="space-y-2">
        <Label htmlFor="sign-in-email" className="text-[13px] font-semibold text-[#284b42]">
          {copy.emailLabel}
        </Label>
        <Input
          id="sign-in-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={fieldsDisabled}
          placeholder={copy.emailPlaceholder}
          className="h-12 rounded-[14px] border-[#173f35]/15 bg-white px-4 text-[15px] shadow-none placeholder:text-[#6b7a72] focus-visible:border-[#466c60] focus-visible:ring-[#c9ff63]/65"
        />
      </div>

      <PasswordField
        id="sign-in-password"
        name="password"
        label={copy.passwordLabel}
        autoComplete="current-password"
        disabled={fieldsDisabled}
      />

      <label className="flex w-fit items-center gap-2.5 text-sm text-[#586e64]">
        <input
          type="checkbox"
          name="rememberMe"
          defaultChecked
          disabled={fieldsDisabled}
          className="size-4 rounded border-[#173f35]/25 accent-[#173f35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#77a52a]"
        />
        {copy.rememberMe}
      </label>

      {state.kind === "error" || state.kind === "claim-error" || state.kind === "success" ? (
        <FormStatus
          kind={state.kind === "claim-error" ? "error" : state.kind}
          message={
            state.kind === "error"
              ? messages.auth.errors[state.messageKey]
              : state.kind === "claim-error"
                ? copy.claimError
                : copy.success
          }
        />
      ) : null}

      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-[14px] bg-[#173f35] px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(23,63,53,0.18)] hover:bg-[#214f44] focus-visible:ring-[#c9ff63]/70"
      >
        {pending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            {state.kind === "success"
              ? copy.opening
              : authenticated
                ? copy.activating
                : copy.signingIn}
          </>
        ) : (
          <>
            {authenticated ? copy.retryActivation : copy.submit}
            <ArrowRight className="size-4" aria-hidden />
          </>
        )}
      </Button>

      <p className="border-t border-[#173f35]/10 pt-5 text-center text-sm leading-6 text-[#66786f]">
        {copy.firstTime}{" "}
        <Link
          href={joinHref}
          className="font-semibold text-[#173f35] underline decoration-[#95bd47] decoration-2 underline-offset-4 outline-none hover:text-[#386655] focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[#77a52a]"
        >
          {copy.createAccount}
        </Link>
      </p>
    </form>
  );
}
