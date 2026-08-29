import type { RpcEvidenceItem, ZcashRpcMethod } from "@/types";

export interface ValidateAddressResult {
  isvalid: boolean;
  address?: string;
  scriptPubKey?: string;
}

export interface BlockchainInfoResult {
  chain: string;
  blocks: number;
  headers: number;
  estimatedheight?: number;
  verificationprogress: number;
  bestblockhash: string;
  difficulty?: number;
}

export interface GetAddressTxidsRequest {
  addresses: readonly string[];
  start: number;
  end: number;
}

export interface TransparentScriptPubKey {
  addresses?: readonly string[];
  type?: string;
}

export interface TransparentOutput {
  n: number;
  valueZat: number;
  scriptPubKey: TransparentScriptPubKey;
}

export interface RawTransactionResult {
  txid: string;
  confirmations?: number;
  blockhash?: string;
  height?: number;
  vout: readonly TransparentOutput[];
}

export interface RpcParamsByMethod {
  validateaddress: readonly [address: string];
  getblockchaininfo: readonly [];
  getblockcount: readonly [];
  getaddresstxids: readonly [request: GetAddressTxidsRequest];
  getrawtransaction: readonly [txid: string, verbose: 1];
}

export interface RpcResultByMethod {
  validateaddress: ValidateAddressResult;
  getblockchaininfo: BlockchainInfoResult;
  getblockcount: number;
  getaddresstxids: readonly string[];
  getrawtransaction: RawTransactionResult;
}

export interface RpcCallResult<M extends ZcashRpcMethod> {
  evidence: RpcEvidenceItem;
  requestId: string;
  result: RpcResultByMethod[M];
}

export interface JsonRpcSuccess {
  jsonrpc?: string;
  id: string | number | null;
  result: unknown;
  error?: null;
}

export interface JsonRpcFailure {
  jsonrpc?: string;
  id: string | number | null;
  result?: null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}
