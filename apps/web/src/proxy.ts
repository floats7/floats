import { NextResponse, type NextRequest } from "next/server";
import { RESTRICTED_COUNTRIES } from "@/lib/constants";

const COUNTRY_HEADERS = ["cf-ipcountry", "x-vercel-ip-country", "cloudfront-viewer-country"] as const;
const RESTRICTED_PAGES = new Set(["/trade", "/portfolio", "/options"]);

/** Blocks transactional surfaces while leaving public methodology and risk information readable. */
export function proxy(request: NextRequest) {
  const country = readCountryCode(request);

  if (country && RESTRICTED_COUNTRIES.has(country)) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "JURISDICTION_RESTRICTED" } },
        { status: 451, headers: { "cache-control": "private, no-store" } },
      );
    }
    if (
      RESTRICTED_PAGES.has(request.nextUrl.pathname)
        || request.nextUrl.pathname.startsWith("/markets/")
    ) {
      return NextResponse.rewrite(new URL("/restricted", request.url), {
        headers: { "cache-control": "private, no-store" },
      });
    }
  }

  return NextResponse.next();
}

function readCountryCode(request: NextRequest): string | null {
  for (const header of COUNTRY_HEADERS) {
    const value = request.headers.get(header)?.trim().toUpperCase();
    if (value && /^[A-Z]{2}$/.test(value)) return value;
  }
  return null;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|restricted).*)"],
};
