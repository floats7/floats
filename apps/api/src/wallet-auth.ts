import { randomBytes } from "node:crypto";
import { verifyMessage, type Address, type Hex } from "viem";

const CHALLENGE_TTL_MS = 5 * 60 * 1_000;
const NONCE_PATTERN = /^[a-f0-9]{32}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const SIGNATURE_PATTERN = /^0x[0-9a-fA-F]{130}$/;

export const WALLET_NONCE_COOKIE = "floats_wallet_nonce";

interface ChallengeFields {
  readonly domain: string;
  readonly origin: string;
  readonly address: string;
  readonly chainId: number;
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expirationTime: string;
}

export function createWalletChallenge(requestUrl: URL, address: string, chainId: number): {
  readonly message: string;
  readonly nonce: string;
  readonly expiresAt: string;
} {
  if (!ADDRESS_PATTERN.test(address)) throw new Error("Invalid wallet address");
  const issuedAt = new Date();
  const expirationTime = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
  const nonce = randomBytes(16).toString("hex");
  const fields: ChallengeFields = {
    domain: requestUrl.host,
    origin: requestUrl.origin,
    address: address.toLowerCase(),
    chainId,
    nonce,
    issuedAt: issuedAt.toISOString(),
    expirationTime: expirationTime.toISOString(),
  };
  return { message: formatChallenge(fields), nonce, expiresAt: fields.expirationTime };
}

export async function verifyWalletChallenge(options: {
  readonly requestUrl: URL;
  readonly message: string;
  readonly signature: string;
  readonly cookieNonce: string | null;
  readonly chainId: number;
}): Promise<string | null> {
  const fields = parseChallenge(options.message);
  if (!fields || !options.cookieNonce || !NONCE_PATTERN.test(options.cookieNonce)) return null;
  if (fields.nonce !== options.cookieNonce || fields.chainId !== options.chainId) return null;
  if (fields.domain !== options.requestUrl.host || fields.origin !== options.requestUrl.origin) return null;
  if (formatChallenge(fields) !== options.message || !SIGNATURE_PATTERN.test(options.signature)) return null;

  const issuedAt = Date.parse(fields.issuedAt);
  const expirationTime = Date.parse(fields.expirationTime);
  const now = Date.now();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expirationTime)) return null;
  if (issuedAt > now + 30_000 || expirationTime <= now || expirationTime - issuedAt !== CHALLENGE_TTL_MS) return null;

  const valid = await verifyMessage({
    address: fields.address as Address,
    message: options.message,
    signature: options.signature as Hex,
  });
  return valid ? fields.address : null;
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0) continue;
    if (segment.slice(0, separator).trim() === name) return segment.slice(separator + 1).trim();
  }
  return null;
}

function formatChallenge(fields: ChallengeFields): string {
  return `${fields.domain} wants you to sign in with your Ethereum account:\n${fields.address}\n\nAuthorize read-only access to your Floats account data.\n\nURI: ${fields.origin}\nVersion: 1\nChain ID: ${fields.chainId}\nNonce: ${fields.nonce}\nIssued At: ${fields.issuedAt}\nExpiration Time: ${fields.expirationTime}`;
}

function parseChallenge(message: string): ChallengeFields | null {
  const match = /^(\S+) wants you to sign in with your Ethereum account:\n(0x[0-9a-f]{40})\n\nAuthorize read-only access to your Floats account data\.\n\nURI: (https?:\/\/\S+)\nVersion: 1\nChain ID: ([1-9][0-9]*)\nNonce: ([a-f0-9]{32})\nIssued At: (\S+)\nExpiration Time: (\S+)$/.exec(message);
  if (!match) return null;
  const chainId = Number(match[4]);
  if (!Number.isSafeInteger(chainId)) return null;
  return {
    domain: match[1]!,
    address: match[2]!,
    origin: match[3]!,
    chainId,
    nonce: match[5]!,
    issuedAt: match[6]!,
    expirationTime: match[7]!,
  };
}
