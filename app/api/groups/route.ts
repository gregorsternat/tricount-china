import { z } from "zod";

import { createGroup, inviteGroupMember } from "@/lib/server/dal";
import { requireAuthenticatedUser } from "@/lib/server/auth-session";
import { idempotentJson } from "@/lib/server/idempotent-json";
import { derivePrivateInvitationCredentials } from "@/lib/server/invitations";
import { requireSameOrigin, toErrorResponse } from "@/lib/server/request-security";
import { getUiDashboardSnapshot } from "@/lib/server/ui-dashboard";
import { normalizeEmail } from "@/lib/server/private-signup-policy";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  city: z.string().trim().min(1).max(100),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  inviteEmails: z.array(z.email()).max(4).default([]),
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const viewer = await requireAuthenticatedUser(request.headers);
    const body = bodySchema.parse(await request.json());
    return idempotentJson(
      request,
      {
        ownerUserId: viewer.id,
        scope: "group.create",
        requestBody: body,
      },
      async (idempotencyKey) => {
        const startsAt = new Date(`${body.startsOn}T00:00:00+08:00`);
        const endsAt = new Date(`${body.endsOn}T23:59:59.999+08:00`);
        const group = await createGroup({
          ownerUserId: viewer.id,
          name: body.name,
          description: body.city,
          color: "#c9ff63",
          baseCurrency: "CNY",
          timezone: "Asia/Shanghai",
          academicYearLabel: `${body.startsOn.slice(0, 4)}–${body.endsOn.slice(0, 4)}`,
          startsAt,
          endsAt,
          idempotencyKey,
        });

        const invitationUrls: string[] = [];
        const invitationEmails: string[] = [];
        const normalizedInviteEmails = [
          ...new Set(body.inviteEmails.map(normalizeEmail)),
        ];
        for (const email of normalizedInviteEmails) {
          const invitation = await inviteGroupMember(viewer.id, group.id, {
            email,
            idempotencyKey,
          });
          if (invitation.kind === "invitation") {
            const invitationUrl = new URL("/join", request.url);
            invitationUrl.searchParams.set("token", invitation.token);
            invitationUrl.searchParams.set("email", email);
            invitationUrls.push(invitationUrl.toString());
            invitationEmails.push(email);
          }
        }

        const snapshot = await getUiDashboardSnapshot(viewer, "group", group.id);
        const responseBody = {
          snapshot,
          invitationUrls,
          message: invitationUrls.length
            ? `Tricount créé · ${invitationUrls.length} invitation${invitationUrls.length > 1 ? "s" : ""} à partager.`
            : "Tricount créé.",
        };
        return {
          body: responseBody,
          // Store only the inputs required to re-derive bearer credentials.
          replayBody: {
            snapshot,
            message: responseBody.message,
            invitationReplay: { groupId: group.id, emails: invitationEmails },
          },
          status: 201,
          resourceType: "group",
          resourceId: group.id,
        };
      },
      async ({ idempotencyKey, responseBody }) => {
        if (!isGroupInvitationReplayBody(responseBody)) return responseBody;
        const invitationUrls = await Promise.all(
          responseBody.invitationReplay.emails.map(async (email) => {
            const credentials = await derivePrivateInvitationCredentials({
              groupId: responseBody.invitationReplay.groupId,
              inviterUserId: viewer.id,
              email,
              idempotencyKey,
            });
            const url = new URL("/join", request.url);
            url.searchParams.set("token", credentials.token);
            url.searchParams.set("email", email);
            return url.toString();
          }),
        );
        return {
          snapshot: responseBody.snapshot,
          invitationUrls,
          message: responseBody.message,
        };
      },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

function isGroupInvitationReplayBody(value: unknown): value is {
  snapshot: unknown;
  message: string;
  invitationReplay: { groupId: string; emails: string[] };
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    message?: unknown;
    invitationReplay?: { groupId?: unknown; emails?: unknown };
  };
  return (
    typeof candidate.message === "string" &&
    typeof candidate.invitationReplay?.groupId === "string" &&
    Array.isArray(candidate.invitationReplay.emails) &&
    candidate.invitationReplay.emails.every((email) => typeof email === "string")
  );
}
