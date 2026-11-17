export interface SupabaseRestClientOptions {
  readonly baseUrl: URL;
  readonly secretKey: string;
  readonly fetch?: typeof globalThis.fetch;
}

export class BackendDataError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BackendDataError";
  }
}

export class SupabaseRestClient {
  readonly #baseUrl: URL;
  readonly #secretKey: string;
  readonly #fetch: typeof globalThis.fetch;

  public constructor(options: SupabaseRestClientOptions) {
    if (options.baseUrl.protocol !== "https:") {
      throw new Error("Supabase REST URL must use HTTPS");
    }
    if (!options.secretKey.startsWith("sb_secret_")) {
      throw new Error("Supabase REST client requires an sb_secret_ key");
    }

    this.#baseUrl = options.baseUrl;
    this.#secretKey = options.secretKey;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  public async select<T>(table: string, query: URLSearchParams, signal?: AbortSignal): Promise<T> {
    if (!/^[a-z][a-z0-9_]*$/.test(table)) throw new Error("Invalid table name");

    const url = new URL(`/rest/v1/${table}`, this.#baseUrl);
    url.search = query.toString();

    return this.request<T>(url, { method: "GET" }, signal);
  }

  public async rpc<T>(
    functionName: string,
    parameters: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!/^[a-z][a-z0-9_]*$/.test(functionName)) throw new Error("Invalid function name");
    const url = new URL(`/rest/v1/rpc/${functionName}`, this.#baseUrl);
    return this.request<T>(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parameters),
      },
      signal,
    );
  }

  private async request<T>(url: URL, init: RequestInit, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      headers.set("apikey", this.#secretKey);
      const request: RequestInit = {
        ...init,
        headers,
      };
      if (signal) request.signal = signal;
      response = await this.#fetch(url, request);
    } catch (error) {
      throw new BackendDataError("Database request failed", { cause: error });
    }

    if (!response.ok) {
      throw new BackendDataError(`Database request failed with status ${response.status}`);
    }

    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return undefined as T;
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new BackendDataError("Database returned an invalid response", { cause: error });
    }
  }
}
