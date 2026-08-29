import "server-only";

import { createHmac, randomBytes, randomUUID } from "node:crypto";

import { getDatabase, readDatabaseRuntimeConfig } from "@/lib/db";
import {
  formatZatoshis,
  MoneyInputError,
  parseZcashAmountToZatoshis,
} from "@/lib/invoices/money";
import { InvoiceRepository } from "@/lib/invoices/repository";
import { RpcClientError } from "@/lib/zcash/rpc-errors";
import { getZcashRpcClient, type ZcashRpcClient } from "@/lib/zcash/rpc-client";
import type { RpcEvidenceItem } from "@/types";

export interface CreateInvoiceRequest {
  recipientAddress: string;
  amountZec: string;
  label: string;
  expiryMinutes: string;
  confirmationTarget: string;
}

export interface CreateInvoiceResponse {
  publicCheckout: {
    invoiceId: string;
    checkoutPath: string;
    recipientAddress: string;
    label: string;
    baseAmountZec: string;
    exactAmountZec: string;
    amountCodeZats: string;
    creationHeight: number;
    expiresAt: string;
    confirmationTarget: number;
    network: "testnet";
    createdAt: string;
  };
  merchantManagement: {
    invoiceId: string;
    managementPath: string;
    managementToken: string;
  };
  rpcEvidence: readonly RpcEvidenceItem[];
}

type CreateInvoiceField = keyof CreateInvoiceRequest;

export class CreateInvoiceInputError extends Error {
  constructor(
    message: string,
    readonly field?: CreateInvoiceField,
  ) {
    super(message);
    this.name = "CreateInvoiceInputError";
  }
}

export class CreateInvoiceUnavailableError extends Error {
  constructor() {
    super("Invoice creation is temporarily unavailable. Please try again.");
    this.name = "CreateInvoiceUnavailableError";
  }
}

export interface CreateInvoiceDependencies {
  rpcClient: Pick<ZcashRpcClient, "call">;
  invoiceRepository: InvoiceRepository;
  managementSecret: string;
  now?: () => Date;
  invoiceIdFactory?: () => string;
  managementTokenFactory?: () => string;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CreateInvoiceInputError(
      "The request body must be a JSON object.",
    );
  }
  return value as Record<string, unknown>;
}

function requireString(
  input: Record<string, unknown>,
  field: CreateInvoiceField,
): string {
  const value = input[field];
  if (typeof value !== "string") {
    throw new CreateInvoiceInputError(`${field} must be a string.`, field);
  }
  return value.trim();
}

function parseBoundedInteger(
  value: string,
  field: CreateInvoiceField,
  minimum: number,
  maximum: number,
): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new CreateInvoiceInputError(
      `${field} must be a whole number from ${minimum} to ${maximum}.`,
      field,
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new CreateInvoiceInputError(
      `${field} must be a whole number from ${minimum} to ${maximum}.`,
      field,
    );
  }
  return parsed;
}

export function parseCreateInvoiceRequest(value: unknown): {
  input: CreateInvoiceRequest;
  baseAmountZatoshis: bigint;
  expiryMinutes: number;
  confirmationTarget: number;
} {
  const record = requireRecord(value);
  const recipientAddress = requireString(record, "recipientAddress");
  const amountZec = requireString(record, "amountZec");
  const label = requireString(record, "label");
  const expiryMinutesValue = requireString(record, "expiryMinutes");
  const confirmationTargetValue = requireString(record, "confirmationTarget");

  if (recipientAddress.length > 128) {
    throw new CreateInvoiceInputError(
      "The recipient address is too long.",
      "recipientAddress",
    );
  }
  if (
    !recipientAddress.startsWith("tm") &&
    !recipientAddress.startsWith("t2")
  ) {
    throw new CreateInvoiceInputError(
      "Use a transparent Zcash Testnet address. Mainnet, shielded, and Unified addresses are not supported.",
      "recipientAddress",
    );
  }
  if (label.length < 1 || label.length > 80) {
    throw new CreateInvoiceInputError(
      "The label must contain 1 to 80 characters.",
      "label",
    );
  }

  let baseAmountZatoshis: bigint;
  try {
    baseAmountZatoshis = parseZcashAmountToZatoshis(amountZec);
  } catch (error) {
    if (error instanceof MoneyInputError) {
      throw new CreateInvoiceInputError(error.message, "amountZec");
    }
    throw error;
  }

  return {
    input: {
      recipientAddress,
      amountZec,
      label,
      expiryMinutes: expiryMinutesValue,
      confirmationTarget: confirmationTargetValue,
    },
    baseAmountZatoshis,
    expiryMinutes: parseBoundedInteger(
      expiryMinutesValue,
      "expiryMinutes",
      5,
      1_440,
    ),
    confirmationTarget: parseBoundedInteger(
      confirmationTargetValue,
      "confirmationTarget",
      1,
      10,
    ),
  };
}

function hashManagementToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export async function createInvoice(
  value: unknown,
  dependencies: CreateInvoiceDependencies,
): Promise<CreateInvoiceResponse> {
  const parsed = parseCreateInvoiceRequest(value);
  const now = (dependencies.now ?? (() => new Date()))();

  try {
    const [addressValidation, blockchainInfo, blockCount] = await Promise.all([
      dependencies.rpcClient.call("validateaddress", [
        parsed.input.recipientAddress,
      ]),
      dependencies.rpcClient.call("getblockchaininfo", []),
      dependencies.rpcClient.call("getblockcount", []),
    ]);

    if (
      !addressValidation.result.isvalid ||
      (addressValidation.result.address !== undefined &&
        addressValidation.result.address !== parsed.input.recipientAddress)
    ) {
      throw new CreateInvoiceInputError(
        "The transparent Testnet address is not valid.",
        "recipientAddress",
      );
    }
    if (blockchainInfo.result.chain !== "test") {
      throw new CreateInvoiceUnavailableError();
    }

    const invoiceId = (dependencies.invoiceIdFactory ?? randomUUID)();
    const managementToken = (
      dependencies.managementTokenFactory ??
      (() => randomBytes(32).toString("base64url"))
    )();
    const expiresAt = new Date(
      now.getTime() + parsed.expiryMinutes * 60_000,
    ).toISOString();
    const invoice = await dependencies.invoiceRepository.create({
      id: invoiceId,
      managementTokenHash: hashManagementToken(
        managementToken,
        dependencies.managementSecret,
      ),
      recipientAddress: parsed.input.recipientAddress,
      label: parsed.input.label,
      baseAmountZatoshis: parsed.baseAmountZatoshis,
      creationHeight: blockCount.result,
      expiresAt,
      confirmationTarget: parsed.confirmationTarget,
      createdAt: now.toISOString(),
    });

    return {
      publicCheckout: {
        invoiceId,
        checkoutPath: `/checkout/${encodeURIComponent(invoiceId)}`,
        recipientAddress: invoice.recipientAddress,
        label: invoice.label,
        baseAmountZec: formatZatoshis(invoice.baseAmountZatoshis),
        exactAmountZec: formatZatoshis(invoice.expectedAmountZatoshis),
        amountCodeZats: invoice.amountCodeZatoshis.toString(),
        creationHeight: invoice.creationHeight,
        expiresAt: invoice.expiresAt,
        confirmationTarget: invoice.confirmationTarget,
        network: "testnet",
        createdAt: invoice.createdAt,
      },
      merchantManagement: {
        invoiceId,
        managementPath: `/merchant/invoices/${encodeURIComponent(invoiceId)}`,
        managementToken,
      },
      rpcEvidence: [
        addressValidation.evidence,
        blockchainInfo.evidence,
        blockCount.evidence,
      ],
    };
  } catch (error) {
    if (error instanceof CreateInvoiceInputError) throw error;
    if (error instanceof CreateInvoiceUnavailableError) throw error;
    if (error instanceof RpcClientError) {
      throw new CreateInvoiceUnavailableError();
    }
    throw error;
  }
}

export function createInvoiceWithDefaults(value: unknown) {
  const config = readDatabaseRuntimeConfig();
  return createInvoice(value, {
    rpcClient: getZcashRpcClient(),
    invoiceRepository: new InvoiceRepository(getDatabase()),
    managementSecret: config.managementSecret,
  });
}
