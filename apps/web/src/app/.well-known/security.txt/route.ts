const SECURITY_TEXT = `Contact: mailto:security@floats.trade
Canonical: https://floats.trade/.well-known/security.txt
Policy: https://floats.trade/security
Preferred-Languages: en
Expires: 2027-11-19T00:00:00.000Z
`;

export function GET(): Response {
  return new Response(SECURITY_TEXT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
