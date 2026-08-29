import "server-only";

import { RpcClientError, toUnavailableMessage } from "@/lib/zcash/rpc-errors";
import { getZcashRpcClient, type ZcashRpcClient } from "@/lib/zcash/rpc-client";
import type { NetworkProofViewModel } from "@/types";

interface LiveNetworkDependencies {
  client?: ZcashRpcClient;
}

const READY_PROGRESS = 0.9999;
const READY_HEIGHT_LAG = 2;

export async function getLiveNetworkView(
  dependencies: LiveNetworkDependencies = {},
): Promise<NetworkProofViewModel> {
  const client = dependencies.client ?? getZcashRpcClient();

  try {
    const [blockchainCall, blockCountCall] = await Promise.all([
      client.call("getblockchaininfo", []),
      client.call("getblockcount", []),
    ]);
    const blockchain = blockchainCall.result;

    if (blockchain.chain !== "test") {
      throw new RpcClientError({
        code: "wrong_network",
        message: "The configured RPC endpoint is not serving Zcash Testnet.",
        method: "getblockchaininfo",
        retryable: false,
      });
    }

    const estimatedHeight =
      blockchain.estimatedheight ??
      Math.max(blockchain.headers, blockchain.blocks);
    const heightLag = Math.max(0, estimatedHeight - blockCountCall.result);
    const status =
      heightLag <= READY_HEIGHT_LAG &&
      blockchain.verificationprogress >= READY_PROGRESS
        ? "live"
        : "syncing";

    return {
      status,
      snapshot: {
        network: "testnet",
        blockHeight: blockCountCall.result,
        blockHash: blockchain.bestblockhash,
        observedAt: blockchainCall.evidence.observedAt,
        verificationProgress: blockchain.verificationprogress,
        rpcMethods: ["getblockchaininfo", "getblockcount"],
      },
      evidence: [blockchainCall.evidence, blockCountCall.evidence],
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: toUnavailableMessage(error),
    };
  }
}
