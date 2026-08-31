import { z } from "zod";

import { requireAuthenticatedUser } from "@/lib/server/auth-session";
import { idempotentJson } from "@/lib/server/idempotent-json";
import { requireSameOrigin, toErrorResponse } from "@/lib/server/request-security";
import { getUiDashboardSnapshot } from "@/lib/server/ui-dashboard";
import { shareWalletTransactionWithGroup } from "@/lib/server/wallet-sharing";

const bodySchema = z.object({ groupId: z.string().min(1).max(160) });

export async function POST(
  request: Request,
  context: { params: Promise<{ transactionId: string }> },
) {
  try {
    requireSameOrigin(request);
    const viewer = await requireAuthenticatedUser(request.headers);
    const { transactionId } = await context.params;
    const body = bodySchema.parse(await request.json());
    return idempotentJson(
      request,
      {
        ownerUserId: viewer.id,
        scope: "wallet-transaction.share",
        requestBody: { transactionId, groupId: body.groupId },
      },
      async () => {
        const result = await shareWalletTransactionWithGroup(
          viewer.id,
          transactionId,
          body.groupId,
        );
        const snapshot = await getUiDashboardSnapshot(
          viewer,
          "personal",
          body.groupId,
        );
        return {
          body: {
            snapshot,
            message: result.replayed
              ? "Cette opération était déjà partagée."
              : "Opération partagée et soldes recalculés.",
          },
          resourceType: "expense",
          resourceId: result.expenseId,
        };
      },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
