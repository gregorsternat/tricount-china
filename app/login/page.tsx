import type { Metadata } from "next";

import { AuthShell, SignInForm } from "@/components/auth";
import {
  firstQueryValue,
  safeRedirectPath,
} from "@/components/auth/auth-utils";

export const metadata: Metadata = {
  title: "Connexion · Fēn",
  description: "Connecte-toi à ton espace privé Fēn.",
  robots: { index: false, follow: false },
};

interface LoginPageProps {
  readonly searchParams: Promise<{
    email?: string | string[];
    next?: string | string[];
    token?: string | string[];
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <AuthShell
      eyebrow="Bon retour"
      title="Retrouve ton année en Chine."
      description="Connecte-toi avec l’adresse utilisée pour ton invitation. Ton tableau de bord et tes groupes t’attendent."
    >
      <SignInForm
        invitationToken={firstQueryValue(params.token)?.trim() || undefined}
        initialEmail={firstQueryValue(params.email)}
        nextPath={safeRedirectPath(params.next)}
      />
    </AuthShell>
  );
}
