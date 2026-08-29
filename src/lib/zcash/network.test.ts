// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { getLiveNetworkView } from "@/lib/zcash/network";
import type { ZcashRpcClient } from "@/lib/zcash/rpc-client";
import type { ZcashRpcMethod } from "@/types";

const observedAt = "2026-08-29T00:00:00.000Z";

function createClient(options: {
  chain?: string;
  blockCount?: number;
  estimatedHeight?: number;
  verificationProgress?: number;
}) {
  const call = vi.fn(async (method: ZcashRpcMethod) => {
    if (method === "getblockchaininfo") {
      return {
        requestId: "chain-info",
        result: {
          chain: options.chain ?? "test",
          blocks: options.blockCount ?? 4_310_128,
          headers: options.estimatedHeight ?? 4_310_129,
          estimatedheight: options.estimatedHeight ?? 4_310_129,
          verificationprogress: options.verificationProgress ?? 0.999999,
          bestblockhash:
            "0000000000000000000000000000000000000000000000000000000000000001",
        },
        evidence: {
          method,
          state: "success" as const,
          observedAt,
          latencyMs: 21,
        },
      };
    }

    if (method === "getblockcount") {
      return {
        requestId: "block-count",
        result: options.blockCount ?? 4_310_128,
        evidence: {
          method,
          state: "success" as const,
          observedAt,
          latencyMs: 12,
        },
      };
    }

    throw new Error(`Unexpected test method: ${method}`);
  });

  return { call } as unknown as ZcashRpcClient;
}

describe("getLiveNetworkView", () => {
  it("returns a minimized live Testnet view with RPC evidence", async () => {
    const view = await getLiveNetworkView({ client: createClient({}) });

    expect(view).toEqual({
      status: "live",
      snapshot: {
        network: "testnet",
        blockHeight: 4_310_128,
        blockHash:
          "0000000000000000000000000000000000000000000000000000000000000001",
        observedAt,
        verificationProgress: 0.999999,
        rpcMethods: ["getblockchaininfo", "getblockcount"],
      },
      evidence: [
        {
          method: "getblockchaininfo",
          state: "success",
          observedAt,
          latencyMs: 21,
        },
        {
          method: "getblockcount",
          state: "success",
          observedAt,
          latencyMs: 12,
        },
      ],
    });
    expect(JSON.stringify(view)).not.toMatch(/quiknode|token|endpoint/i);
  });

  it("reports syncing when the node is behind its estimated tip", async () => {
    const view = await getLiveNetworkView({
      client: createClient({
        blockCount: 4_310_100,
        estimatedHeight: 4_310_129,
      }),
    });

    expect(view.status).toBe("syncing");
  });

  it("fails closed when the endpoint serves Mainnet", async () => {
    const view = await getLiveNetworkView({
      client: createClient({ chain: "main" }),
    });

    expect(view).toEqual({
      status: "unavailable",
      message: "The configured RPC endpoint is not serving Zcash Testnet.",
    });
  });

  it("returns an unavailable state without leaking raw errors", async () => {
    const client = {
      call: vi.fn(async () => {
        throw new Error("fetch failed at https://rpc.invalid/private-value");
      }),
    } as unknown as ZcashRpcClient;

    const view = await getLiveNetworkView({ client });

    expect(view).toEqual({
      status: "unavailable",
      message: "Live Testnet verification is temporarily unavailable.",
    });
    expect(JSON.stringify(view)).not.toContain("private-value");
  });
});
