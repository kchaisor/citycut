/**
 * Live-network tests (Overture, City of Melbourne, Vicmap) run only with CITYCUT_NETWORK_TESTS=1,
 * so `npm test` stays offline and does not flake on a slow or failing endpoint.
 * Run them with: CITYCUT_NETWORK_TESTS=1 npx vitest run <file>
 */
export function networkTestsEnabled(): boolean {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.CITYCUT_NETWORK_TESTS === "1";
}
