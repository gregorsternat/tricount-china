import { z } from "zod";

import { isMonthKey, monthPeriod } from "@/lib/dashboard/period";
import { upsertBudget } from "@/lib/server/dal";
import { requireAuthenticatedUser } from "@/lib/server/auth-session";
import { idempotentJson } from "@/lib/server/idempotent-json";
import { requireSameOrigin, toErrorResponse } from "@/lib/server/request-security";
import { getUiDashboardSnapshot } from "@/lib/server/ui-dashboard";

const bodySchema = z.object({
  budgetFen: z.number().int().positive().safe(),
  month: z.string().refine(isMonthKey, "Invalid month."),
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
        { error: { code: "GROUP_REQUIRED", message: "Select a group." } },
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
        const period = monthPeriod(body.month);
        const budget = await upsertBudget(viewer.id, {
          groupId,
          name: "Monthly budget",
          periodType: "month",
          amountFen: body.budgetFen,
          currency: "CNY",
          startsAt: period.from,
          endsAt: period.to,
          alertThresholdBasisPoints: 8_000,
          isActive: true,
        });

        const snapshot = await getUiDashboardSnapshot(
          viewer,
          body.scope,
          groupId ?? undefined,
          body.month,
        );
        return {
          body: { snapshot, messageCode: "budget.updated" },
          resourceType: "budget",
          resourceId: budget.id,
        };
      },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
