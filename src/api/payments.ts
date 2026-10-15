import { apiUrl, getJson, isArray } from "./http.js";

export interface PaymentReceipt {
  id: string;
  resourceId: string;
  amount: string;
  payerAddress: string;
  recipientAddress: string;
  paidAt: string;
}

function receiptPath(paymentId: string): string {
  return `/payments/${encodeURIComponent(paymentId)}/receipt`;
}

export async function fetchReceipt(paymentId: string): Promise<PaymentReceipt> {
  return getJson<PaymentReceipt>(receiptPath(paymentId), "Failed to load receipt");
}

export async function fetchBuyerPayments(address: string): Promise<PaymentReceipt[]> {
  return getJson<PaymentReceipt[]>(
    `/buyers/${encodeURIComponent(address)}/payments`,
    "Failed to load purchases",
    undefined,
    isArray,
  );
}

/** Public URL of a payment receipt, for linking. */
export function receiptUrl(paymentId: string): string {
  return apiUrl(receiptPath(paymentId));
}