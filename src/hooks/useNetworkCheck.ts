/**
 * Checks that Freighter's active network matches the passphrase the server
 * returned. Returns a warning string when they differ or when the check fails,
 * or null when they match.
 */
export async function checkNetwork(expectedPassphrase: string): Promise<string | null> {
  const freighter = await import("@stellar/freighter-api");
  const result = await freighter.getNetworkDetails();
  if ("error" in result && result.error) {
    // Network check failed — treat as a blocker rather than silently allowing signing.
    // This catches outdated Freighter versions, API issues, or wallet initialization problems.
    return `Unable to verify your wallet's network. Your Freighter wallet may be outdated or having connection issues. Please update Freighter and try again.`;
  }
  // Older Freighter versions nest the details under `result`.
  const details = result as { networkPassphrase?: string; result?: { networkPassphrase?: string } };
  const actual = details.networkPassphrase ?? details.result?.networkPassphrase;
  if (!actual) {
    // Network details were returned but without a passphrase — also a failure.
    return `Unable to determine your wallet's network. Please check that your Freighter wallet is properly initialized and try again.`;
  }
  if (actual === expectedPassphrase) return null;
  const label = expectedPassphrase.includes("Test")
    ? "Stellar Testnet"
    : expectedPassphrase.includes("Public")
      ? "Stellar Mainnet"
      : expectedPassphrase;
  return `Network mismatch: your wallet is on a different network. Switch Freighter to ${label} before signing.`;
}
