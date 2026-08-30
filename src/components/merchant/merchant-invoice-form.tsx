"use client";

import { useId, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import type {
  MerchantFormErrors,
  MerchantFormField,
  MerchantInvoiceFormProps,
  MerchantInvoiceFormValues,
  RecentInvoiceSummary,
} from "@/types";

import styles from "./merchant-invoice-form.module.css";

const EXPIRY_OPTIONS = [
  ["15", "15 minutes"],
  ["30", "30 minutes"],
  ["60", "1 hour"],
  ["120", "2 hours"],
  ["1440", "24 hours"],
] as const;

const CONFIRMATION_OPTIONS = [
  ["1", "1 confirmation"],
  ["2", "2 confirmations"],
  ["3", "3 confirmations"],
  ["6", "6 confirmations"],
  ["10", "10 confirmations"],
] as const;

const TESTNET_TRANSPARENT_ADDRESS = /^(?:tm|t2)[1-9A-HJ-NP-Za-km-z]{33}$/;
const TAZ_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;

const STATUS_LABELS: Record<RecentInvoiceSummary["status"], string> = {
  waiting: "Waiting",
  pending: "Payment pending",
  pending_after_expiry: "Pending after expiry",
  partial: "Partially paid",
  confirming: "Confirming",
  paid: "Paid",
  overpaid: "Overpaid",
  expired: "Expired",
  expired_partial: "Expired · partial",
};

function validate(values: MerchantInvoiceFormValues): MerchantFormErrors {
  const errors: MerchantFormErrors = {};
  const address = values.recipientAddress.trim();
  const amount = values.amountZec.trim();

  if (!address) {
    errors.recipientAddress = "Enter a transparent Zcash Testnet address.";
  } else if (!TESTNET_TRANSPARENT_ADDRESS.test(address)) {
    errors.recipientAddress =
      "Enter a Testnet transparent address beginning with tm or t2. Shielded and Unified recipients are not supported in this MVP.";
  }

  if (!amount) {
    errors.amountZec = "Enter the amount the customer should send.";
  } else if (!TAZ_AMOUNT.test(amount) || !/[1-9]/.test(amount)) {
    errors.amountZec =
      "Enter a positive TAZ amount with no more than eight decimal places.";
  }

  if (!values.label.trim()) {
    errors.label = "Enter an invoice label or description.";
  }

  if (!values.expiryMinutes) {
    errors.expiryMinutes = "Choose when this invoice should expire.";
  }

  if (!values.confirmationTarget) {
    errors.confirmationTarget = "Choose a confirmation target.";
  }

  return errors;
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function RecentInvoices({
  invoices,
}: {
  invoices: NonNullable<MerchantInvoiceFormProps["recentInvoices"]>;
}) {
  return (
    <section className={styles.recent} aria-labelledby="recent-invoices-title">
      <div className={styles.recentHeading}>
        <div>
          <span className={styles.eyebrow}>Merchant activity</span>
          <h2 id="recent-invoices-title">Recent invoices</h2>
        </div>
        <span>{invoices.length} shown</span>
      </div>

      {invoices.length === 0 ? (
        <p className={styles.emptyState}>
          New payment requests will appear here after they are created.
        </p>
      ) : (
        <ul className={styles.invoiceList}>
          {invoices.map((invoice) => (
            <li key={invoice.invoiceId}>
              <a className={styles.invoiceCard} href={invoice.checkoutUrl}>
                <span className={styles.invoiceIdentity}>
                  <strong>{invoice.label}</strong>
                  <span className={styles.invoiceMeta}>
                    <span className={styles.mono}>{invoice.invoiceId}</span>
                    <time dateTime={invoice.createdAt}>
                      {formatCreatedAt(invoice.createdAt)} UTC
                    </time>
                  </span>
                </span>
                <span className={styles.invoiceAmount}>
                  <strong className={styles.mono}>
                    {invoice.exactAmountZec} TAZ
                  </strong>
                  <span
                    className={`${styles.status} ${styles[`status_${invoice.status}`]}`}
                  >
                    {STATUS_LABELS[invoice.status]}
                  </span>
                </span>
                <span aria-hidden className={styles.invoiceArrow}>
                  →
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function MerchantInvoiceForm({
  initialValues,
  addressValidation,
  submission,
  fieldErrors,
  recentInvoices,
  onAddressBlur,
  onSubmit,
}: MerchantInvoiceFormProps) {
  const idPrefix = useId();
  const [values, setValues] = useState(initialValues);
  const [clientErrors, setClientErrors] = useState<MerchantFormErrors>({});
  const [ignoredAddressValidation, setIgnoredAddressValidation] = useState<
    string | undefined
  >();
  const [dismissedFieldErrors, setDismissedFieldErrors] =
    useState<MerchantFormErrors>({});

  const isSubmitting = submission.status === "submitting";
  const addressValidationKey = [
    addressValidation.status,
    "message" in addressValidation ? addressValidation.message : "",
  ].join(":");
  const currentAddressValidation =
    ignoredAddressValidation === addressValidationKey
      ? ({ status: "idle" } as const)
      : addressValidation;
  const getError = (field: MerchantFormField) => {
    const suppliedError = fieldErrors?.[field];
    const activeSuppliedError =
      suppliedError && dismissedFieldErrors[field] !== suppliedError
        ? suppliedError
        : undefined;

    return activeSuppliedError ?? clientErrors[field];
  };

  function updateValue(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    const field = event.target.name as MerchantFormField;
    const value = event.target.value;

    setValues((current) => ({ ...current, [field]: value }));
    if (field === "recipientAddress") {
      setIgnoredAddressValidation(addressValidationKey);
    }
    const suppliedError = fieldErrors?.[field];
    if (suppliedError) {
      setDismissedFieldErrors((current) => ({
        ...current,
        [field]: suppliedError,
      }));
    }
    setClientErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextValues = {
      ...values,
      recipientAddress: values.recipientAddress.trim(),
      amountZec: values.amountZec.trim(),
      label: values.label.trim(),
    };
    const nextErrors = validate(nextValues);

    if (currentAddressValidation.status === "invalid") {
      nextErrors.recipientAddress = currentAddressValidation.message;
    }

    setClientErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    void onSubmit(nextValues);
  }

  const addressError = getError("recipientAddress");
  const addressStatusId = `${idPrefix}-address-status`;
  const addressDescription = [
    `${idPrefix}-address-hint`,
    addressError || currentAddressValidation.status !== "idle"
      ? addressStatusId
      : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.workspace}>
      <section className={styles.creator} aria-labelledby={`${idPrefix}-title`}>
        <div className={styles.intro}>
          <span className={styles.eyebrow}>
            Zcash Testnet · transparent only
          </span>
          <h1 id={`${idPrefix}-title`}>Create a payment request.</h1>
          <p>
            Set the exact amount your customer should send to your transparent
            Testnet address.
          </p>
        </div>

        <div className={styles.layout}>
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <div className={styles.labelRow}>
                <label htmlFor={`${idPrefix}-recipient`}>
                  Merchant Testnet address
                </label>
                <span>Required</span>
              </div>
              <p className={styles.hint} id={`${idPrefix}-address-hint`}>
                Transparent addresses begin with{" "}
                <span className={styles.mono}>tm</span> or{" "}
                <span className={styles.mono}>t2</span>. Shielded and Unified
                recipients are not supported in this MVP.
              </p>
              <input
                aria-describedby={addressDescription}
                aria-invalid={Boolean(addressError)}
                autoComplete="off"
                className={styles.mono}
                disabled={isSubmitting}
                id={`${idPrefix}-recipient`}
                name="recipientAddress"
                onBlur={(event) =>
                  onAddressBlur?.(event.currentTarget.value.trim())
                }
                onChange={updateValue}
                placeholder="tm…"
                spellCheck={false}
                type="text"
                value={values.recipientAddress}
              />
              <div
                className={`${styles.fieldMessage} ${
                  addressError || currentAddressValidation.status === "invalid"
                    ? styles.messageError
                    : currentAddressValidation.status === "valid"
                      ? styles.messageSuccess
                      : currentAddressValidation.status === "unavailable"
                        ? styles.messageInfo
                        : ""
                }`}
                id={addressStatusId}
                role={addressError ? "alert" : "status"}
              >
                {addressError ? (
                  addressError
                ) : currentAddressValidation.status === "checking" ? (
                  (currentAddressValidation.message ??
                  "Checking this Testnet address…")
                ) : currentAddressValidation.status === "valid" ? (
                  (currentAddressValidation.message ?? "Address looks good.")
                ) : currentAddressValidation.status === "invalid" ? (
                  currentAddressValidation.message
                ) : currentAddressValidation.status === "unavailable" ? (
                  <>
                    <span>{currentAddressValidation.message}</span>
                    {onAddressBlur ? (
                      <button
                        className={styles.inlineButton}
                        onClick={() =>
                          onAddressBlur(values.recipientAddress.trim())
                        }
                        type="button"
                      >
                        Check again
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            <div className={styles.field}>
              <div className={styles.labelRow}>
                <label htmlFor={`${idPrefix}-amount`}>Amount</label>
                <span>TAZ</span>
              </div>
              <p className={styles.hint} id={`${idPrefix}-amount-hint`}>
                Enter a positive amount with up to eight decimal places.
              </p>
              <div className={styles.amountControl}>
                <input
                  aria-describedby={`${idPrefix}-amount-hint ${idPrefix}-amount-error`}
                  aria-invalid={Boolean(getError("amountZec"))}
                  className={styles.mono}
                  disabled={isSubmitting}
                  id={`${idPrefix}-amount`}
                  inputMode="decimal"
                  name="amountZec"
                  onChange={updateValue}
                  placeholder="0.042"
                  type="text"
                  value={values.amountZec}
                />
                <span aria-hidden>TAZ</span>
              </div>
              <p
                className={`${styles.fieldMessage} ${styles.messageError}`}
                id={`${idPrefix}-amount-error`}
                role={getError("amountZec") ? "alert" : undefined}
              >
                {getError("amountZec")}
              </p>
            </div>

            <div className={styles.field}>
              <label htmlFor={`${idPrefix}-label`}>
                Invoice label or description
              </label>
              <p className={styles.hint} id={`${idPrefix}-label-hint`}>
                Shown on the checkout and receipt.
              </p>
              <input
                aria-describedby={`${idPrefix}-label-hint ${idPrefix}-label-error`}
                aria-invalid={Boolean(getError("label"))}
                disabled={isSubmitting}
                id={`${idPrefix}-label`}
                maxLength={120}
                name="label"
                onChange={updateValue}
                placeholder="Order #1048"
                type="text"
                value={values.label}
              />
              <p
                className={`${styles.fieldMessage} ${styles.messageError}`}
                id={`${idPrefix}-label-error`}
                role={getError("label") ? "alert" : undefined}
              >
                {getError("label")}
              </p>
            </div>

            <div className={styles.selectionGrid}>
              <div className={styles.field}>
                <label htmlFor={`${idPrefix}-expiry`}>Expires after</label>
                <select
                  aria-describedby={`${idPrefix}-expiry-error`}
                  aria-invalid={Boolean(getError("expiryMinutes"))}
                  disabled={isSubmitting}
                  id={`${idPrefix}-expiry`}
                  name="expiryMinutes"
                  onChange={updateValue}
                  value={values.expiryMinutes}
                >
                  <option value="">Select an expiry</option>
                  {EXPIRY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <p
                  className={`${styles.fieldMessage} ${styles.messageError}`}
                  id={`${idPrefix}-expiry-error`}
                  role={getError("expiryMinutes") ? "alert" : undefined}
                >
                  {getError("expiryMinutes")}
                </p>
              </div>

              <div className={styles.field}>
                <label htmlFor={`${idPrefix}-confirmations`}>
                  Confirmations required
                </label>
                <select
                  aria-describedby={`${idPrefix}-confirmation-hint ${idPrefix}-confirmation-error`}
                  aria-invalid={Boolean(getError("confirmationTarget"))}
                  disabled={isSubmitting}
                  id={`${idPrefix}-confirmations`}
                  name="confirmationTarget"
                  onChange={updateValue}
                  value={values.confirmationTarget}
                >
                  <option value="">Select confirmations</option>
                  {CONFIRMATION_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <p className={styles.hint} id={`${idPrefix}-confirmation-hint`}>
                  A low Testnet target is faster, not a guarantee of
                  irreversibility.
                </p>
                <p
                  className={`${styles.fieldMessage} ${styles.messageError}`}
                  id={`${idPrefix}-confirmation-error`}
                  role={getError("confirmationTarget") ? "alert" : undefined}
                >
                  {getError("confirmationTarget")}
                </p>
              </div>
            </div>

            <div className={styles.submitRow}>
              <button
                aria-busy={isSubmitting}
                className={styles.submitButton}
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Creating invoice…" : "Create invoice"}
                <span aria-hidden>→</span>
              </button>
              <p>
                Client checks help catch mistakes. The server still validates
                every invoice before it is created.
              </p>
            </div>

            <div className={styles.submissionStatus} aria-live="polite">
              {submission.status === "error" ? (
                <div className={styles.serverError} role="alert">
                  <strong>Invoice could not be created.</strong>
                  <span>{submission.message}</span>
                </div>
              ) : submission.status === "success" ? (
                <div className={styles.successPanel} role="status">
                  <span>
                    <strong>Invoice created.</strong>
                    <span className={styles.mono}>{submission.invoiceId}</span>
                  </span>
                  <a href={submission.checkoutUrl}>Open checkout →</a>
                </div>
              ) : null}
            </div>
          </form>

          <aside
            className={styles.explainer}
            aria-labelledby={`${idPrefix}-next`}
          >
            <span className={styles.eyebrow}>Callback-driven workflow</span>
            <h2 id={`${idPrefix}-next`}>What happens next</h2>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Address checked</strong>
                  <p>
                    The supplied validation callback checks the transparent
                    Testnet recipient.
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Invoice saved</strong>
                  <p>
                    The form sends decimal strings through the supplied submit
                    callback—never directly to an API.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Verification begins</strong>
                  <p>
                    Payment state comes from the verifier. This interface does
                    not infer settlement.
                  </p>
                </div>
              </li>
            </ol>
            <div className={styles.testnetNotice}>
              <strong>Zcash Testnet only</strong>
              <p>
                Use TAZ, which has no real monetary value. Transparent addresses
                and amounts are publicly visible; shielded and Unified
                recipients are outside this MVP.
              </p>
            </div>
          </aside>
        </div>
      </section>

      {recentInvoices ? <RecentInvoices invoices={recentInvoices} /> : null}
    </div>
  );
}
