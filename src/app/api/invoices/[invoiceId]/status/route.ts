import "server-only";

import {
  InvoiceNotFoundError,
  verifyInvoicePaymentWithDefaults,
  type VerifyPaymentResponse,
} from "@/lib/payments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

interface RouteDependencies {
  verifyPayment: (invoiceId: string) => Promise<VerifyPaymentResponse>;
}

interface InvoiceStatusRouteContext {
  params: Promise<{ invoiceId: string }>;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

export function createInvoiceStatusGetHandler(dependencies: RouteDependencies) {
  return async function GET(
    _request: Request,
    context: InvoiceStatusRouteContext,
  ): Promise<Response> {
    const { invoiceId: rawInvoiceId } = await context.params;
    const invoiceId = rawInvoiceId.trim();

    if (invoiceId.length === 0 || invoiceId.length > 128) {
      return jsonResponse(
        { error: { message: "The invoice ID is not valid." } },
        400,
      );
    }

    try {
      return jsonResponse(await dependencies.verifyPayment(invoiceId), 200);
    } catch (error) {
      if (error instanceof InvoiceNotFoundError) {
        return jsonResponse({ error: { message: "Invoice not found." } }, 404);
      }

      return jsonResponse(
        {
          error: {
            message:
              "Payment status is temporarily unavailable. Please try again.",
          },
        },
        503,
      );
    }
  };
}

export const GET = createInvoiceStatusGetHandler({
  verifyPayment: verifyInvoicePaymentWithDefaults,
});
