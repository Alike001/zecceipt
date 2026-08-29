// @vitest-environment node

import { describe, expect, it } from "vitest";

import { readRpcRuntimeConfig } from "@/lib/zcash/env";
import { RpcClientError } from "@/lib/zcash/rpc-errors";

describe("readRpcRuntimeConfig", () => {
  it("accepts a private HTTPS RPC endpoint", () => {
    const config = readRpcRuntimeConfig({
      QUICKNODE_ZCASH_RPC_URL: "https://rpc.invalid/private-credential/",
    });

    expect(config.endpoint).toBe("https://rpc.invalid/private-credential/");
    expect(config.timeoutMs).toBeGreaterThan(0);
    expect(config.maxResponseBytes).toBe(8 * 1024 * 1024);
  });

  it.each([
    {},
    { QUICKNODE_ZCASH_RPC_URL: "not a URL" },
    { QUICKNODE_ZCASH_RPC_URL: "http://unit-test.invalid/token" },
  ])("rejects unsafe or missing configuration", (environment) => {
    let error: unknown;

    try {
      readRpcRuntimeConfig(environment);
    } catch (reason) {
      error = reason;
    }

    expect(error).toBeInstanceOf(RpcClientError);
    expect(error).toMatchObject({ code: "configuration" });
  });
});
