"use client";

import { useCallback, useEffect, useState } from "react";

import { MerchantInvoiceForm } from "@/components/merchant";
import type { CreateInvoiceResponse } from "@/lib/invoices/create-invoice";
import type {
  AddressValidationViewModel,
  MerchantFormErrors,
  MerchantFormField,
  MerchantFormSubmissionState,
  MerchantInvoiceFormValues,
  RecentInvoiceSummary,
  SafePaymentStatus,
} from "@/types";

const RECENT_INVOICES_KEY = "zecceipt:recent-invoices:v1";
const RECENT_INVOICE_LIMIT = 6;
const SAFE_PAYMENT_STATUSES = new Set<SafePaymentStatus>([
  "waiting",
  "partial",
  "confirming",
  "paid",
  "overpaid",
  "expired",
  "expired_partial",
]);

const initialValues: MerchantInvoiceFormValues = {
  recipientAddress: "",
  amountZec: "",
  label: "",
  expiryMinutes: "30",
  confirmationTarget: "1",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecentInvoices(): RecentInvoiceSummary[] {
  try {
    const raw = localStorage.getItem(RECENT_INVOICES_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];

    return value
      .filter(
        (item): item is RecentInvoiceSummary =>
          isRecord(item) &&
          typeof item.invoiceId === "string" &&
          typeof item.label === "string" &&
          typeof item.exactAmountZec === "string" &&
          typeof item.status === "string" &&
          SAFE_PAYMENT_STATUSES.has(item.status as SafePaymentStatus) &&
          typeof item.createdAt === "string" &&
          typeof item.checkoutUrl === "string",
      )
      .slice(0, RECENT_INVOICE_LIMIT);
  } catch {
    return [];
  }
}

function saveRecentInvoices(invoices: readonly RecentInvoiceSummary[]) {
  try {
    localStorage.setItem(RECENT_INVOICES_KEY, JSON.stringify(invoices));
  } catch {
    // Invoice creation still succeeds when browser storage is unavailable.
  }
}

function getApiError(value: unknown): {
  message: string;
  field?: MerchantFormField;
} {
  if (!isRecord(value) || !isRecord(value.error)) {
    return { message: "The server returned an unexpected response." };
  }
  const message =
    typeof value.error.message === "string"
      ? value.error.message
      : "The request could not be completed.";
  const field = value.error.field;
  const validFields: readonly MerchantFormField[] = [
    "recipientAddress",
    "amountZec",
    "label",
    "expiryMinutes",
    "confirmationTarget",
  ];

  return {
    message,
    ...(typeof field === "string" &&
    validFields.includes(field as MerchantFormField)
      ? { field: field as MerchantFormField }
      : {}),
  };
}

function isCreateInvoiceResponse(
  value: unknown,
): value is CreateInvoiceResponse {
  return (
    isRecord(value) &&
    isRecord(value.publicCheckout) &&
    typeof value.publicCheckout.invoiceId === "string" &&
    typeof value.publicCheckout.checkoutPath === "string" &&
    typeof value.publicCheckout.label === "string" &&
    typeof value.publicCheckout.exactAmountZec === "string" &&
    typeof value.publicCheckout.createdAt === "string"
  );
}

export function CreateInvoiceExperience() {
  const [addressValidation, setAddressValidation] =
    useState<AddressValidationViewModel>({ status: "idle" });
  const [submission, setSubmission] = useState<MerchantFormSubmissionState>({
    status: "idle",
  });
  const [fieldErrors, setFieldErrors] = useState<MerchantFormErrors>({});
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoiceSummary[]>(
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const loadRecentInvoices = async () => {
      await Promise.resolve();
      const stored = readRecentInvoices();
      if (cancelled) return;
      setRecentInvoices(stored);

      if (stored.length === 0) return;
      const refreshed = await Promise.all(
        stored.map(async (invoice) => {
          try {
            const response = await fetch(
              `/api/invoices/${encodeURIComponent(invoice.invoiceId)}/status`,
              { cache: "no-store" },
            );
            const body: unknown = await response.json();
            if (
              !response.ok ||
              !isRecord(body) ||
              !isRecord(body.payment) ||
              typeof body.payment.status !== "string" ||
              !SAFE_PAYMENT_STATUSES.has(
                body.payment.status as SafePaymentStatus,
              )
            ) {
              return invoice;
            }
            return {
              ...invoice,
              status: body.payment.status as SafePaymentStatus,
            };
          } catch {
            return invoice;
          }
        }),
      );
      if (cancelled) return;
      setRecentInvoices(refreshed);
      saveRecentInvoices(refreshed);
    };

    void loadRecentInvoices();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddressBlur = useCallback(async (address: string) => {
    if (!address.startsWith("tm") && !address.startsWith("t2")) {
      setAddressValidation({
        status: "invalid",
        message: "Enter a transparent Testnet address beginning with tm or t2.",
      });
      return;
    }

    setAddressValidation({
      status: "checking",
      message: "Checking with the Zcash Testnet node…",
    });

    try {
      const response = await fetch("/api/addresses/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
        cache: "no-store",
      });
      const body: unknown = await response.json();
      const status =
        isRecord(body) && typeof body.status === "string"
          ? body.status
          : "unavailable";
      const message =
        isRecord(body) && typeof body.message === "string"
          ? body.message
          : "Address checking is temporarily unavailable.";

      if (status === "valid") {
        setAddressValidation({ status: "valid", message });
      } else if (status === "invalid") {
        setAddressValidation({ status: "invalid", message });
      } else {
        setAddressValidation({ status: "unavailable", message });
      }
    } catch {
      setAddressValidation({
        status: "unavailable",
        message: "Address checking is temporarily unavailable.",
      });
    }
  }, []);

  const handleSubmit = useCallback(
    async (values: MerchantInvoiceFormValues) => {
      setSubmission({ status: "submitting" });
      setFieldErrors({});

      try {
        const response = await fetch("/api/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
          cache: "no-store",
        });
        const body: unknown = await response.json();

        if (!response.ok) {
          const error = getApiError(body);
          if (error.field) {
            setFieldErrors({ [error.field]: error.message });
          }
          setSubmission({ status: "error", message: error.message });
          return;
        }
        if (!isCreateInvoiceResponse(body)) {
          setSubmission({
            status: "error",
            message: "The server returned an incomplete invoice.",
          });
          return;
        }

        const created: RecentInvoiceSummary = {
          invoiceId: body.publicCheckout.invoiceId,
          label: body.publicCheckout.label,
          exactAmountZec: body.publicCheckout.exactAmountZec,
          status: "waiting",
          createdAt: body.publicCheckout.createdAt,
          checkoutUrl: body.publicCheckout.checkoutPath,
        };
        setRecentInvoices((current) => {
          const next = [
            created,
            ...current.filter(
              (invoice) => invoice.invoiceId !== created.invoiceId,
            ),
          ].slice(0, RECENT_INVOICE_LIMIT);
          saveRecentInvoices(next);
          return next;
        });
        setSubmission({
          status: "success",
          invoiceId: created.invoiceId,
          checkoutUrl: created.checkoutUrl,
        });
      } catch {
        setSubmission({
          status: "error",
          message: "Invoice creation is temporarily unavailable. Try again.",
        });
      }
    },
    [],
  );

  return (
    <MerchantInvoiceForm
      initialValues={initialValues}
      addressValidation={addressValidation}
      submission={submission}
      fieldErrors={fieldErrors}
      recentInvoices={recentInvoices}
      onAddressBlur={handleAddressBlur}
      onSubmit={handleSubmit}
    />
  );
}
