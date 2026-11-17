import { internalError, postVaultQuote } from "@floats/api/handlers.ts";
import { getApiContext } from "@/server/api-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    return await postVaultQuote(getApiContext(), request);
  } catch {
    return internalError();
  }
}
