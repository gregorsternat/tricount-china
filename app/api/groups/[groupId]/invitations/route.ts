import { z } from "zod";

import { isMonthKey } from "@/lib/dashboard/period";
import { inviteGroupMember } from "@/lib/server/dal";
import { requireAuthenticatedUser } from "@/lib/server/auth-session";
import { idempotentJson } from "@/lib/server/idempotent-json";
import { derivePrivateInvitationCredentials } from "@/lib/server/invitations";
import { normalizeEmail } from "@/lib/server/private-signup-policy";
import { requireSameOrigin, toErrorResponse } from "@/lib/server/request-security";
import { getUiDashboardSnapshot } from "@/lib/server/ui-dashboard";

const bodySchema = z.object({
  email: z.email(),
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
    const email = normalizeEmail(body.email);

    return idempotentJson(
      request,
      {
        ownerUserId: viewer.id,
        scope: "group.invitation.create",
        requestBody: { groupId, email },
      },
      async (idempotencyKey) => {
        const result = await inviteGroupMember(viewer.id, groupId, {
          email,
          idempotencyKey,
        });
        const snapshot = await getUiDashboardSnapshot(viewer, "group", groupId, body.month);

        if (result.kind === "existing-user") {
          return {
            body: {
              snapshot,
              message: `${email} was added to the group.`,
            },
            resourceType: "group_member",
            resourceId: result.membership.id,
          };
        }

        const message = `Invitation created for ${email}.`;
        return {
          body: {
            snapshot,
            invitationUrl: buildInvitationUrl(request.url, result.token, email),
            message,
          },
          replayBody: {
            snapshot,
            message,
            invitationReplay: {
              invitationId: result.invitationId,
              email,
              role: result.role,
            },
          },
          status: 201,
          resourceType: "invitation",
          resourceId: result.invitationId,
        };
      },
      async ({ idempotencyKey, responseBody }) => {
        if (!isInvitationReplayBody(responseBody)) return responseBody;
        const credentials = await derivePrivateInvitationCredentials({
          groupId,
          inviterUserId: viewer.id,
          email: responseBody.invitationReplay.email,
          role: responseBody.invitationReplay.role,
          idempotencyKey,
        });
        if (credentials.invitationId !== responseBody.invitationReplay.invitationId) {
          throw new Error("Stored invitation replay metadata is inconsistent.");
        }
        return {
          snapshot: responseBody.snapshot,
          invitationUrl: buildInvitationUrl(
            request.url,
            credentials.token,
            responseBody.invitationReplay.email,
          ),
          message: responseBody.message,
        };
      },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

function buildInvitationUrl(requestUrl: string, token: string, email: string): string {
  const url = new URL("/join", requestUrl);
  url.searchParams.set("token", token);
  url.searchParams.set("email", email);
  return url.toString();
}

function isInvitationReplayBody(value: unknown): value is {
  snapshot: unknown;
  message: string;
  invitationReplay: {
    invitationId: string;
    email: string;
    role: "admin" | "member";
  };
} {
  if (!value || typeof value !== "object") return false;
  const replay = (value as { invitationReplay?: unknown }).invitationReplay;
  if (!replay || typeof replay !== "object") return false;
  const candidate = replay as Record<string, unknown>;
  return (
    typeof candidate.invitationId === "string" &&
    typeof candidate.email === "string" &&
    (candidate.role === "admin" || candidate.role === "member") &&
    typeof (value as { message?: unknown }).message === "string"
  );
}
