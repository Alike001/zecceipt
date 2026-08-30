import "server-only";

import { readRpcRuntimeConfig, type RpcRuntimeConfig } from "@/lib/zcash/env";
import { redactRpcErrorMessage, RpcClientError } from "@/lib/zcash/rpc-errors";
import type {
  BlockchainInfoResult,
  JsonRpcFailure,
  JsonRpcSuccess,
  RawTransactionResult,
  RpcCallResult,
  RpcParamsByMethod,
  RpcResultByMethod,
  TransparentOutput,
  ValidateAddressResult,
} from "@/lib/zcash/rpc-types";
import type { ZcashRpcMethod } from "@/types";

type FetchImplementation = typeof fetch;

interface ZcashRpcClientOptions {
  fetchImpl?: FetchImplementation;
  getConfig?: () => RpcRuntimeConfig;
  idFactory?: () => string;
  now?: () => number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function expectRecord(value: unknown, method: ZcashRpcMethod) {
  if (!isRecord(value)) {
    throw malformedResult(method);
  }

  return value;
}

function malformedResult(method: ZcashRpcMethod) {
  return new RpcClientError({
    code: "malformed_response",
    message: `RPC method ${method} returned an unexpected result shape.`,
    method,
    retryable: true,
  });
}

function parseValidateAddress(value: unknown): ValidateAddressResult {
  const result = expectRecord(value, "validateaddress");

  if (typeof result.isvalid !== "boolean") {
    throw malformedResult("validateaddress");
  }

  if (result.address !== undefined && typeof result.address !== "string") {
    throw malformedResult("validateaddress");
  }

  if (
    result.scriptPubKey !== undefined &&
    typeof result.scriptPubKey !== "string"
  ) {
    throw malformedResult("validateaddress");
  }

  return {
    isvalid: result.isvalid,
    ...(typeof result.address === "string" ? { address: result.address } : {}),
    ...(typeof result.scriptPubKey === "string"
      ? { scriptPubKey: result.scriptPubKey }
      : {}),
  };
}

function parseBlockchainInfo(value: unknown): BlockchainInfoResult {
  const result = expectRecord(value, "getblockchaininfo");

  if (
    typeof result.chain !== "string" ||
    !isNonNegativeInteger(result.blocks) ||
    !isNonNegativeInteger(result.headers) ||
    typeof result.verificationprogress !== "number" ||
    !Number.isFinite(result.verificationprogress) ||
    result.verificationprogress < 0 ||
    result.verificationprogress > 1 ||
    typeof result.bestblockhash !== "string"
  ) {
    throw malformedResult("getblockchaininfo");
  }

  if (
    result.estimatedheight !== undefined &&
    !isNonNegativeInteger(result.estimatedheight)
  ) {
    throw malformedResult("getblockchaininfo");
  }

  if (
    result.difficulty !== undefined &&
    (typeof result.difficulty !== "number" ||
      !Number.isFinite(result.difficulty))
  ) {
    throw malformedResult("getblockchaininfo");
  }

  return {
    chain: result.chain,
    blocks: result.blocks,
    headers: result.headers,
    verificationprogress: result.verificationprogress,
    bestblockhash: result.bestblockhash,
    ...(typeof result.estimatedheight === "number"
      ? { estimatedheight: result.estimatedheight }
      : {}),
    ...(typeof result.difficulty === "number"
      ? { difficulty: result.difficulty }
      : {}),
  };
}

function parseBlockCount(value: unknown) {
  if (!isNonNegativeInteger(value)) {
    throw malformedResult("getblockcount");
  }

  return value;
}

function parseAddressTxids(value: unknown) {
  if (
    !Array.isArray(value) ||
    !value.every((txid) => typeof txid === "string" && txid.length > 0)
  ) {
    throw malformedResult("getaddresstxids");
  }

  return value;
}

function parseRawMempool(value: unknown) {
  const result = expectRecord(value, "getrawmempool");
  const entries: Record<string, { time: number; height: number }> = {};

  for (const [txid, rawEntry] of Object.entries(result)) {
    const entry = expectRecord(rawEntry, "getrawmempool");
    if (
      txid.length === 0 ||
      !isNonNegativeInteger(entry.time) ||
      !isNonNegativeInteger(entry.height)
    ) {
      throw malformedResult("getrawmempool");
    }
    entries[txid] = { time: entry.time, height: entry.height };
  }

  return entries;
}

function parseTransparentOutput(value: unknown): TransparentOutput {
  const output = expectRecord(value, "getrawtransaction");
  const scriptPubKey = expectRecord(output.scriptPubKey, "getrawtransaction");

  if (
    !isNonNegativeInteger(output.n) ||
    !isNonNegativeInteger(output.valueZat)
  ) {
    throw malformedResult("getrawtransaction");
  }

  if (
    scriptPubKey.addresses !== undefined &&
    (!Array.isArray(scriptPubKey.addresses) ||
      !scriptPubKey.addresses.every((address) => typeof address === "string"))
  ) {
    throw malformedResult("getrawtransaction");
  }

  if (
    scriptPubKey.type !== undefined &&
    typeof scriptPubKey.type !== "string"
  ) {
    throw malformedResult("getrawtransaction");
  }

  return {
    n: output.n,
    valueZat: output.valueZat,
    scriptPubKey: {
      ...(Array.isArray(scriptPubKey.addresses)
        ? { addresses: scriptPubKey.addresses as string[] }
        : {}),
      ...(typeof scriptPubKey.type === "string"
        ? { type: scriptPubKey.type }
        : {}),
    },
  };
}

function parseRawTransaction(value: unknown): RawTransactionResult {
  const result = expectRecord(value, "getrawtransaction");

  if (typeof result.txid !== "string" || !Array.isArray(result.vout)) {
    throw malformedResult("getrawtransaction");
  }

  if (
    result.confirmations !== undefined &&
    !isNonNegativeInteger(result.confirmations)
  ) {
    throw malformedResult("getrawtransaction");
  }

  if (
    result.expiryheight !== undefined &&
    !isNonNegativeInteger(result.expiryheight)
  ) {
    throw malformedResult("getrawtransaction");
  }

  if (result.height !== undefined && !isNonNegativeInteger(result.height)) {
    throw malformedResult("getrawtransaction");
  }

  if (
    result.blocktime !== undefined &&
    !isNonNegativeInteger(result.blocktime)
  ) {
    throw malformedResult("getrawtransaction");
  }

  if (result.blockhash !== undefined && typeof result.blockhash !== "string") {
    throw malformedResult("getrawtransaction");
  }

  return {
    txid: result.txid,
    vout: result.vout.map(parseTransparentOutput),
    ...(typeof result.expiryheight === "number"
      ? { expiryheight: result.expiryheight }
      : {}),
    ...(typeof result.confirmations === "number"
      ? { confirmations: result.confirmations }
      : {}),
    ...(typeof result.height === "number" ? { height: result.height } : {}),
    ...(typeof result.blocktime === "number"
      ? { blocktime: result.blocktime }
      : {}),
    ...(typeof result.blockhash === "string"
      ? { blockhash: result.blockhash }
      : {}),
  };
}

const resultParsers: {
  [M in ZcashRpcMethod]: (value: unknown) => RpcResultByMethod[M];
} = {
  validateaddress: parseValidateAddress,
  getblockchaininfo: parseBlockchainInfo,
  getblockcount: parseBlockCount,
  getrawmempool: parseRawMempool,
  getaddresstxids: parseAddressTxids,
  getrawtransaction: parseRawTransaction,
};

function parseEnvelope(
  value: unknown,
  method: ZcashRpcMethod,
  requestId: string,
): JsonRpcSuccess | JsonRpcFailure {
  const envelope = expectRecord(value, method);

  if (
    envelope.id !== requestId ||
    (envelope.jsonrpc !== undefined && envelope.jsonrpc !== "2.0")
  ) {
    throw new RpcClientError({
      code: "malformed_response",
      message: `RPC method ${method} returned an invalid response envelope.`,
      method,
      retryable: true,
    });
  }

  if (envelope.error !== undefined && envelope.error !== null) {
    const rpcError = expectRecord(envelope.error, method);

    if (
      typeof rpcError.code !== "number" ||
      typeof rpcError.message !== "string"
    ) {
      throw malformedResult(method);
    }

    return {
      id: requestId,
      jsonrpc: "2.0",
      error: {
        code: rpcError.code,
        message: rpcError.message,
        ...(rpcError.data !== undefined ? { data: rpcError.data } : {}),
      },
    };
  }

  if (!Object.hasOwn(envelope, "result")) {
    throw malformedResult(method);
  }

  return {
    id: requestId,
    jsonrpc: "2.0",
    result: envelope.result,
    error: null,
  };
}

export class ZcashRpcClient {
  private readonly fetchImpl: FetchImplementation;
  private readonly getConfig: () => RpcRuntimeConfig;
  private readonly idFactory: () => string;
  private readonly now: () => number;

