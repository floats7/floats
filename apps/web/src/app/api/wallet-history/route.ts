import { getWalletChallenge, internalError, postWalletHistory } from "@floats/api/handlers.ts";
import { getApiContext } from "@/server/api-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    return await getWalletChallenge(getApiContext(), request);
  } catch {
    return internalError();
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await postWalletHistory(getApiContext(), request);
  } catch {
    return internalError();
  }
}
