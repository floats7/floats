import { getLatestIndexState, internalError } from "@floats/api/handlers.ts";
import { getApiContext } from "@/server/api-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    return await getLatestIndexState(getApiContext(), request.signal);
  } catch {
    return internalError();
  }
}
