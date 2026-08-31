import { z } from "zod";

import { upsertBudget } from "@/lib/server/dal";
import { requireAuthenticatedUser } from "@/lib/server/auth-session";
import { idempotentJson } from "@/lib/server/idempotent-json";
import { requireSameOrigin, toErrorResponse } from "@/lib/server/request-security";
import { getUiDashboardSnapshot } from "@/lib/server/ui-dashboard";

const bodySchema = z.object({
  budgetFen: z.number().int().positive().safe(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  scope: z.enum(["personal", "group"]),
  groupId: z.string().min(1).max(160).nullish(),
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const viewer = await requireAuthenticatedUser(request.headers);
    const body = bodySchema.parse(await request.json());
    const groupId = body.scope === "group" ? body.groupId : null;
    if (body.scope === "group" && !groupId) {
      return Response.json(
        { error: { code: "GROUP_REQUIRED", message: "Sélectionne un tricount." } },
        { status: 400 },
      );
    }

    return idempotentJson(
      request,
      {
        ownerUserId: viewer.id,
        scope: "budget.upsert",
        requestBody: body,
      },
      async () => {
        const budget = await upsertBudget(viewer.id, {
          groupId,
          name: body.scope === "group" ? "Budget du tricount" : "Budget annuel personnel",
          periodType: "year",
          amountFen: body.budgetFen,
          currency: "CNY",
          startsAt: new Date(`${body.startsOn}T00:00:00+08:00`),
          endsAt: new Date(`${body.endsOn}T23:59:59.999+08:00`),
          alertThresholdBasisPoints: 8_000,
          isActive: true,
        });

        const snapshot = await getUiDashboardSnapshot(viewer, body.scope, groupId ?? undefined);
        return {
          body: { snapshot, message: "Budget annuel mis à jour." },
          resourceType: "budget",
          resourceId: budget.id,
        };
      },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
