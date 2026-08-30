import type { IsoDateTime } from "@/types/network";

export type AddressValidationViewModel =
  | { status: "idle" }
  | { status: "checking"; message?: string }
  | { status: "valid"; message?: string }
  | { status: "invalid"; message: string }
  | { status: "unavailable"; message: string };

export interface MerchantInvoiceFormValues {
  recipientAddress: string;
  amountZec: string;
  label: string;
  expiryMinutes: string;
  confirmationTarget: string;
}

export type MerchantFormField = keyof MerchantInvoiceFormValues;

export type MerchantFormErrors = Partial<Record<MerchantFormField, string>>;

export type MerchantFormSubmissionState =
  | { status: "idle" }
  | { status: "submitting"; message?: string }
  | { status: "error"; message: string }
  | { status: "success"; invoiceId: string; checkoutUrl: string };

export interface RecentInvoiceSummary {
  invoiceId: string;
  label: string;
  exactAmountZec: string;
  status:
    | "waiting"
    | "pending"
    | "pending_after_expiry"
    | "partial"
    | "confirming"
    | "paid"
    | "overpaid"
    | "expired"
    | "expired_partial";
  createdAt: IsoDateTime;
  checkoutUrl: string;
}

export interface MerchantInvoiceFormProps {
  initialValues: MerchantInvoiceFormValues;
  addressValidation: AddressValidationViewModel;
  submission: MerchantFormSubmissionState;
  fieldErrors?: MerchantFormErrors;
  recentInvoices?: readonly RecentInvoiceSummary[];
  onAddressBlur?: (address: string) => void;
  onSubmit: (values: MerchantInvoiceFormValues) => void | Promise<void>;
}
