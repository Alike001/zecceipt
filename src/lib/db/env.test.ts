import { describe, expect, it } from "vitest";

import {
  DatabaseConfigurationError,
  readDatabaseRuntimeConfig,
} from "@/lib/db/env";

describe("database environment validation", () => {
  it("accepts server-only PostgreSQL configuration", () => {
    expect(
      readDatabaseRuntimeConfig({
        DATABASE_URL: "postgresql://user:password@db.invalid/zecceipt",
        INVOICE_MANAGEMENT_SECRET: "m".repeat(32),
      }),
    ).toEqual({
      connectionUrl: "postgresql://user:password@db.invalid/zecceipt",
      managementSecret: "m".repeat(32),
    });
  });

  it.each([
    [{ INVOICE_MANAGEMENT_SECRET: "m".repeat(32) }],
    [
      {
        DATABASE_URL: "https://db.invalid/zecceipt",
        INVOICE_MANAGEMENT_SECRET: "m".repeat(32),
      },
    ],
    [
      {
        DATABASE_URL: "not a url",
        INVOICE_MANAGEMENT_SECRET: "m".repeat(32),
      },
    ],
    [
      {
        DATABASE_URL: "postgresql://db.invalid/zecceipt",
        INVOICE_MANAGEMENT_SECRET: "too-short",
      },
    ],
  ])("rejects invalid or incomplete configuration", (environment) => {
    expect(() => readDatabaseRuntimeConfig(environment)).toThrow(
      DatabaseConfigurationError,
    );
  });
});
