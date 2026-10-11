/**
 * Shared pieces for the paged tree sources (City of Melbourne inventory, Vicmap Tree Urban).
 *
 * Each page gets its own time limit instead of one budget for the whole source, so a slow
 * ArcGIS or Opendatasoft page fails on its own and the pages that did arrive are kept. A source
 * that loads nothing, or only part of the frame, reports why, so the Tree sizes panel can say so.
 */

/** Per-request limit for one page of tree points. */
export const TREE_PAGE_TIMEOUT_MS = 20_000;

export class TreePageTimeoutError extends Error {
  constructor(source: string, ms: number) {
    super(`${source} took longer than ${Math.round(ms / 1000)} s for one page.`);
    this.name = "TreePageTimeoutError";
  }
}

/** fetch() with its own timeout that also follows the caller's signal. */
export async function fetchTreePage(
  url: string | URL,
  init: RequestInit,
  source: string,
  signal?: AbortSignal,
  timeoutMs = TREE_PAGE_TIMEOUT_MS,
): Promise<Response> {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const follow = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", follow);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut && !signal?.aborted) throw new TreePageTimeoutError(source, timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", follow);
  }
}

/** Points from a paged source, and whether every page arrived. */
export type TreeSourceResult<T> = {
  rows: T[];
  /** null when every page loaded (or the source has nothing for this frame). */
  error: string | null;
  /** True when some pages loaded and a later one failed. */
  partial: boolean;
};

export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** An HTTP answer from a tree source, kept so a retry can tell transient from permanent. */
export class TreeSourceHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TreeSourceHttpError";
  }
}

/** Pause before the single retry of a failed page. */
export const TREE_PAGE_RETRY_MS = 1500;

/**
 * ArcGIS sometimes answers a valid query with HTTP 400 or an "Unable to perform query" error body
 * under load (seen live at East Melbourne, 12 Oct 2026), and either host can stall or 5xx. Those
 * are worth one more try. Auth and rate-limit answers (401, 403, 429) are not retried.
 */
export function transientTreePageError(err: unknown): boolean {
  if (err instanceof TreePageTimeoutError) return true;
  if (err instanceof TreeSourceHttpError) return err.status === 400 || err.status === 408 || err.status >= 500;
  if (err instanceof DOMException && err.name === "AbortError") return false;
  // Network errors (TypeError from fetch) and ArcGIS error bodies.
  return err instanceof TypeError || (err instanceof Error && /unable to perform query|could not be queried/i.test(err.message));
}

/** Run one page read, and once more after {@link TREE_PAGE_RETRY_MS} when the failure looks transient. */
export async function readTreePageWithRetry<T>(
  read: () => Promise<T>,
  signal?: AbortSignal,
  retryMs = TREE_PAGE_RETRY_MS,
): Promise<T> {
  try {
    return await read();
  } catch (err) {
    if (signal?.aborted || !transientTreePageError(err)) throw err;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, retryMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });
    return read();
  }
}
