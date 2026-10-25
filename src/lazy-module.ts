import { handleChunkLoadFailure } from "./chunk-recovery";

// Failed imports can be retried; chunk recovery owns the reload policy.
export function lazyModule<T>(load: () => Promise<T>) {
  let pending: Promise<T> | undefined;
  return () => pending ??= load().catch((error) => {
    pending = undefined;
    void handleChunkLoadFailure(error);
    throw error;
  });
}
