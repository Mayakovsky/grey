// withTimeout — bound a one-shot pipeline run by racing it against a timer (M3.5 §19.2).
// Simpler than JobRouter's AbortController form (JobRouter:1855-1870): the grey run variants aren't
// mid-flight-abortable (their sub-resolvers carry their own fetch/crawl timeouts), so this races the
// variant promise against a rejecting timer and clears the timer on both paths. PIPELINE_TIMEOUT_MS
// matches production (JobRouter:207, 240_000 / 4 min). On expiry the underlying variant keeps running
// to completion in the background (a late grey_two write is harmless, parallel infra); the caller
// gets a prompt timeout rejection and returns the insufficientData sentinel (spec §2.10 step 6).
export const PIPELINE_TIMEOUT_MS = 240_000;

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = PIPELINE_TIMEOUT_MS,
  label = 'pipeline',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
