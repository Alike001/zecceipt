import "server-only";

import { RpcClientError } from "@/lib/zcash/rpc-errors";

export interface RpcRuntimeConfig {
  endpoint: string;
  maxResponseBytes: number;
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export function readRpcRuntimeConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): RpcRuntimeConfig {
  const endpoint = environment.QUICKNODE_ZCASH_RPC_URL?.trim();

  if (!endpoint) {
    throw new RpcClientError({
      code: "configuration",
      message: "QUICKNODE_ZCASH_RPC_URL is not configured.",
      retryable: false,
    });
  }

  let parsed: URL;

  try {
    parsed = new URL(endpoint);
  } catch (cause) {
    throw new RpcClientError({
      code: "configuration",
      message: "QUICKNODE_ZCASH_RPC_URL must be a valid URL.",
      retryable: false,
      cause,
    });
  }

  if (parsed.protocol !== "https:") {
    throw new RpcClientError({
      code: "configuration",
      message: "QUICKNODE_ZCASH_RPC_URL must use HTTPS.",
      retryable: false,
    });
  }

  return {
    endpoint: parsed.toString(),
    maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}