  constructor(options: ZcashRpcClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.getConfig = options.getConfig ?? readRpcRuntimeConfig;
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
    this.now = options.now ?? Date.now;
  }

  async call<M extends ZcashRpcMethod>(
    method: M,
    params: RpcParamsByMethod[M],
  ): Promise<RpcCallResult<M>> {
    const config = this.getConfig();
    const requestId = this.idFactory();
    const startedAt = this.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await this.fetchImpl(config.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: requestId,
          method,
          params,
        }),
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new RpcClientError({
          code: "http",
          message: `RPC method ${method} failed with HTTP ${response.status}.`,
          method,
          retryable: response.status === 429 || response.status >= 500,
          status: response.status,
        });
      }

      const contentLength = Number(response.headers.get("content-length"));

      if (
        Number.isFinite(contentLength) &&
        contentLength > config.maxResponseBytes
      ) {
        throw new RpcClientError({
          code: "response_too_large",
          message: `RPC method ${method} exceeded the response-size limit.`,
          method,
          retryable: false,
        });
      }

      const responseText = await response.text();

      if (
        new TextEncoder().encode(responseText).byteLength >
        config.maxResponseBytes
      ) {
        throw new RpcClientError({
          code: "response_too_large",
          message: `RPC method ${method} exceeded the response-size limit.`,
          method,
          retryable: false,
        });
      }

