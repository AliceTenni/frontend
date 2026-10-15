import { useState } from "react";
import { prepareSetPrice, submitSetPrice } from "../api/resources.js";
import { checkNetwork } from "./useNetworkCheck.js";
import { signWithFreighter } from "../lib/freighter.js";

type Status = "idle" | "preparing" | "signing" | "submitting" | "confirmed" | "error";

export function useEditPrice(resourceId: string, apiKey: string) {
  const [status, setStatus] = useState<Status>("idle");
  const [newPrice, setNewPrice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);

  async function editPrice(price: string) {
    setError(null);
    setNetworkWarning(null);
    // One idempotency key per logical operation, reused across prepare/submit retries
    const idempotencyKey = crypto.randomUUID();
    try {
      // Step 1 — fetch unsigned XDR from the server
      setStatus("preparing");
      const { unsignedXdr, networkPassphrase } = await prepareSetPrice(
        resourceId,
        price,
        apiKey,
        idempotencyKey,
      );

      // Step 1b — warn if wallet is on the wrong network (non-blocking)
      const warning = await checkNetwork(networkPassphrase);
      if (warning) {
        setNetworkWarning(warning);
        setStatus("idle");
        return;
      }

      // Step 2 — ask Freighter (or any SEP-43 wallet) to sign
      setStatus("signing");
      const signedXdr = await signWithFreighter(unsignedXdr, networkPassphrase);

      // Step 3 — submit signed XDR and sync DB price
      setStatus("submitting");
      const updated = await submitSetPrice(resourceId, signedXdr, price, apiKey, idempotencyKey);
      setNewPrice(updated.price);
      setStatus("confirmed");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not update the price. Check your wallet connection and try again.",
      );
      setStatus("error");
    }
  }

  return { status, newPrice, error, networkWarning, editPrice };
}
