const TRUSTED_ASSET_HOSTS = new Set([
  "www.anthropic.com",
  "anthropic.com",
  "openai.com",
  "www.openai.com",
  "www.spacex.com",
  "static.figma.com",
  "www.navan.com",
  "navan.com",
  "cdn.sanity.io",
  "cdn.prod.website-files.com",
  "fireflyspace.com",
  "www.google.com",
  "t0.gstatic.com",
  "cdn.robinhood.com",
]);

/** Limits dynamic market logos to reviewed HTTPS sources or same-origin assets. */
export function trustedAssetUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("/") && !value.startsWith("//")) return value;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !TRUSTED_ASSET_HOSTS.has(url.hostname.toLowerCase())) {
      return undefined;
    }
    if (url.hostname.toLowerCase() === "www.google.com" && url.pathname === "/s2/favicons") {
      return googleFaviconAssetUrl(url);
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function googleFaviconAssetUrl(source: URL): string | undefined {
  const domain = source.searchParams.get("domain")?.trim().toLowerCase();
  if (!domain || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    return undefined;
  }
  const requestedSize = Number(source.searchParams.get("sz") ?? "128");
  const size = Number.isSafeInteger(requestedSize) && requestedSize >= 16 && requestedSize <= 256
    ? requestedSize
    : 128;
  const target = new URL("https://t0.gstatic.com/faviconV2");
  target.search = new URLSearchParams({
    client: "SOCIAL",
    type: "FAVICON",
    fallback_opts: "TYPE,SIZE,URL",
    url: `https://${domain}`,
    size: String(size),
  }).toString();
  return target.toString();
}
