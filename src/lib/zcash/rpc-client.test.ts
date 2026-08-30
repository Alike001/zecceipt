// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { RpcClientError } from "@/lib/zcash/rpc-errors";
import { ZcashRpcClient } from "@/lib/zcash/rpc-client";
import blockchainInfoFixture from "@/test/fixtures/zcash/blockchain-info.test.json";
import rawTransactionFixture from "@/test/fixtures/zcash/raw-transaction.test.json";

const endpoint = "https://rpc.invalid/private-credential-123456/";

function createClient(
  fetchImpl: typeof fetch,
  options: { timeoutMs?: number; now?: () => number } = {},
) {
  return new ZcashRpcClient({
    fetchImpl,
    getConfig: () => ({
      endpoint,
      maxResponseBytes: 8 * 1024 * 1024,
      timeoutMs: options.timeoutMs ?? 1_000,
    }),
    idFactory: () => "request-1",
    now: options.now ?? (() => Date.parse("2026-08-29T00:00:00.000Z")),
  });
}

describe("ZcashRpcClient", () => {
  it("sends an allowlisted JSON-RPC 2.0 request and returns safe evidence", async () => {
    const timestamps = [1_000, 1_042];
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        jsonrpc: "2.0",
        id: "request-1",
        method: "getblockchaininfo",
        params: [],
      });
      expect(init?.cache).toBe("no-store");

      return Response.json({
        jsonrpc: "2.0",
        id: "request-1",
        result: blockchainInfoFixture,
      });
    });
    const client = createClient(fetchImpl, {
      now: () => timestamps.shift() ?? 1_042,
    });

    const call = await client.call("getblockchaininfo", []);

    expect(call.result.chain).toBe("test");
    expect(call.result.blocks).toBe(4_310_128);
    expect(call.evidence).toEqual({
      method: "getblockchaininfo",
      state: "success",
      observedAt: "1970-01-01T00:00:01.042Z",
      latencyMs: 42,
    });
    expect(JSON.stringify(call)).not.toContain("private-credential-123456");
  });

  it("parses the payment-critical transparent output fields", async () => {
    const client = createClient(
      vi.fn<typeof fetch>(async () =>
        Response.json({
          jsonrpc: "2.0",
          id: "request-1",
          result: rawTransactionFixture,
        }),
      ),
    );

    const call = await client.call("getrawtransaction", [
      rawTransactionFixture.txid,
      1,
    ]);

    expect(call.result.vout[0]).toEqual({
      n: 0,
      valueZat: 1_000_010_000,
      scriptPubKey: {
        type: "pubkeyhash",
        addresses: ["tmTestOnlySanitizedFixtureAddress"],
      },
    });
    expect(call.result.blocktime).toBe(1_788_005_040);
  });

  it("parses verbose mempool entry times and heights", async () => {
    const txid = "c".repeat(64);
    const client = createClient(
      vi.fn<typeof fetch>(async () =>
        Response.json({
          jsonrpc: "2.0",
          id: "request-1",
          result: {
            [txid]: { time: 1_788_005_040, height: 4_313_216 },
          },
        }),
      ),
    );

    const call = await client.call("getrawmempool", [true]);

    expect(call.result[txid]).toEqual({
      time: 1_788_005_040,
      height: 4_313_216,
    });
  });

  it("rejects malformed method results", async () => {
    const client = createClient(
      vi.fn<typeof fetch>(async () =>
        Response.json({
          jsonrpc: "2.0",
          id: "request-1",
          result: "4310128",
        }),
      ),
    );

    await expect(client.call("getblockcount", [])).rejects.toMatchObject({
      code: "malformed_response",
      method: "getblockcount",
    });
  });

  it("normalizes provider RPC errors without returning provider data", async () => {
    const client = createClient(
      vi.fn<typeof fetch>(async () =>
        Response.json({
          jsonrpc: "2.0",
          id: "request-1",
          error: {
            code: -28,
            message: "Loading block index",
            data: { internal: "must not escape" },
          },
        }),
      ),
    );

    const error = await client
      .call("getblockcount", [])
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(RpcClientError);
    expect(error).toMatchObject({ code: "rpc_error", retryable: true });
    expect(String(error)).not.toContain("must not escape");
  });

  it("redacts the endpoint and credential from network failures", async () => {
    const client = createClient(
      vi.fn<typeof fetch>(async () => {
        throw new Error(`fetch failed for ${endpoint}`);
      }),
    );

    const error = await client
      .call("getblockcount", [])
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: "network" });
    expect(String(error)).not.toContain(endpoint);
    expect(String(error)).not.toContain("private-credential-123456");
  });

  it("aborts a request that exceeds the configured timeout", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const client = createClient(fetchImpl, { timeoutMs: 5 });

    await expect(client.call("getblockcount", [])).rejects.toMatchObject({
      code: "timeout",
      retryable: true,
    });
  });
});
