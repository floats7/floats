import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface RailwayDeployment {
  readonly status?: string;
  readonly instances?: readonly { readonly status?: string }[];
}

interface RailwayServiceInstance {
  readonly serviceName?: string;
  readonly activeDeployments?: readonly RailwayDeployment[];
  readonly domains?: {
    readonly customDomains?: readonly { readonly domain?: string }[];
    readonly serviceDomains?: readonly { readonly domain?: string }[];
  };
}

interface RailwayEnvironment {
  readonly id?: string;
  readonly name?: string;
  readonly serviceInstances?: {
    readonly edges?: readonly { readonly node?: RailwayServiceInstance }[];
  };
}

interface RailwayStatus {
  readonly id?: string;
  readonly name?: string;
  readonly environments?: {
    readonly edges?: readonly { readonly node?: RailwayEnvironment }[];
  };
}

function safeText(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value : fallback;
}

function summarize(payload: RailwayStatus) {
  return {
    project: {
      id: safeText(payload.id, "unknown"),
      name: safeText(payload.name, "unknown"),
    },
    environments: (payload.environments?.edges ?? []).map(({ node: environment }) => ({
      id: safeText(environment?.id, "unknown"),
      name: safeText(environment?.name, "unknown"),
      services: (environment?.serviceInstances?.edges ?? []).map(({ node: instance }) => ({
        name: safeText(instance?.serviceName, "unknown"),
        deploymentStatus: instance?.activeDeployments?.[0]?.status ?? "none",
        instanceStatuses: (instance?.activeDeployments?.[0]?.instances ?? [])
          .map(({ status }) => safeText(status, "unknown")),
        customDomains: (instance?.domains?.customDomains ?? [])
          .map(({ domain }) => safeText(domain, "unknown")),
        railwayDomains: (instance?.domains?.serviceDomains ?? [])
          .map(({ domain }) => safeText(domain, "unknown")),
      })),
    })),
  };
}

try {
  const { stdout } = await execFileAsync("railway", ["status", "--json"], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const payload = JSON.parse(stdout) as RailwayStatus;
  console.log(JSON.stringify(summarize(payload), null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown Railway topology inspection failure";
  console.error(`Railway topology inspection failed: ${message}`);
  process.exitCode = 1;
}
