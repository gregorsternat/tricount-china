import { toErrorResponse } from "@/lib/server/request-security";

import { createImportApiDependencies } from "../_lib/dependencies";
import {
  hardenImportErrorResponse,
  toWalletImportErrorResponse,
} from "../_lib/error-response";
import { handleImportPreview } from "../_lib/service";

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleImportPreview(request, createImportApiDependencies());
  } catch (error) {
    return hardenImportErrorResponse(
      toWalletImportErrorResponse(error) ?? toErrorResponse(error),
    );
  }
}
