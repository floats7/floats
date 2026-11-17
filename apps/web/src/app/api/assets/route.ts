import { getAssets, internalError } from "@floats/api/handlers.ts";
import { getApiContext } from "@/server/api-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    return await getAssets(getApiContext(), request.signal);
  } catch {
    return internalError();
  }
}
