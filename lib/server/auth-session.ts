import "server-only";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";

import { unauthorized } from "./errors";

export async function getCurrentSession(requestHeaders?: Headers) {
  return auth.api.getSession({
    headers: requestHeaders ?? (await headers()),
  });
}

export async function requireAuthenticatedUser(requestHeaders?: Headers) {
  const session = await getCurrentSession(requestHeaders);
  if (!session?.user) throw unauthorized();

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  };
}
