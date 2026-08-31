import "server-only";

import { getDb } from "@/lib/db/client";
import { requireAuthenticatedUser } from "@/lib/server/auth-session";
import { requireSameOrigin } from "@/lib/server/request-security";

import type { ImportApiDependencies } from "./contracts";
import { DrizzleImportRepository } from "./drizzle-repository";

export function createImportApiDependencies(): ImportApiDependencies {
  return {
    repository: new DrizzleImportRepository(getDb()),
    requireSameOrigin,
    requireUser: requireAuthenticatedUser,
  };
}
