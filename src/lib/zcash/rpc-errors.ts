export type RpcErrorCode =
  | "configuration"
  | "timeout"
  | "network"
  | "http"
  | "response_too_large"
  | "malformed_response"
  | "rpc_error"
  | "wrong_network";

interface RpcClientErrorOptions {
  code: RpcErrorCode;
  message: string;
  method?: string;
  retryable: boolean;
  status?: number;
  cause?: unknown;
}

export class RpcClientError extends Error {
  readonly code: RpcErrorCode;
  readonly method?: string;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(options: RpcClientErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "RpcClientError";
    this.code = options.code;
    this.method = options.method;
    this.retryable = options.retryable;
    this.status = options.status;
  }
}

export function redactRpcErrorMessage(value: unknown, endpoint?: string) {
  const rawMessage = value instanceof Error ? value.message : String(value);
  let message = rawMessage;

  if (endpoint) {
    message = message.split(endpoint).join("[REDACTED_RPC_URL]");

    try {
      const url = new URL(endpoint);
      const secrets = [url.username, url.password, ...url.pathname.split("/")]
        .map((part) => part.trim())
        .filter((part) => part.length >= 8);

      for (const secret of secrets) {
        message = message.split(secret).join("[REDACTED]");
      }
    } catch {
      // Configuration validation reports malformed URLs without echoing them.
    }
  }

  return message.replaceAll(/https?:\/\/[^\s"']+/gi, "[REDACTED_URL]");
}

export function toUnavailableMessage(error: unknown) {
  if (!(error instanceof RpcClientError)) {
    return "Live Testnet verification is temporarily unavailable.";
  }

  switch (error.code) {
    case "configuration":
      return "Live Testnet verification is not configured.";
    case "wrong_network":
      return "The configured RPC endpoint is not serving Zcash Testnet.";
    case "timeout":
      return "The Testnet RPC took too long to respond.";
    default:
      return "Live Testnet verification is temporarily unavailable.";
  }
}
