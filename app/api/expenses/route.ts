import { z } from "zod";

import { isMonthKey } from "@/lib/dashboard/period";
import {
  createExpenseWithShares,
  createPersonalWalletTransaction,
  getDashboardSnapshot,
  MAX_EXPENSE_SHARES,
} from "@/lib/server/dal";
import { requireAuthenticatedUser } from "@/lib/server/auth-session";
import { conflict } from "@/lib/server/errors";
import { idempotentJson } from "@/lib/server/idempotent-json";
import { requireSameOrigin, toErrorResponse } from "@/lib/server/request-security";
import { getUiDashboardSnapshot } from "@/lib/server/ui-dashboard";

const bodySchema = z.object({
  title: z.string().trim().min(2).max(160),
  amountFen: z.number().int().positive().safe(),
  occurredAt: z.iso.datetime({ offset: true }),
  category: z.string().trim().min(1).max(80),
  month: z.string().refine(isMonthKey, "Invalid month.").optional(),
  groupId: z.string().min(1).max(160).optional(),
  participantIds: z
    .array(z.string().min(1).max(160))
    .max(MAX_EXPENSE_SHARES)
    .default([]),
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const viewer = await requireAuthenticatedUser(request.headers);
    const body = bodySchema.parse(await request.json());
    if (!body.groupId) {
      return idempotentJson(
        request,
        {
          ownerUserId: viewer.id,
          scope: "personal-expense.create",
          requestBody: body,
        },
        async (idempotencyKey) => {
          const created = await createPersonalWalletTransaction(viewer.id, {
            idempotencyKey,
            title: body.title,
            amountFen: body.amountFen,
            currency: "CNY",
            occurredAt: new Date(body.occurredAt),
            direction: "outflow",
            category: body.category,
            merchant: "Manual entry",
          });
          const snapshot = await getUiDashboardSnapshot(viewer, "personal", undefined, body.month);
          return {
            body: { snapshot, message: "Personal expense added." },
            status: created.created ? 201 : 200,
            resourceType: "wallet_transaction",
            resourceId: created.id,
          };
        },
      );
    }
    const groupId = body.groupId;

    return idempotentJson(
      request,
      {
        ownerUserId: viewer.id,
        scope: "group-expense.create",
        requestBody: body,
      },
      async (idempotencyKey) => {
        const raw = await getDashboardSnapshot(viewer.id, "group", groupId);
        if (!raw.group) throw conflict("The selected group could not be found.");
        const occurredAt = new Date(body.occurredAt);
        const payer = raw.group.members.find((member) => member.userId === viewer.id);
        if (!payer) throw conflict("Your account is not a member of this group.");

        const allowedMemberIds = new Set(raw.group.members.map((member) => member.id));
        const requestedMembers = body.participantIds.length
          ? [...new Set(body.participantIds)]
          : raw.group.members.map((member) => member.id);
        if (requestedMembers.some((memberId) => !allowedMemberIds.has(memberId))) {
          throw conflict("A selected participant is no longer in this group.");
        }
        if (!requestedMembers.length) throw conflict("Add at least one participant.");
        if (requestedMembers.length > MAX_EXPENSE_SHARES) {
          throw conflict(
            `An expense can include at most ${MAX_EXPENSE_SHARES} participants. Select a smaller group.`,
          );
        }

        const baseShareFen = Math.floor(body.amountFen / requestedMembers.length);
        const remainderFen = body.amountFen % requestedMembers.length;
        const created = await createExpenseWithShares(viewer.id, {
          groupId,
          title: body.title,
          category: body.category,
          amountFen: body.amountFen,
          currency: "CNY",
          occurredAt,
          paidByMemberId: payer.id,
          source: "manual",
          idempotencyKey,
          shares: requestedMembers.map((memberId, index) => ({
            memberId,
            amountFen: baseShareFen + (index < remainderFen ? 1 : 0),
          })),
        });

        const snapshot = await getUiDashboardSnapshot(viewer, "group", groupId, body.month);
        return {
          body: { snapshot, message: "Expense added and balances updated." },
          status: 201,
          resourceType: "expense",
          resourceId: created.id,
        };
      },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
