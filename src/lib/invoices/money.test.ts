import { describe, expect, it } from "vitest";

import {
  formatZatoshis,
  MoneyInputError,
  parseZcashAmountToZatoshis,
} from "@/lib/invoices/money";

describe("Zcash amount parsing", () => {
  it.each([
    ["1", 100_000_000n],
    ["0.1", 10_000_000n],
    ["0.00000001", 1n],
    ["20999999.99990001", 2_099_999_999_990_001n],
  ])("parses %s directly into integer zatoshis", (input, expected) => {
    expect(parseZcashAmountToZatoshis(input)).toBe(expected);
  });

  it.each([
    "0",
    "0.00000000",
    "-1",
    "+1",
    "1e-8",
    "1,000",
    "0.000000001",
    ".1",
    "01",
    "1.",
    "",
    "21000000",
    "999999999999999999999999999",
  ])("rejects unsafe or malformed amount %s", (input) => {
    expect(() => parseZcashAmountToZatoshis(input)).toThrow(MoneyInputError);
  });

  it("formats zatoshis without floating-point arithmetic", () => {
    expect(formatZatoshis(10_000_001n)).toBe("0.10000001");
  });
});
