import { useState } from "react";
import { prepareTransferOwnership, submitTransferOwnership } from "../api/resources.js";
import { checkNetwork } from "./useNetworkCheck.js";
import { signWithFreighter } from "../lib/freighter.js";

type Status = "idle" | "preparing" | "signing" | "submitting" | "confirmed" | "error";

export function useTransferOwnership(resourceId: string, apiKey: string) {
  const [status, setStatus] = useState<Status>("idle");
  const [newOwner, setNewOwner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);

  async function transferOwnership(newCreator: string) {
    setError(null);
    setNetworkWarning(null);
    // Generate one idempotency key per transfer attempt and reuse it for
    // both the prepare and submit calls so retries are deduplicated.
    const idempotencyKey = crypto.randomUUID();
    try {
      // Step 1 — fetch unsigned XDR from the server
      setStatus("preparing");
      const { unsignedXdr, networkPassphrase } = await prepareTransferOwnership(
        resourceId,
        newCreator,
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

      // Step 3 — submit signed XDR and sync DB owner
      setStatus("submitting");
      const updated = await submitTransferOwnership(
        resourceId,
        signedXdr,
        newCreator,
        apiKey,
        idempotencyKey,
      );
      setNewOwner(updated.newCreator);
      setStatus("confirmed");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while transferring ownership. Please check your wallet connection and try again.",
      );
      setStatus("error");
    }
  }

  return { status, newOwner, error, networkWarning, transferOwnership };
}
