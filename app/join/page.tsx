import type { Metadata } from "next";

import { AuthShell, SignUpForm } from "@/components/auth";
import {
  firstQueryValue,
  safeRedirectPath,
} from "@/components/auth/auth-utils";

export const metadata: Metadata = {
  title: "Créer mon compte · Fēn",
  description: "Crée ton compte privé Fēn et rejoins ton groupe.",
  robots: { index: false, follow: false },
};

interface JoinPageProps {
  readonly searchParams: Promise<{
    email?: string | string[];
    next?: string | string[];
    token?: string | string[];
  }>;
}

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const params = await searchParams;
  const invitationToken = firstQueryValue(params.token)?.trim() || undefined;

  return (
    <AuthShell
      eyebrow="Bienvenue dans le groupe"
      title="Crée ton espace privé."
      description="Un seul compte suffit pour suivre tes dépenses personnelles et participer à tous tes tricounts."
    >
      <SignUpForm
        invitationToken={invitationToken}
        initialEmail={firstQueryValue(params.email)}
        nextPath={safeRedirectPath(params.next)}
      />
    </AuthShell>
  );
}
