import type { DashboardScope } from "@/lib/dashboard/types";
import { currentMonthKey, isMonthKey } from "@/lib/dashboard/period";
import { requireAuthenticatedUser } from "@/lib/server/auth-session";
import { toErrorResponse } from "@/lib/server/request-security";
import { getUiDashboardSnapshot } from "@/lib/server/ui-dashboard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const viewer = await requireAuthenticatedUser(request.headers);
    const url = new URL(request.url);
    const requestedScope = url.searchParams.get("scope");
    const scope: DashboardScope = requestedScope === "group" ? "group" : "personal";
    const groupId = url.searchParams.get("groupId")?.trim() || undefined;
    if (groupId && groupId.length > 160) {
      return Response.json(
        { error: { code: "INVALID_GROUP_ID", message: "Invalid group ID." } },
        { status: 400 },
      );
    }
    const requestedMonth = url.searchParams.get("month");
    if (requestedMonth && !isMonthKey(requestedMonth)) {
      return Response.json(
        { error: { code: "INVALID_MONTH", message: "Invalid month." } },
        { status: 400 },
      );
    }
    const month = requestedMonth ?? currentMonthKey();

    const dashboard = await getUiDashboardSnapshot(viewer, scope, groupId, month);
    return Response.json(dashboard, {
      headers: { "cache-control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
