// @vitest-environment node

import { describe, expect, it } from "vitest";

import { ZcashRpcClient } from "@/lib/zcash/rpc-client";

const hasLiveEndpoint = Boolean(process.env.QUICKNODE_ZCASH_RPC_URL);

// Public testnet example documented in the official Zcash Insight guide.
// This is test data, not a project or contributor wallet.
const DOCUMENTED_TESTNET_ADDRESS = "tmYXBYJj1K7vhejSec5osXK2QsGa5MTisUQ";
const DOCUMENTED_TRANSACTION_HEIGHT = 481_688;

describe.skipIf(!hasLiveEndpoint)(
  "QuickNode live Zcash Testnet contract",
  () => {
    it("supports every allowlisted payment-confirmation method", async () => {
      const client = new ZcashRpcClient();

      const [blockchain, blockCount, addressValidation] = await Promise.all([
        client.call("getblockchaininfo", []),
        client.call("getblockcount", []),
        client.call("validateaddress", [DOCUMENTED_TESTNET_ADDRESS]),
      ]);

      expect(blockchain.result.chain).toBe("test");
      expect(blockCount.result).toBeGreaterThan(0);
      expect(addressValidation.result.isvalid).toBe(true);

      const addressTransactions = await client.call("getaddresstxids", [
        {
          addresses: [DOCUMENTED_TESTNET_ADDRESS],
          start: DOCUMENTED_TRANSACTION_HEIGHT,
          end: DOCUMENTED_TRANSACTION_HEIGHT,
        },
      ]);
      const transactionId = addressTransactions.result[0];

      expect(transactionId).toBeDefined();

      const transaction = await client.call("getrawtransaction", [
        transactionId,
        1,
      ]);

      expect(
        transaction.result.vout.some((output) =>
          output.scriptPubKey.addresses?.includes(DOCUMENTED_TESTNET_ADDRESS),
        ),
      ).toBe(true);
    }, 30_000);
  },
);
