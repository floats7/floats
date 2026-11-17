import { NextResponse, type NextRequest } from "next/server";
import { RESTRICTED_COUNTRIES } from "@/lib/constants";
import { takeRateLimit } from "@/lib/rate-limit";

const COUNTRY_HEADER = "x-vercel-ip-country";

/** Redirects visitors from restricted jurisdictions to the notice page. */
export function proxy(request: NextRequest) {
  const country = request.headers.get(COUNTRY_HEADER);

  if (country && RESTRICTED_COUNTRIES.has(country)) {
    return NextResponse.rewrite(new URL("/restricted", request.url));
  }

  const limit = sensitiveEndpointLimit(request);
  const clientIp = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  if (limit && clientIp) {
    const result = takeRateLimit(`${clientIp}:${request.nextUrl.pathname}`, limit);
    if (!result.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED" } },
        {
          status: 429,
          headers: {
            "cache-control": "no-store",
            "retry-after": Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1_000)).toString(),
            "x-ratelimit-limit": limit.toString(),
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": Math.ceil(result.resetAt / 1_000).toString(),
          },
        },
      );
    }
  }
  return NextResponse.next();
}

function sensitiveEndpointLimit(request: NextRequest): number | null {
  if (request.nextUrl.pathname === "/api/wallet-history") return 10;
  if (request.nextUrl.pathname === "/api/quote" && request.method === "POST") return 60;
  return null;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|restricted).*)"],
};
