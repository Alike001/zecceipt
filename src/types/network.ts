export type IsoDateTime = string;

export const ZCASH_RPC_METHODS = [
  "validateaddress",
  "getblockchaininfo",
  "getblockcount",
  "getrawmempool",
  "getaddresstxids",
  "getrawtransaction",
] as const;

export type ZcashRpcMethod = (typeof ZCASH_RPC_METHODS)[number];

export type RpcEvidenceState = "success" | "error";

export interface RpcEvidenceItem {
  method: ZcashRpcMethod;
  state: RpcEvidenceState;
  observedAt: IsoDateTime;
  latencyMs: number | null;
}

export interface TestnetNetworkSnapshot {
  network: "testnet";
  blockHeight: number;
  blockHash?: string;
  observedAt: IsoDateTime;
  verificationProgress?: number;
  rpcMethods: readonly ZcashRpcMethod[];
}

export type NetworkProofViewModel =
  | {
      status: "loading";
      message?: string;
    }
  | {
      status: "live" | "syncing" | "stale";
      snapshot: TestnetNetworkSnapshot;
      evidence?: readonly RpcEvidenceItem[];
    }
  | {
      status: "unavailable";
      message: string;
      lastSuccessfulAt?: IsoDateTime;
    };

export interface NetworkProofProps {
  view: NetworkProofViewModel;
  onRetry?: () => void;
  className?: string;
}
