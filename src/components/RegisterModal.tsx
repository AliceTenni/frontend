import React, { useState } from "react";
import { prepareRegisterTx, submitRegisterTx, RegistrationError } from "../api/resources.js";
import { signWithFreighter } from "../lib/freighter.js";

interface RegisterModalProps {
  resourceId: string;
  apiKey: string;
  onClose: () => void;
  onConfirmed: (txHash: string) => void;
}

type RegistrationState = "preparing" | "signing" | "submitting" | "success" | "failed";

export function RegisterModal({ resourceId, apiKey, onClose, onConfirmed }: RegisterModalProps) {
  const [state, setState] = useState<RegistrationState>("preparing");
  const [error, setError] = useState<string>("");
  const [nextSteps, setNextSteps] = useState<string[]>([]);
  const [failedTxHash, setFailedTxHash] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [unsignedXdr, setUnsignedXdr] = useState<string>("");
  const [networkPassphrase, setNetworkPassphrase] = useState<string>("");
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");

  // Prepare once on open; retries call prepareTransaction() explicitly.
  React.useEffect(() => {
    prepareTransaction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function generateIdempotencyKey(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function prepareTransaction() {
    try {
      setState("preparing");
      setError("");
      setNextSteps([]);
      setFailedTxHash("");
      const key = idempotencyKey || generateIdempotencyKey();
      setIdempotencyKey(key);
      const result = await prepareRegisterTx(resourceId, apiKey, key);
      setUnsignedXdr(result.unsignedXdr);
      setNetworkPassphrase(result.networkPassphrase);
      setState("signing");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to prepare transaction. Please check your connection and try again."
      );
      setState("failed");
    }
  }

  async function signAndSubmit() {
    try {
      setState("submitting");

      const signedXdr = await signWithFreighter(unsignedXdr, networkPassphrase);

      // Submit the signed transaction
      const result = await submitRegisterTx(resourceId, signedXdr, apiKey, idempotencyKey);
      setTxHash(result.txHash);
      setState("success");
      onConfirmed(result.txHash);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to sign or submit transaction. Ensure Freighter is unlocked and connected to the correct network, then try again."
      );
      if (err instanceof RegistrationError) {
        setNextSteps(err.nextSteps ?? []);
        setFailedTxHash(err.txHash ?? "");
      }
      setState("failed");
    }
  }

  function getExplorerUrl(hash: string): string {
    const isTestnet = networkPassphrase.includes("Test");
    const baseUrl = isTestnet
      ? "https://stellar.expert/explorer/testnet"
      : "https://stellar.expert/explorer/public";
    return `${baseUrl}/tx/${hash}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black bg-opacity-50 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-none overflow-y-auto rounded-none bg-surface-raised p-4 shadow-xl sm:max-w-md sm:rounded-lg sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-fg">Register on Blockchain</h2>
          <button
            onClick={onClose}
            className="text-fg-subtle hover:text-fg"
            disabled={state === "submitting"}
          >
            ✕
          </button>
        </div>

        <div className="mb-6">
          {state === "preparing" && (
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
              <span className="text-sm text-fg-muted">Preparing transaction...</span>
            </div>
          )}

          {state === "signing" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft">
                  <span className="text-sm font-medium text-accent-text">1</span>
                </div>
                <span className="text-sm text-fg">Ready to sign transaction</span>
              </div>
              <p className="text-sm text-fg-muted">
                Click "Sign & Submit" to open your Freighter wallet and sign the registration
                transaction.
              </p>
            </div>
          )}

          {state === "submitting" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
                <span className="text-sm text-fg-muted">Submitting to blockchain...</span>
              </div>
              <p className="text-sm text-fg-muted">
                This may take up to 30 seconds. Please wait...
              </p>
            </div>
          )}

          {state === "success" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success-soft">
                  <span className="text-success">✓</span>
                </div>
                <span className="text-sm font-medium text-success">Registration successful!</span>
              </div>
              <p className="text-sm text-fg-muted">
                Your resource has been registered on the Stellar blockchain.
              </p>
              {txHash && (
                <a
                  href={getExplorerUrl(txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-accent-text hover:bg-accent/15"
                >
                  View on Stellar Explorer
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              )}
            </div>
          )}

          {state === "failed" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-danger-soft">
                  <span className="text-danger">✕</span>
                </div>
                <span className="text-sm font-medium text-danger">Registration failed</span>
              </div>
              <p className="text-sm text-danger">{error}</p>

              {nextSteps.length > 0 && (
                <div className="rounded-lg bg-warning-soft p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warning">
                    What to do next
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-warning">
                    {nextSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}

              {failedTxHash && (
                <a
                  href={getExplorerUrl(failedTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-accent-text hover:bg-accent/15"
                >
                  Check transaction status on Stellar Explorer
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
          {state === "signing" && (
            <button
              onClick={signAndSubmit}
              className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white hover:bg-accent-hover sm:flex-1 sm:py-2"
            >
              Sign & Submit
            </button>
          )}

          {state === "failed" && (
            <button
              onClick={prepareTransaction}
              className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white hover:bg-accent-hover sm:flex-1 sm:py-2"
            >
              Try Again
            </button>
          )}

          <button
            onClick={onClose}
            disabled={state === "submitting"}
            className="w-full rounded-lg border border-line-strong px-4 py-3 text-sm font-medium text-fg hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1 sm:py-2"
          >
            {state === "success" ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
