import "server-only";

import { getDatabase } from "@/lib/db";
import { formatZatoshis } from "@/lib/invoices/money";
import {
  InvoiceRepository,
  type InvoiceRecord,
  type PaymentOutputRecord,
  type PersistedInvoiceStatus,
} from "@/lib/invoices/repository";
import { RpcClientError, toUnavailableMessage } from "@/lib/zcash/rpc-errors";
import { getZcashRpcClient, type ZcashRpcClient } from "@/lib/zcash/rpc-client";
import type {
  MatchedPaymentOutput,
  PaymentStatusViewModel,
  RpcEvidenceItem,
  ZcashRpcMethod,
} from "@/types";

const TERMINAL_EXPIRY_STATUSES: readonly PersistedInvoiceStatus[] = [
  "expired",
  "expired_partial",
];

export interface VerifyPaymentResponse {
  payment: PaymentStatusViewModel;
  rpcEvidence: readonly RpcEvidenceItem[];
}

export interface VerifyPaymentDependencies {
  rpcClient: Pick<ZcashRpcClient, "call">;
  invoiceRepository: InvoiceRepository;
  now?: () => Date;
}

export class InvoiceNotFoundError extends Error {
  constructor() {
    super("Invoice not found.");
    this.name = "InvoiceNotFoundError";
  }
}

function sumOutputs(
  outputs: readonly Pick<PaymentOutputRecord, "valueZatoshis">[],
): bigint {
  return outputs.reduce((total, output) => total + output.valueZatoshis, 0n);
}

function lowestConfirmationCount(
  outputs: readonly Pick<PaymentOutputRecord, "confirmations">[],
): number {
  return outputs.reduce(
    (lowest, output) => Math.min(lowest, output.confirmations),
    Number.MAX_SAFE_INTEGER,
  );
}

export function derivePaymentStatus(input: {
  expectedAmountZatoshis: bigint;
  outputs: readonly Pick<
    PaymentOutputRecord,
    "valueZatoshis" | "confirmations"
  >[];
  confirmationTarget: number;
  expiresAt: string;
  observedAt: string;
}): {
  status: PersistedInvoiceStatus;
  receivedZatoshis: bigint;
} {
  const receivedZatoshis = sumOutputs(input.outputs);
  const expired = Date.parse(input.observedAt) >= Date.parse(input.expiresAt);

  if (receivedZatoshis === 0n) {
    return { status: expired ? "expired" : "waiting", receivedZatoshis };
  }
  if (receivedZatoshis < input.expectedAmountZatoshis) {
    return {
      status: expired ? "expired_partial" : "partial",
      receivedZatoshis,
    };
  }

  if (lowestConfirmationCount(input.outputs) < input.confirmationTarget) {
    return { status: "confirming", receivedZatoshis };
  }

  return {
    status:
      receivedZatoshis === input.expectedAmountZatoshis ? "paid" : "overpaid",
    receivedZatoshis,
  };
}

function toMatchedOutput(output: PaymentOutputRecord): MatchedPaymentOutput {
  return {
    txid: output.txid,
    outputIndex: output.outputIndex,
    amountZec: formatZatoshis(output.valueZatoshis),
    amountZats: output.valueZatoshis.toString(),
    blockHeight: output.blockHeight,
    blockHash: output.blockHash,
    confirmations: output.confirmations,
  };
}

export function toPaymentStatusView(
  invoice: InvoiceRecord,
  outputs: readonly PaymentOutputRecord[],
  observedAt: string,
): PaymentStatusViewModel {
  const expectedAmountZec = formatZatoshis(invoice.expectedAmountZatoshis);
  const receivedAmountZec = formatZatoshis(invoice.receivedZatoshis);
  const matchedOutputs = outputs.map(toMatchedOutput);
  const base = {
    invoiceId: invoice.id,
    expectedAmountZec,
    receivedAmountZec,
    observedAt,
  };

  switch (invoice.status) {
    case "waiting":
      return { ...base, status: "waiting" };
    case "partial":
      return {
        ...base,
        status: "partial",
        shortfallAmountZec: formatZatoshis(
          invoice.expectedAmountZatoshis - invoice.receivedZatoshis,
        ),
        outputs: matchedOutputs,
      };
    case "confirming":
      return {
        ...base,
        status: "confirming",
        confirmations: lowestConfirmationCount(outputs),
        confirmationTarget: invoice.confirmationTarget,
        outputs: matchedOutputs,
      };
    case "paid":
    case "overpaid":
      return { ...base, status: invoice.status, outputs: matchedOutputs };
    case "expired":
      return { ...base, status: "expired", expiredAt: invoice.expiresAt };
    case "expired_partial":
      return {
        ...base,
        status: "expired_partial",
        expiredAt: invoice.expiresAt,
        shortfallAmountZec: formatZatoshis(
          invoice.expectedAmountZatoshis - invoice.receivedZatoshis,
        ),
        outputs: matchedOutputs,
      };
  }
}

function unavailableView(
  invoice: InvoiceRecord,
  observedAt: string,
  error: unknown,
): PaymentStatusViewModel {
  return {
    status: "rpc_unavailable",
    invoiceId: invoice.id,
    expectedAmountZec: formatZatoshis(invoice.expectedAmountZatoshis),
    receivedAmountZec: formatZatoshis(invoice.receivedZatoshis),
    observedAt,
    message: toUnavailableMessage(error),
    lastKnownStatus: invoice.status,
    ...(invoice.lastCheckedAt
      ? { lastSuccessfulAt: invoice.lastCheckedAt }
      : {}),
  };
}

