import type { DashboardScope } from "@/lib/dashboard/types";
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
        { error: { code: "INVALID_GROUP_ID", message: "Identifiant de groupe invalide." } },
        { status: 400 },
      );
    }

    const dashboard = await getUiDashboardSnapshot(viewer, scope, groupId);
    return Response.json(dashboard, {
      headers: { "cache-control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
