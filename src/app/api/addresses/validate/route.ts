import "server-only";

import { RpcClientError } from "@/lib/zcash/rpc-errors";
import { getZcashRpcClient, type ZcashRpcClient } from "@/lib/zcash/rpc-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};
const maximumRequestBytes = 512;

interface RouteDependencies {
  rpcClient: Pick<ZcashRpcClient, "call">;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

export function createValidateAddressPostHandler(
  dependencies: RouteDependencies,
) {
  return async function POST(request: Request): Promise<Response> {
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return jsonResponse(
        { status: "invalid", message: "Send the request as application/json." },
        415,
      );
    }

    let body: unknown;
    try {
      const requestText = await request.text();
      if (
        new TextEncoder().encode(requestText).byteLength > maximumRequestBytes
      ) {
        return jsonResponse(
          { status: "invalid", message: "The request body is too large." },
          413,
        );
      }
      body = JSON.parse(requestText);
    } catch {
      return jsonResponse(
        { status: "invalid", message: "The request body is not valid JSON." },
        400,
      );
    }

    const address =
      typeof body === "object" &&
      body !== null &&
      !Array.isArray(body) &&
      typeof (body as { address?: unknown }).address === "string"
        ? (body as { address: string }).address.trim()
        : "";

    if (
      address.length === 0 ||
      address.length > 128 ||
      (!address.startsWith("tm") && !address.startsWith("t2"))
    ) {
      return jsonResponse(
        {
          status: "invalid",
          message: "Enter a transparent Zcash Testnet address.",
        },
        422,
      );
    }

    try {
      const validation = await dependencies.rpcClient.call("validateaddress", [
        address,
      ]);
      if (
        !validation.result.isvalid ||
        (validation.result.address !== undefined &&
          validation.result.address !== address)
      ) {
        return jsonResponse(
          {
            status: "invalid",
            message: "The Testnet node did not recognize this address.",
          },
          422,
        );
      }

      return jsonResponse(
        {
          status: "valid",
          message: "Address verified by the Zcash Testnet node.",
          rpcEvidence: [validation.evidence],
        },
        200,
      );
    } catch (error) {
      if (error instanceof RpcClientError) {
        return jsonResponse(
          {
            status: "unavailable",
            message: "Address checking is temporarily unavailable.",
          },
          503,
        );
      }
      return jsonResponse(
        {
          status: "unavailable",
          message: "Address checking is temporarily unavailable.",
        },
        503,
      );
    }
  };
}

export const POST = createValidateAddressPostHandler({
  rpcClient: getZcashRpcClient(),
});
