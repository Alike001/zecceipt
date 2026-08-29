// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getLiveNetworkView } from "@/lib/zcash/network";

vi.mock("@/lib/zcash/network", () => ({
  getLiveNetworkView: vi.fn(),
}));

const mockedGetLiveNetworkView = vi.mocked(getLiveNetworkView);

describe("GET /api/network", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a no-store live network response", async () => {
    mockedGetLiveNetworkView.mockResolvedValue({
      status: "live",
      snapshot: {
        network: "testnet",
        blockHeight: 4_310_128,
        observedAt: "2026-08-29T00:00:00.000Z",
        rpcMethods: ["getblockchaininfo", "getblockcount"],
      },
    });
    const { GET } = await import("@/app/api/network/route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    await expect(response.json()).resolves.toMatchObject({
      status: "live",
      snapshot: { network: "testnet", blockHeight: 4_310_128 },
    });
  });

  it("returns a safe unavailable body with service-unavailable status", async () => {
    mockedGetLiveNetworkView.mockResolvedValue({
      status: "unavailable",
      message: "Live Testnet verification is temporarily unavailable.",
    });
    const { GET } = await import("@/app/api/network/route");

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "unavailable",
      message: "Live Testnet verification is temporarily unavailable.",
    });
  });
});
