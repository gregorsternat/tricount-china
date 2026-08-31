import type { Metadata } from "next";

import { AuthShell, SignInForm } from "@/components/auth";
import {
  firstQueryValue,
  safeRedirectPath,
} from "@/components/auth/auth-utils";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const messages = await getMessages();
  return {
    title: messages.metadata.login.title,
    description: messages.metadata.login.description,
    robots: { index: false, follow: false },
  };
}

interface LoginPageProps {
  readonly searchParams: Promise<{
    email?: string | string[];
    next?: string | string[];
    token?: string | string[];
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [params, messages] = await Promise.all([searchParams, getMessages()]);
  const copy = messages.auth.login;

  return (
    <AuthShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
    >
      <SignInForm
        invitationToken={firstQueryValue(params.token)?.trim() || undefined}
        initialEmail={firstQueryValue(params.email)}
        nextPath={safeRedirectPath(params.next)}
      />
    </AuthShell>
  );
}
