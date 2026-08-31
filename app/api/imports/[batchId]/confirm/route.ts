import { toErrorResponse } from "@/lib/server/request-security";

import { createImportApiDependencies } from "../../_lib/dependencies";
import {
  hardenImportErrorResponse,
  toWalletImportErrorResponse,
} from "../../_lib/error-response";
import { handleImportConfirmation } from "../../_lib/service";

interface ConfirmRouteContext {
  readonly params: Promise<{ batchId: string }>;
}

export async function POST(
  request: Request,
  context: ConfirmRouteContext,
): Promise<Response> {
  try {
    const { batchId } = await context.params;
    return await handleImportConfirmation(
      request,
      batchId,
      createImportApiDependencies(),
    );
  } catch (error) {
    return hardenImportErrorResponse(
      toWalletImportErrorResponse(error) ?? toErrorResponse(error),
    );
  }
}
