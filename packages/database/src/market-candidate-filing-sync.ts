export interface MarketCandidateFilingRoute {
  readonly candidateId: string;
  readonly legalNames: readonly string[];
}

export interface MarketCandidateFilingAlert {
  readonly severity: "critical";
  readonly code: "PUBLIC_S1_DETECTED";
  readonly candidateId: string;
  readonly registrantName: string;
  readonly cik: string;
  readonly formType: "S-1" | "S-1/A";
  readonly accessionNumber: string;
  readonly sourceUrl: string;
  readonly observedAt: string;
}

export interface MarketCandidateFilingSyncConfig {
  readonly databaseUrl: URL;
  readonly secretKey: string;
  readonly environment: "testnet" | "mainnet";
  readonly chainId: number;
  readonly secUserAgent: string;
  readonly filingRoutes: readonly MarketCandidateFilingRoute[];
  readonly fetch?: typeof globalThis.fetch;
  readonly onAlert?: (alert: MarketCandidateFilingAlert) => Promise<void>;
}

interface SecCompany {
  readonly cik_str?: number;
  readonly title?: string;
}

interface SecSubmissions {
  readonly name?: string;
  readonly filings?: {
    readonly recent?: {
      readonly accessionNumber?: readonly string[];
      readonly filingDate?: readonly string[];
      readonly form?: readonly string[];
      readonly primaryDocument?: readonly string[];
    };
  };
}

export function parseCandidateFilingRoutes(raw: string | undefined): readonly MarketCandidateFilingRoute[] {
  if (!raw?.trim()) return [];
  const input: unknown = JSON.parse(raw);
  if (!Array.isArray(input)) throw new Error("MARKET_CANDIDATE_SEC_FILINGS_JSON must be an array");
  const candidateIds = new Set<string>();
  return input.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid SEC filing route");
    const row = value as Record<string, unknown>;
    if (typeof row.candidateId !== "string" || !/^[a-z0-9-]{1,80}$/.test(row.candidateId)) throw new Error("Invalid SEC filing candidateId");
    if (!Array.isArray(row.legalNames) || row.legalNames.length === 0
        || row.legalNames.some((name) => typeof name !== "string" || name.trim().length < 2)) {
      throw new Error("SEC filing route requires legalNames");
    }
    if (candidateIds.has(row.candidateId)) throw new Error("Duplicate SEC filing candidateId");
    candidateIds.add(row.candidateId);
    return { candidateId: row.candidateId, legalNames: [...new Set(row.legalNames.map((name) => (name as string).trim()))] };
  });
}

export async function syncCandidateFilings(config: MarketCandidateFilingSyncConfig): Promise<number> {
  validate(config);
  if (config.filingRoutes.length === 0) return 0;
  const request = config.fetch ?? globalThis.fetch;
  const companies = await loadSecCompanies(config, request);
  let detected = 0;

  for (const route of config.filingRoutes) {
    const company = findExactCompany(companies, route.legalNames);
    if (!company?.title || !Number.isSafeInteger(company.cik_str) || company.cik_str! <= 0) continue;
    const cik = String(company.cik_str).padStart(10, "0");
    const filing = await latestPublicS1(config, cik, request);
    if (!filing) continue;
    const inserted = await persistFiling(config, route.candidateId, company.title, cik, filing, request);
    if (!inserted) continue;
    detected += 1;
    await config.onAlert?.({
      severity: "critical",
      code: "PUBLIC_S1_DETECTED",
      candidateId: route.candidateId,
      registrantName: company.title,
      cik,
      formType: filing.formType,
      accessionNumber: filing.accessionNumber,
      sourceUrl: filing.sourceUrl,
      observedAt: new Date().toISOString(),
    });
  }
  return detected;
}

function findExactCompany(companies: readonly SecCompany[], legalNames: readonly string[]): SecCompany | undefined {
  const expected = new Set(legalNames.map(normalizeLegalName));
  return companies.find((company) => typeof company.title === "string" && expected.has(normalizeLegalName(company.title)));
}

function normalizeLegalName(value: string): string {
  return value.trim().toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ");
}

async function loadSecCompanies(config: MarketCandidateFilingSyncConfig, request: typeof globalThis.fetch): Promise<readonly SecCompany[]> {
  const response = await request("https://www.sec.gov/files/company_tickers.json", {
    headers: secHeaders(config),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`SEC company index returned ${response.status}`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  return Object.values(body as Record<string, SecCompany>);
}

async function latestPublicS1(config: MarketCandidateFilingSyncConfig, cik: string, request: typeof globalThis.fetch) {
  const response = await request(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: secHeaders(config),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`SEC submissions returned ${response.status}`);
  const body = await response.json() as SecSubmissions;
  const recent = body.filings?.recent;
  const forms = recent?.form ?? [];
  for (let index = 0; index < forms.length; index += 1) {
    const form = forms[index];
    if (form !== "S-1" && form !== "S-1/A") continue;
    const accessionNumber = recent?.accessionNumber?.[index];
    const filingDate = recent?.filingDate?.[index];
    const primaryDocument = recent?.primaryDocument?.[index];
    if (!accessionNumber || !/^\d{10}-\d{2}-\d{6}$/.test(accessionNumber)
        || !filingDate || !/^\d{4}-\d{2}-\d{2}$/.test(filingDate)
        || !primaryDocument || !/^[A-Za-z0-9._-]+$/.test(primaryDocument)) continue;
    const accessionPath = accessionNumber.replaceAll("-", "");
    return {
      formType: form,
      accessionNumber,
      filingDate,
      primaryDocument,
      sourceUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionPath}/${primaryDocument}`,
    } as const;
  }
  return null;
}

async function persistFiling(
  config: MarketCandidateFilingSyncConfig,
  candidateId: string,
  registrantName: string,
  cik: string,
  filing: NonNullable<Awaited<ReturnType<typeof latestPublicS1>>>,
  request: typeof globalThis.fetch,
): Promise<boolean> {
  const url = new URL("/rest/v1/market_candidate_filing_observations", config.databaseUrl);
  url.searchParams.set("on_conflict", "environment,chain_id,candidate_id,accession_number");
  const response = await request(url, {
    method: "POST",
    headers: databaseHeaders(config, "resolution=ignore-duplicates,return=representation"),
    body: JSON.stringify({
      environment: config.environment,
      chain_id: config.chainId,
      candidate_id: candidateId,
      cik,
      registrant_name: registrantName,
      form_type: filing.formType,
      accession_number: filing.accessionNumber,
      filing_date: filing.filingDate,
      primary_document: filing.primaryDocument,
      source_url: filing.sourceUrl,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Candidate filing persistence returned ${response.status}`);
  const body: unknown = await response.json();
  return Array.isArray(body) && body.length > 0;
}

function validate(config: MarketCandidateFilingSyncConfig): void {
  if (config.databaseUrl.protocol !== "https:") throw new Error("Candidate filing database URL must use HTTPS");
  if (!config.secretKey.startsWith("sb_secret_")) throw new Error("Candidate filing sync requires a server-only secret key");
  if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0) throw new Error("Candidate filing chain ID is invalid");
  if (!config.secUserAgent.includes("@") || config.secUserAgent.length < 8) throw new Error("SEC_USER_AGENT must identify Floats and a contact email");
}

function secHeaders(config: MarketCandidateFilingSyncConfig): Record<string, string> {
  return { accept: "application/json", "user-agent": config.secUserAgent };
}

function databaseHeaders(config: MarketCandidateFilingSyncConfig, prefer?: string): Record<string, string> {
  return { "content-type": "application/json", apikey: config.secretKey, ...(prefer ? { prefer } : {}) };
}
