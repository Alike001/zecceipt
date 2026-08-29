import { describe, expect, it, vi } from "vitest";

import { createValidateAddressPostHandler } from "@/app/api/addresses/validate/route";
import { RpcClientError } from "@/lib/zcash/rpc-errors";
import type { ZcashRpcClient } from "@/lib/zcash/rpc-client";

const address = "tmYXBYJj1K7vhejSec5osXK2QsGa5MTisUQ";

function request(body: unknown) {
  return new Request("https://zecceipt.invalid/api/addresses/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/addresses/validate", () => {
  it("validates through the server-side RPC client", async () => {
    const call = vi.fn().mockResolvedValue({
      result: { isvalid: true, address },
      evidence: {
        method: "validateaddress",
        state: "success",
        observedAt: "2026-08-29T12:00:00.000Z",
        latencyMs: 10,
      },
    });
    const response = await createValidateAddressPostHandler({
      rpcClient: { call } as unknown as Pick<ZcashRpcClient, "call">,
    })(request({ address }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ status: "valid" });
    expect(call).toHaveBeenCalledWith("validateaddress", [address]);
  });

  it("rejects unsupported input without calling RPC", async () => {
    const call = vi.fn();
    const response = await createValidateAddressPostHandler({
      rpcClient: { call } as unknown as Pick<ZcashRpcClient, "call">,
    })(request({ address: "u1shielded" }));

    expect(response.status).toBe(422);
    expect(call).not.toHaveBeenCalled();
  });

  it("returns an honest unavailable state without leaking errors", async () => {
    const call = vi.fn().mockRejectedValue(
      new RpcClientError({
        code: "network",
        message: "private QuickNode endpoint failed",
        method: "validateaddress",
        retryable: true,
      }),
    );
    const response = await createValidateAddressPostHandler({
      rpcClient: { call } as unknown as Pick<ZcashRpcClient, "call">,
    })(request({ address }));
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(body).toContain("unavailable");
    expect(body).not.toContain("QuickNode");
  });
});
