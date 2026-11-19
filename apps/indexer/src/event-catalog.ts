import { decodeFloatsCoreLog, FLOATS_CORE_EVENT_TOPICS, type RawEvmLog } from "./event-decoder.ts";
import { decodeOftLog, OFT_EVENT_TOPICS } from "./oft-event-decoder.ts";
import { decodeNavMessageLog, NAV_MESSAGE_TOPICS } from "./nav-message-decoder.ts";
import type { Hex } from "./types.ts";

export interface EventCatalog {
  readonly topics: readonly Hex[];
  requiresTransactionInput(log: RawEvmLog): boolean;
  decode(
    log: RawEvmLog,
    transactionInput?: Hex,
  ): { readonly eventName: string; readonly payload: Readonly<Record<string, unknown>> } | undefined;
}

export const FLOATS_CORE_EVENT_CATALOG: EventCatalog = {
  topics: FLOATS_CORE_EVENT_TOPICS,
  requiresTransactionInput: () => false,
  decode: (log) => decodeFloatsCoreLog(log),
};

export const FLOATS_OFT_EVENT_CATALOG: EventCatalog = {
  topics: OFT_EVENT_TOPICS,
  requiresTransactionInput: (log) =>
    log.topics[0]?.toLowerCase() === OFT_EVENT_TOPICS[0].toLowerCase(),
  decode: (log, transactionInput) => decodeOftLog(log, transactionInput),
};

export const FLOATS_CROSSCHAIN_EVENT_CATALOG: EventCatalog = {
  topics: [...OFT_EVENT_TOPICS, ...NAV_MESSAGE_TOPICS],
  requiresTransactionInput: (log) =>
    log.topics[0]?.toLowerCase() === OFT_EVENT_TOPICS[0].toLowerCase(),
  decode: (log, transactionInput) =>
    decodeOftLog(log, transactionInput) ?? decodeNavMessageLog(log),
};
