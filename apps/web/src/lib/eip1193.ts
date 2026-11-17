export interface Eip1193RequestArguments {
  readonly method: string;
  readonly params?: readonly unknown[] | Readonly<Record<string, unknown>>;
}

export interface Eip1193Provider {
  request<T = unknown>(arguments_: Eip1193RequestArguments): Promise<T>;
  on?(event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void): void;
  removeListener?(event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}
