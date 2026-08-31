import { z } from "zod";

import { requireAuthenticatedUser } from "@/lib/server/auth-session";
import { claimInvitationForUser } from "@/lib/server/invitations";
import { requireSameOrigin, toErrorResponse } from "@/lib/server/request-security";

const bodySchema = z
  .object({
    token: z.string().min(32).max(512),
  })
  .strict();

function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const viewer = await requireAuthenticatedUser(request.headers);
    const body = bodySchema.parse(await request.json());
    const result = await claimInvitationForUser(
      viewer.id,
      viewer.email,
      body.token,
    );

    return noStore(Response.json(result));
  } catch (error) {
    return noStore(toErrorResponse(error));
  }
}
