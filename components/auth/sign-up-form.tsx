"use client";

import { ArrowRight, KeyRound, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { FormStatus } from "@/components/auth/form-status";
import { PasswordField } from "@/components/auth/password-field";
import { useI18n } from "@/components/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpWithInvitation } from "@/lib/auth-client";

import {
  AUTH_MAX_PASSWORD_LENGTH,
  AUTH_MIN_PASSWORD_LENGTH,
  buildAuthHref,
  getAuthErrorKey,
  safeRedirectPath,
} from "./auth-utils";
import { claimInvitationWithRetry } from "./invitation-claim";
import type { AuthErrorMessageKey } from "@/lib/i18n/messages/types";

interface SignUpFormProps {
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

export function SignUpForm({
  invitationToken,
  initialEmail = "",
  nextPath = "/",
}: SignUpFormProps) {
  const { messages } = useI18n();
  const copy = messages.auth.join;
  const router = useRouter();
  const destination = safeRedirectPath(nextPath);
  const emailLocked = Boolean(invitationToken && initialEmail);
  const [email, setEmail] = useState(initialEmail);
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const pending = state.kind === "loading" || state.kind === "success";
  const fieldsDisabled = pending || accountCreated;
  const loginHref = useMemo(
    () =>
      buildAuthHref("/login", {
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
    setPasswordMismatch(false);

    if (accountCreated) {
      setState({ kind: "loading" });
      try {
        await finishInvitationClaim();
      } catch {
        setState({ kind: "claim-error" });
      }
      return;
    }

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const passwordConfirmation = String(formData.get("passwordConfirmation") ?? "");

    if (password !== passwordConfirmation) {
      setPasswordMismatch(true);
      setState({ kind: "idle" });
      return;
    }

    setState({ kind: "loading" });

    try {
      const result = await signUpWithInvitation({
        name: String(formData.get("name") ?? "").trim(),
        email: email.trim().toLowerCase(),
        password,
        ...(invitationToken ? { invitationToken } : {}),
      });

      if (result.error) {
        setState({
          kind: "error",
          messageKey: getAuthErrorKey(result.error, "sign-up"),
        });
        return;
      }

      setAccountCreated(true);
      try {
        await finishInvitationClaim();
      } catch {
        setState({ kind: "claim-error" });
      }
    } catch (error) {
      setState({
        kind: "error",
        messageKey: getAuthErrorKey(error, "sign-up"),
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" aria-busy={pending}>
      <div
        className={
          invitationToken
            ? "flex items-start gap-3 rounded-[14px] border border-[#6f9632]/20 bg-[#edf4dd] px-4 py-3 text-sm leading-5 text-[#31523f]"
            : "flex items-start gap-3 rounded-[14px] border border-[#173f35]/10 bg-[#f0f1e9] px-4 py-3 text-sm leading-5 text-[#52675d]"
        }
      >
        <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {invitationToken
            ? copy.invitationDetected
            : copy.privateSignup}
        </span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sign-up-name" className="text-[13px] font-semibold text-[#284b42]">
          {copy.nameLabel}
        </Label>
        <Input
          id="sign-up-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
          disabled={fieldsDisabled}
          placeholder="Gregor"
          className="h-12 rounded-[14px] border-[#173f35]/15 bg-white px-4 text-[15px] shadow-none placeholder:text-[#6b7a72] focus-visible:border-[#466c60] focus-visible:ring-[#c9ff63]/65"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sign-up-email" className="text-[13px] font-semibold text-[#284b42]">
          {copy.emailLabel}
        </Label>
        <Input
          id="sign-up-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          readOnly={emailLocked}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={fieldsDisabled}
          aria-describedby={emailLocked ? "invitation-email-description" : undefined}
          placeholder={copy.emailPlaceholder}
          className="h-12 rounded-[14px] border-[#173f35]/15 bg-white px-4 text-[15px] shadow-none placeholder:text-[#6b7a72] focus-visible:border-[#466c60] focus-visible:ring-[#c9ff63]/65 read-only:bg-[#f1f2eb] read-only:text-[#52675d]"
        />
        {emailLocked ? (
          <p id="invitation-email-description" className="text-xs leading-5 text-[#5d6f66]">
            {copy.emailLocked}
          </p>
        ) : null}
      </div>

      <PasswordField
        id="sign-up-password"
        name="password"
        label={copy.passwordLabel}
        autoComplete="new-password"
        minLength={AUTH_MIN_PASSWORD_LENGTH}
        maxLength={AUTH_MAX_PASSWORD_LENGTH}
        disabled={fieldsDisabled}
        description={copy.passwordDescription}
      />

      <PasswordField
        id="sign-up-password-confirmation"
        name="passwordConfirmation"
        label={copy.confirmPasswordLabel}
        autoComplete="new-password"
        minLength={AUTH_MIN_PASSWORD_LENGTH}
        maxLength={AUTH_MAX_PASSWORD_LENGTH}
        disabled={fieldsDisabled}
        error={passwordMismatch ? copy.passwordMismatch : undefined}
      />

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
              : accountCreated
                ? copy.activating
                : copy.creating}
          </>
        ) : (
          <>
            {accountCreated ? copy.retryActivation : copy.submit}
            <ArrowRight className="size-4" aria-hidden />
          </>
        )}
      </Button>

      <p className="border-t border-[#173f35]/10 pt-5 text-center text-sm leading-6 text-[#66786f]">
        {copy.existingAccount}{" "}
        <Link
          href={loginHref}
          className="font-semibold text-[#173f35] underline decoration-[#95bd47] decoration-2 underline-offset-4 outline-none hover:text-[#386655] focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[#77a52a]"
        >
          {copy.signIn}
        </Link>
      </p>
    </form>
  );
}
