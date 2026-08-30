import "server-only";

import { getDatabase } from "@/lib/db";
import { formatZatoshis } from "@/lib/invoices/money";
import {
  InvoiceRepository,
  type InvoiceRecord,
  type PendingPaymentOutputRecord,
  type PaymentOutputRecord,
  type PersistedInvoiceStatus,
} from "@/lib/invoices/repository";
import { RpcClientError, toUnavailableMessage } from "@/lib/zcash/rpc-errors";
import { getZcashRpcClient, type ZcashRpcClient } from "@/lib/zcash/rpc-client";
import type {
  MatchedPaymentOutput,
  PendingPaymentOutput,
  PaymentStatusViewModel,
  RpcEvidenceItem,
  ZcashRpcMethod,
} from "@/types";

const SETTLED_STATUSES: readonly PersistedInvoiceStatus[] = [
  "paid",
  "overpaid",
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
  pendingOutputs: readonly Pick<PendingPaymentOutputRecord, "expiryHeight">[];
  currentHeight: number;
  expiresAt: string;
  observedAt: string;
}): {
  status: PersistedInvoiceStatus;
  receivedZatoshis: bigint;
} {
  const receivedZatoshis = sumOutputs(input.outputs);
  const expired = Date.parse(input.observedAt) >= Date.parse(input.expiresAt);
  const hasLivePendingOutput = input.pendingOutputs.some(
    (output) => output.expiryHeight > input.currentHeight,
  );

  if (receivedZatoshis === 0n) {
    if (hasLivePendingOutput) {
      return {
        status: expired ? "pending_after_expiry" : "pending",
        receivedZatoshis,
      };
    }
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

function toPendingOutput(
  output: PendingPaymentOutputRecord,
): PendingPaymentOutput {
  return {
    txid: output.txid,
    outputIndex: output.outputIndex,
    amountZec: formatZatoshis(output.valueZatoshis),
    amountZats: output.valueZatoshis.toString(),
    mempoolEnteredAt: output.mempoolEnteredAt,
    expiryHeight: output.expiryHeight,
  };
}

export function toPaymentStatusView(
  invoice: InvoiceRecord,
  outputs: readonly PaymentOutputRecord[],
  observedAt: string,
  pendingOutputs: readonly PendingPaymentOutputRecord[] = [],
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
    case "pending": {
      const pendingOutput = pendingOutputs[0];
      if (!pendingOutput) return { ...base, status: "waiting" };
      return {
        ...base,
        status: "pending",
        pendingOutput: toPendingOutput(pendingOutput),
      };
    }
    case "pending_after_expiry": {
      const pendingOutput = pendingOutputs[0];
      if (!pendingOutput) {
        return { ...base, status: "expired", expiredAt: invoice.expiresAt };
      }
      return {
        ...base,
        status: "pending_after_expiry",
        expiredAt: invoice.expiresAt,
        pendingOutput: toPendingOutput(pendingOutput),
      };
    }
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
  const existingPendingOutputs =
    await dependencies.invoiceRepository.findPendingPaymentOutputsByInvoiceId(
      invoice.id,
    );

  if (SETTLED_STATUSES.includes(invoice.status)) {
    return {
      payment: toPaymentStatusView(
        invoice,
        existingOutputs,
        observedAt,
        existingPendingOutputs,
      ),
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
    const previouslyPendingByIdentity = new Map(
      existingPendingOutputs.map((output) => [
        `${output.txid}:${output.outputIndex}`,
        output,
      ]),
    );

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
        const blocktime = transaction.blocktime;

        const maximumConfirmations = currentHeight - transaction.height + 1;
        const confirmations = Math.min(
          transaction.confirmations,
          maximumConfirmations,
        );

        matchedOutputs = matchedOutputs.concat(
          transaction.vout
            .filter((output) => {
              if (
                output.valueZat <= 0 ||
                !output.scriptPubKey.addresses?.includes(
                  invoice.recipientAddress,
                )
              ) {
                return false;
              }

              if (blocktime * 1_000 <= Date.parse(invoice.expiresAt)) {
                return true;
              }

              const pending = previouslyPendingByIdentity.get(
                `${transaction.txid}:${output.n}`,
              );
              return Boolean(
                pending &&
                Date.parse(pending.mempoolEnteredAt) <=
                  Date.parse(invoice.expiresAt),
              );
            })
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

    const minedIdentities = new Set(
      matchedOutputs.map((output) => `${output.txid}:${output.outputIndex}`),
    );
    const pendingByIdentity = new Map(
      existingPendingOutputs
        .filter(
          (output) =>
            output.expiryHeight > currentHeight ||
            minedIdentities.has(`${output.txid}:${output.outputIndex}`),
        )
        .map((output) => [`${output.txid}:${output.outputIndex}`, output]),
    );

    if (sumOutputs(matchedOutputs) < invoice.expectedAmountZatoshis) {
      activeMethod = "getrawmempool";
      const mempoolCall = await dependencies.rpcClient.call("getrawmempool", [
        true,
      ]);
      evidence.push(mempoolCall.evidence);

      for (const [transactionId, entry] of Object.entries(mempoolCall.result)) {
        const enteredAtMs = entry.time * 1_000;
        if (
          enteredAtMs < Date.parse(invoice.createdAt) ||
          enteredAtMs > Date.parse(invoice.expiresAt)
        ) {
          continue;
        }

        activeMethod = "getrawtransaction";
        const transactionCall = await dependencies.rpcClient.call(
          "getrawtransaction",
          [transactionId, 1],
        );
        evidence.push(transactionCall.evidence);
        const transaction = transactionCall.result;

        if (
          transaction.txid !== transactionId ||
          transaction.expiryheight === undefined
        ) {
          throw malformedTransaction(
            "A mempool transaction was missing reliable identity or expiry evidence.",
          );
        }
        if (
          transaction.blockhash !== undefined ||
          transaction.height !== undefined
        ) {
          continue;
        }

        for (const output of transaction.vout) {
          if (
            output.valueZat !== Number(invoice.expectedAmountZatoshis) ||
            !output.scriptPubKey.addresses?.includes(invoice.recipientAddress)
          ) {
            continue;
          }

          const identity = `${transaction.txid}:${output.n}`;
          pendingByIdentity.set(identity, {
            invoiceId: invoice.id,
            txid: transaction.txid,
            outputIndex: output.n,
            valueZatoshis: BigInt(output.valueZat),
            mempoolEnteredAt: new Date(enteredAtMs).toISOString(),
            expiryHeight: transaction.expiryheight,
            observedAt,
            firstSeenAt:
              pendingByIdentity.get(identity)?.firstSeenAt ?? observedAt,
            lastSeenAt: observedAt,
          });
        }
      }
    }

    const pendingOutputs = [...pendingByIdentity.values()];

    const nextState = derivePaymentStatus({
      expectedAmountZatoshis: invoice.expectedAmountZatoshis,
      outputs: matchedOutputs,
      confirmationTarget: invoice.confirmationTarget,
      pendingOutputs,
      currentHeight,
      expiresAt: invoice.expiresAt,
      observedAt,
    });
    const pendingOutputsForReconciliation =
      nextState.status === "paid" || nextState.status === "overpaid"
        ? []
        : pendingOutputs;
    const reconciled =
      await dependencies.invoiceRepository.reconcilePaymentOutputs({
        invoiceId: invoice.id,
        outputs: matchedOutputs,
        pendingOutputs: pendingOutputsForReconciliation,
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
        reconciled.pendingOutputs,
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
