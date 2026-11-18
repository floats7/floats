export interface OptionsPayoffTerms {
  readonly kind: "capped-call" | "put";
  readonly strikeUsd18: bigint;
  readonly capUsd18: bigint;
  readonly contractSize18: bigint;
}

export function optionPayoffUsd18(terms: OptionsPayoffTerms, settlementUsd18: bigint): bigint {
  if (settlementUsd18 < 0n || terms.strikeUsd18 <= 0n || terms.contractSize18 <= 0n) {
    throw new Error("Invalid option payoff input");
  }
  let payoffPerUnderlying: bigint;
  if (terms.kind === "capped-call") {
    if (terms.capUsd18 <= terms.strikeUsd18) throw new Error("Invalid capped-call terms");
    payoffPerUnderlying = settlementUsd18 <= terms.strikeUsd18
      ? 0n
      : minimum(settlementUsd18 - terms.strikeUsd18, terms.capUsd18 - terms.strikeUsd18);
  } else {
    payoffPerUnderlying = settlementUsd18 < terms.strikeUsd18
      ? terms.strikeUsd18 - settlementUsd18
      : 0n;
  }
  return payoffPerUnderlying * terms.contractSize18 / 10n ** 18n;
}

export function maximumOptionPayoffUsd18(terms: OptionsPayoffTerms): bigint {
  const maximumPerUnderlying = terms.kind === "capped-call"
    ? terms.capUsd18 - terms.strikeUsd18
    : terms.strikeUsd18;
  if (maximumPerUnderlying <= 0n || terms.contractSize18 <= 0n) {
    throw new Error("Invalid option payoff terms");
  }
  return maximumPerUnderlying * terms.contractSize18 / 10n ** 18n;
}

function minimum(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}
