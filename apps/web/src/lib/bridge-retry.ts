import type { CrossChainMessageDto, CrossChainRouteDto } from "./api-client";

export function safeBridgeRetryUrl(
  message: CrossChainMessageDto,
  routes: readonly CrossChainRouteDto[],
): string | null {
  if (message.state !== "retryable" || !/^0x[0-9a-fA-F]{64}$/.test(message.guid)) return null;
  const route = routes.find((candidate) =>
    candidate.sourceEid === message.sourceEid
    && candidate.destinationEid === message.destinationEid
  );
  if (!route) return null;

  let scan: URL;
  try {
    scan = new URL(route.layerZeroScanUrl);
  } catch {
    return null;
  }
  if (scan.protocol !== "https:" || scan.username || scan.password) return null;
  scan.pathname = `${scan.pathname.replace(/\/$/, "")}/tx/${message.guid}`;
  scan.search = "";
  scan.hash = "";
  return scan.toString();
}
