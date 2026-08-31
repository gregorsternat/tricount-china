import type { Metadata } from "next";

import { AuthShell, SignUpForm } from "@/components/auth";
import {
  firstQueryValue,
  safeRedirectPath,
} from "@/components/auth/auth-utils";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const messages = await getMessages();
  return {
    title: messages.metadata.join.title,
    description: messages.metadata.join.description,
    robots: { index: false, follow: false },
  };
}

interface JoinPageProps {
  readonly searchParams: Promise<{
    email?: string | string[];
    next?: string | string[];
    token?: string | string[];
  }>;
}

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const [params, messages] = await Promise.all([searchParams, getMessages()]);
  const invitationToken = firstQueryValue(params.token)?.trim() || undefined;
  const copy = messages.auth.join;

  return (
    <AuthShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
    >
      <SignUpForm
        invitationToken={invitationToken}
        initialEmail={firstQueryValue(params.email)}
        nextPath={safeRedirectPath(params.next)}
      />
    </AuthShell>
  );
}
