export const ZATOSHIS_PER_ZEC = 100_000_000n;
export const MAX_ZCASH_SUPPLY_ZATOSHIS = 2_100_000_000_000_000n;
export const MAX_AMOUNT_CODE_ZATOSHIS = 9_999n;

export class MoneyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyInputError";
  }
}

export function parseZcashAmountToZatoshis(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(value)) {
    throw new MoneyInputError(
      "Enter a positive amount with no more than eight decimal places.",
    );
  }

  const [wholePart, fractionalPart = ""] = value.split(".");
  const zatoshis =
    BigInt(wholePart) * ZATOSHIS_PER_ZEC +
    BigInt(fractionalPart.padEnd(8, "0") || "0");

  if (zatoshis <= 0n) {
    throw new MoneyInputError("The amount must be greater than zero.");
  }

  if (zatoshis > MAX_ZCASH_SUPPLY_ZATOSHIS - MAX_AMOUNT_CODE_ZATOSHIS) {
    throw new MoneyInputError(
      "The amount is outside the supported Zcash range.",
    );
  }

  return zatoshis;
}

export function formatZatoshis(zatoshis: bigint): string {
  if (zatoshis < 0n || zatoshis > MAX_ZCASH_SUPPLY_ZATOSHIS) {
    throw new MoneyInputError(
      "The zatoshi amount is outside the supported range.",
    );
  }

  const wholePart = zatoshis / ZATOSHIS_PER_ZEC;
  const fractionalPart = (zatoshis % ZATOSHIS_PER_ZEC)
    .toString()
    .padStart(8, "0");

  return `${wholePart}.${fractionalPart}`;
}
