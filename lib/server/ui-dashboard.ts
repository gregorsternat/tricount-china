import "server-only";

import type { DashboardScope, DashboardSnapshot } from "@/lib/dashboard/types";
import {
  currentMonthKey,
  monthPeriod,
  shiftMonth,
} from "@/lib/dashboard/period";
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
  month = currentMonthKey(),
): Promise<DashboardSnapshot> {
  const selectedPeriod = monthPeriod(month);
  const trendStartMonth = month < "2000-06" ? "2000-01" : shiftMonth(month, -5);
  const trendPeriod = monthPeriod(trendStartMonth);
  const requestedGroupId = scope === "group" ? groupId : undefined;
  const [raw, trendRaw] = await Promise.all([
    getDashboardSnapshot(
      viewer.id,
      scope,
      requestedGroupId,
      { from: selectedPeriod.from, to: selectedPeriod.to },
    ),
    getDashboardSnapshot(
      viewer.id,
      scope,
      requestedGroupId,
      { from: trendPeriod.from, to: selectedPeriod.to },
    ),
  ]);
  return adaptDashboardSnapshot({
    raw,
    trendRaw,
    viewer,
    scope,
    month,
    requestedGroupId: groupId,
  });
}
