import { getPublicConfig, internalError } from "@floats/api/handlers.ts";
import { getApiContext } from "@/server/api-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return await getPublicConfig(getApiContext());
  } catch {
    return internalError();
  }
}
