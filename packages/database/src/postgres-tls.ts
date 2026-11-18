export interface PostgresTlsOptions {
  readonly rejectUnauthorized: boolean;
  readonly ca?: string;
}

/**
 * Supabase poolers can present a managed certificate chain that is not in the
 * Node runtime trust store. Transport encryption remains mandatory; operators
 * may additionally pin the project CA through SUPABASE_DB_CA_BASE64.
 */
export function postgresTls(caBase64?: string, requirePinnedCa = false): PostgresTlsOptions {
  const encoded = caBase64?.trim();
  if (!encoded) {
    if (requirePinnedCa) throw new Error("SUPABASE_DB_CA_BASE64 is required for mainnet");
    return { rejectUnauthorized: false };
  }
  const ca = Buffer.from(encoded, "base64").toString("utf8");
  if (!ca.includes("-----BEGIN CERTIFICATE-----") || !ca.includes("-----END CERTIFICATE-----")) {
    throw new Error("SUPABASE_DB_CA_BASE64 is not a PEM certificate");
  }
  return { rejectUnauthorized: true, ca };
}