function rpcErrorEvidence(
  method: ZcashRpcMethod,
  observedAt: string,
): RpcEvidenceItem {
  return { method, state: "error", observedAt, latencyMs: null };
}

function malformedTransaction(message: string): RpcClientError {
  return new RpcClientError({
    code: "malformed_response",
    message,
    method: "getrawtransaction",
    retryable: true,
  });
}

export async function verifyInvoicePayment(
  invoiceId: string,
  dependencies: VerifyPaymentDependencies,
): Promise<VerifyPaymentResponse> {
  const invoice = await dependencies.invoiceRepository.findById(invoiceId);
  if (!invoice) throw new InvoiceNotFoundError();

  const now = (dependencies.now ?? (() => new Date()))();
  const observedAt = now.toISOString();
  const existingOutputs =
    await dependencies.invoiceRepository.findPaymentOutputsByInvoiceId(
      invoice.id,
    );

  if (TERMINAL_EXPIRY_STATUSES.includes(invoice.status)) {
    return {
      payment: toPaymentStatusView(invoice, existingOutputs, observedAt),
      rpcEvidence: [],
    };
  }

  const evidence: RpcEvidenceItem[] = [];
  let activeMethod: ZcashRpcMethod = "getblockcount";

  try {
    const blockCountCall = await dependencies.rpcClient.call(
      "getblockcount",
      [],
    );
    evidence.push(blockCountCall.evidence);
    const currentHeight = blockCountCall.result;
    const scanStart = invoice.creationHeight + 1;

    let matchedOutputs: PaymentOutputRecord[] = [];

    if (scanStart <= currentHeight) {
      activeMethod = "getaddresstxids";
      const addressTxidsCall = await dependencies.rpcClient.call(
        "getaddresstxids",
        [
          {
            addresses: [invoice.recipientAddress],
            start: scanStart,
            end: currentHeight,
          },
        ],
      );
      evidence.push(addressTxidsCall.evidence);

      const transactionIds = [...new Set(addressTxidsCall.result)];
      for (const transactionId of transactionIds) {
        activeMethod = "getrawtransaction";
        const transactionCall = await dependencies.rpcClient.call(
          "getrawtransaction",
          [transactionId, 1],
        );
        evidence.push(transactionCall.evidence);
        const transaction = transactionCall.result;

        if (transaction.txid !== transactionId) {
          throw malformedTransaction(
            "The decoded transaction ID did not match the requested transaction.",
          );
        }
        if (
          transaction.height !== undefined &&
          transaction.height < scanStart
        ) {
          continue;
        }
        if (
          transaction.height === undefined ||
          transaction.height > currentHeight ||
          transaction.blockhash === undefined ||
          transaction.blockhash.length !== 64 ||
          transaction.confirmations === undefined ||
          transaction.blocktime === undefined
        ) {
          throw malformedTransaction(
            "A mined transaction was missing reliable block evidence.",
          );
        }

        if (transaction.blocktime * 1_000 > Date.parse(invoice.expiresAt)) {
          continue;
        }

        const maximumConfirmations = currentHeight - transaction.height + 1;
        const confirmations = Math.min(
          transaction.confirmations,
          maximumConfirmations,
        );

        matchedOutputs = matchedOutputs.concat(
          transaction.vout
            .filter(
              (output) =>
                output.valueZat > 0 &&
                output.scriptPubKey.addresses?.includes(
                  invoice.recipientAddress,
                ),
            )
            .map((output) => ({
              invoiceId: invoice.id,
              txid: transaction.txid,
              outputIndex: output.n,
              valueZatoshis: BigInt(output.valueZat),
              blockHeight: transaction.height as number,
              blockHash: transaction.blockhash as string,
              confirmations,
              observedAt,
              firstSeenAt: observedAt,
              lastSeenAt: observedAt,
            })),
        );
      }
    }

    const nextState = derivePaymentStatus({
      expectedAmountZatoshis: invoice.expectedAmountZatoshis,
      outputs: matchedOutputs,
      confirmationTarget: invoice.confirmationTarget,
      expiresAt: invoice.expiresAt,
      observedAt,
    });
    const reconciled =
      await dependencies.invoiceRepository.reconcilePaymentOutputs({
        invoiceId: invoice.id,
        outputs: matchedOutputs,
        status: nextState.status,
        receivedZatoshis: nextState.receivedZatoshis,
        observedAt,
      });

    if (!reconciled) throw new InvoiceNotFoundError();

    return {
      payment: toPaymentStatusView(
        reconciled.invoice,
        reconciled.outputs,
        observedAt,
      ),
      rpcEvidence: evidence,
    };
  } catch (error) {
    if (error instanceof InvoiceNotFoundError) throw error;
    if (!(error instanceof RpcClientError)) throw error;

    const latestInvoice =
      (await dependencies.invoiceRepository.findById(invoice.id)) ?? invoice;
    return {
      payment: unavailableView(latestInvoice, observedAt, error),
      rpcEvidence: [...evidence, rpcErrorEvidence(activeMethod, observedAt)],
    };
  }
}

export function verifyInvoicePaymentWithDefaults(invoiceId: string) {
  return verifyInvoicePayment(invoiceId, {
    rpcClient: getZcashRpcClient(),
    invoiceRepository: new InvoiceRepository(getDatabase()),
  });
}
