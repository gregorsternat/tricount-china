import "server-only";

import type { DashboardScope, DashboardSnapshot } from "@/lib/dashboard/types";
import { adaptDashboardSnapshot } from "@/lib/dashboard/server-adapter";

import { getDashboardSnapshot } from "./dashboard";

export interface AuthenticatedViewer {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
}

export async function getUiDashboardSnapshot(
  viewer: AuthenticatedViewer,
  scope: DashboardScope,
  groupId?: string,
): Promise<DashboardSnapshot> {
  const raw = await getDashboardSnapshot(
    viewer.id,
    scope,
    scope === "group" ? groupId : undefined,
  );
  return adaptDashboardSnapshot({ raw, viewer, scope, requestedGroupId: groupId });
}
