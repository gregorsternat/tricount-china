import { toErrorResponse } from "@/lib/server/request-security";

import { createImportApiDependencies } from "./_lib/dependencies";
import {
  hardenImportErrorResponse,
  toWalletImportErrorResponse,
} from "./_lib/error-response";
import { handleImportHistory } from "./_lib/service";

export async function GET(request: Request): Promise<Response> {
  try {
    return await handleImportHistory(request, createImportApiDependencies());
  } catch (error) {
    return hardenImportErrorResponse(
      toWalletImportErrorResponse(error) ?? toErrorResponse(error),
    );
  }
}
