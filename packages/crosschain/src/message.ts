export type Hex = `0x${string}`;
export type Address = `0x${string}`;

export type CrossChainMessageState = "pending" | "delivered" | "retryable" | "failed";

export type CrossChainMessageEvent =
  | { readonly type: "delivery_confirmed"; readonly observedAt: Date }
  | { readonly type: "execution_failed"; readonly observedAt: Date; readonly retryable: boolean }
  | { readonly type: "retry_submitted"; readonly observedAt: Date };

export interface CrossChainMessage {
  readonly guid: Hex;
  readonly sourceEid: number;
  readonly destinationEid: number;
  readonly sender: Address;
  readonly recipient: Address;
  readonly token: Address;
  readonly amountLocal: bigint;
  readonly nativeFee: bigint;
  readonly state: CrossChainMessageState;
  readonly sentAt: Date;
  readonly updatedAt: Date;
  readonly transactionHash: Hex;
}

const transitions: Readonly<
  Record<CrossChainMessageState, ReadonlySet<CrossChainMessageEvent["type"]>>
> = {
  pending: new Set(["delivery_confirmed", "execution_failed"]),
  retryable: new Set(["delivery_confirmed", "retry_submitted"]),
  delivered: new Set(),
  failed: new Set(),
};

export function createPendingMessage(
  input: Omit<CrossChainMessage, "state" | "updatedAt">,
): CrossChainMessage {
  validateMessageIdentity(input);
  if (input.amountLocal <= 0n) throw new Error("CROSSCHAIN_AMOUNT_MUST_BE_POSITIVE");
  if (input.nativeFee < 0n) throw new Error("CROSSCHAIN_FEE_MUST_BE_NON_NEGATIVE");
  if (!isValidDate(input.sentAt)) throw new Error("CROSSCHAIN_SENT_AT_INVALID");
  return { ...input, state: "pending", updatedAt: input.sentAt };
}

export function transitionMessage(
  message: CrossChainMessage,
  event: CrossChainMessageEvent,
): CrossChainMessage {
  if (!transitions[message.state].has(event.type)) {
    throw new Error(`CROSSCHAIN_INVALID_TRANSITION:${message.state}:${event.type}`);
  }
  if (!isValidDate(event.observedAt) || event.observedAt < message.updatedAt) {
    throw new Error("CROSSCHAIN_EVENT_TIME_INVALID");
  }

  const state = nextState(event);
  return { ...message, state, updatedAt: event.observedAt };
}

export function crossChainMessageKey(message: Pick<CrossChainMessage, "sourceEid" | "guid">): string {
  validatePositiveInteger(message.sourceEid, "sourceEid");
  validateHash(message.guid, "guid");
  return `${message.sourceEid}:${message.guid.toLowerCase()}`;
}

function nextState(event: CrossChainMessageEvent): CrossChainMessageState {
  if (event.type === "delivery_confirmed") return "delivered";
  if (event.type === "retry_submitted") return "pending";
  return event.retryable ? "retryable" : "failed";
}

function validateMessageIdentity(
  input: Pick<
    CrossChainMessage,
    | "guid"
    | "sourceEid"
    | "destinationEid"
    | "sender"
    | "recipient"
    | "token"
    | "transactionHash"
  >,
): void {
  validateHash(input.guid, "guid");
  validateHash(input.transactionHash, "transactionHash");
  validatePositiveInteger(input.sourceEid, "sourceEid");
  validatePositiveInteger(input.destinationEid, "destinationEid");
  if (input.sourceEid === input.destinationEid) {
    throw new Error("CROSSCHAIN_SOURCE_EQUALS_DESTINATION");
  }
  validateAddress(input.sender, "sender");
  validateAddress(input.recipient, "recipient");
  validateAddress(input.token, "token");
}

function validateHash(value: string, label: string): void {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`CROSSCHAIN_${label.toUpperCase()}_INVALID`);
}

function validateAddress(value: string, label: string): void {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/i.test(value)) {
    throw new Error(`CROSSCHAIN_${label.toUpperCase()}_INVALID`);
  }
}

function validatePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`CROSSCHAIN_${label.toUpperCase()}_INVALID`);
  }
}

function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}