      let responseBody: unknown;

      try {
        responseBody = JSON.parse(responseText);
      } catch (cause) {
        throw new RpcClientError({
          code: "malformed_response",
          message: `RPC method ${method} did not return valid JSON.`,
          method,
          retryable: true,
          cause,
        });
      }

      const envelope = parseEnvelope(responseBody, method, requestId);

      if (envelope.error) {
        throw new RpcClientError({
          code: "rpc_error",
          message: `RPC method ${method} returned error ${envelope.error.code}.`,
          method,
          retryable: true,
        });
      }

      const completedAt = this.now();

      return {
        requestId,
        result: resultParsers[method](envelope.result),
        evidence: {
          method,
          state: "success",
          observedAt: new Date(completedAt).toISOString(),
          latencyMs: Math.max(0, completedAt - startedAt),
        },
      };
    } catch (error) {
      if (error instanceof RpcClientError) {
        throw error;
      }

      if (controller.signal.aborted) {
        throw new RpcClientError({
          code: "timeout",
          message: `RPC method ${method} timed out.`,
          method,
          retryable: true,
          cause: error,
        });
      }

      throw new RpcClientError({
        code: "network",
        message: `RPC method ${method} could not reach the provider: ${redactRpcErrorMessage(error, config.endpoint)}`,
        method,
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

let defaultClient: ZcashRpcClient | undefined;

export function getZcashRpcClient() {
  defaultClient ??= new ZcashRpcClient();
  return defaultClient;
}
