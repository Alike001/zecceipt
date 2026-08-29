import "server-only";

import {
  CreateInvoiceInputError,
  CreateInvoiceUnavailableError,
  createInvoiceWithDefaults,
  type CreateInvoiceResponse,
} from "@/lib/invoices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};
const maximumRequestBytes = 4_096;

interface RouteDependencies {
  createInvoice: (value: unknown) => Promise<CreateInvoiceResponse>;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

export function createInvoicePostHandler(dependencies: RouteDependencies) {
  return async function POST(request: Request): Promise<Response> {
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return jsonResponse(
        { error: { message: "Send the request as application/json." } },
        415,
      );
    }

    const declaredLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > maximumRequestBytes
    ) {
      return jsonResponse(
        { error: { message: "The request body is too large." } },
        413,
      );
    }

    let body: unknown;
    try {
      const requestText = await request.text();
      if (
        new TextEncoder().encode(requestText).byteLength > maximumRequestBytes
      ) {
        return jsonResponse(
          { error: { message: "The request body is too large." } },
          413,
        );
      }
      body = JSON.parse(requestText);
    } catch {
      return jsonResponse(
        { error: { message: "The request body is not valid JSON." } },
        400,
      );
    }

    try {
      const result = await dependencies.createInvoice(body);
      return jsonResponse(result, 201);
    } catch (error) {
      if (error instanceof CreateInvoiceInputError) {
        return jsonResponse(
          { error: { message: error.message, field: error.field } },
          422,
        );
      }
      if (error instanceof CreateInvoiceUnavailableError) {
        return jsonResponse({ error: { message: error.message } }, 503);
      }
      return jsonResponse(
        {
          error: {
            message:
              "Invoice creation is temporarily unavailable. Please try again.",
          },
        },
        503,
      );
    }
  };
}

export const POST = createInvoicePostHandler({
  createInvoice: createInvoiceWithDefaults,
});
