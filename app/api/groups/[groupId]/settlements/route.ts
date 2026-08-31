import { z } from "zod";

import { isMonthKey } from "@/lib/dashboard/period";
import { createSettlement, getDashboardSnapshot } from "@/lib/server/dal";
import { requireAuthenticatedUser } from "@/lib/server/auth-session";
import { conflict } from "@/lib/server/errors";
import { idempotentJson } from "@/lib/server/idempotent-json";
import { requireSameOrigin, toErrorResponse } from "@/lib/server/request-security";
import { getUiDashboardSnapshot } from "@/lib/server/ui-dashboard";

const bodySchema = z.object({
  memberId: z.string().min(1).max(160),
  amountFen: z.number().int().positive().safe(),
  month: z.string().refine(isMonthKey, "Invalid month.").optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    requireSameOrigin(request);
    const viewer = await requireAuthenticatedUser(request.headers);
    const { groupId } = await context.params;
    const body = bodySchema.parse(await request.json());
    return idempotentJson(
      request,
      {
        ownerUserId: viewer.id,
        scope: "settlement.create",
        requestBody: { groupId, ...body },
      },
      async (idempotencyKey) => {
        const raw = await getDashboardSnapshot(viewer.id, "group", groupId);
        if (!raw.group) throw conflict("The selected group could not be found.");
        const currentMember = raw.group.members.find((member) => member.userId === viewer.id);
        const targetMember = raw.group.members.find((member) => member.id === body.memberId);
        if (!currentMember || !targetMember || currentMember.id === targetMember.id) {
          throw conflict("Choose another group member.");
        }
        const targetBalance = raw.group.analytics.balances.find(
          (balance) => balance.memberId === targetMember.id,
        )?.balanceFen ?? 0;
        const currentBalance = raw.group.analytics.balances.find(
          (balance) => balance.memberId === currentMember.id,
        )?.balanceFen ?? 0;
        if (targetBalance === 0 || currentBalance === 0) {
          throw conflict("This balance has already been settled.");
        }
        if (Math.sign(targetBalance) === Math.sign(currentBalance)) {
          throw conflict("A settlement requires balances in opposite directions.");
        }
        const maximumSettlementFen = Math.min(
          Math.abs(targetBalance),
          Math.abs(currentBalance),
        );
        if (body.amountFen > maximumSettlementFen) {
          throw conflict("The settlement cannot exceed the remaining balance.");
        }

        const settlement = await createSettlement(viewer.id, {
          groupId,
          fromMemberId: targetBalance < 0 ? targetMember.id : currentMember.id,
          toMemberId: targetBalance < 0 ? currentMember.id : targetMember.id,
          amountFen: body.amountFen,
          currency: "CNY",
          occurredAt: new Date(),
          note: "Settlement recorded from the dashboard",
          source: "manual",
          idempotencyKey,
        });

        const snapshot = await getUiDashboardSnapshot(viewer, "group", groupId, body.month);
        return {
          body: { snapshot, message: "Settlement recorded." },
          status: 201,
          resourceType: "settlement",
          resourceId: settlement.id,
        };
      },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
