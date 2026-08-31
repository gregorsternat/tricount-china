"use client";

import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { auth } from "./auth";

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const { signIn, signOut, useSession } = authClient;

type EmailSignupInput = Parameters<typeof authClient.signUp.email>[0];

export function signUpWithInvitation(
  input: EmailSignupInput & { invitationToken?: string },
) {
  const { invitationToken, ...credentials } = input;
  return authClient.signUp.email(
    credentials,
    invitationToken ? { body: { invitationToken } } : undefined,
  );
}
