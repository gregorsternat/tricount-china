import { z } from "zod";

import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  SUPPORTED_LOCALES,
} from "@/lib/i18n/config";
import {
  requireSameOrigin,
  toErrorResponse,
} from "@/lib/server/request-security";

const bodySchema = z
  .object({ locale: z.enum(SUPPORTED_LOCALES) })
  .strict();

function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { locale } = bodySchema.parse(await request.json());
    const response = Response.json({ locale });
    response.headers.append(
      "Set-Cookie",
      [
        `${LOCALE_COOKIE}=${locale}`,
        `Max-Age=${LOCALE_COOKIE_MAX_AGE}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
      ].join("; "),
    );
    return noStore(response);
  } catch (error) {
    return noStore(toErrorResponse(error));
  }
}
