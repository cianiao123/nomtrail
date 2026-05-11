export function isConstrainedServerlessRuntime(): boolean {
  return process.env.VERCEL === "1"
    || process.env.EDGEONE === "1"
    || process.env.EDGEONE_PAGES === "1"
    || process.env.NODE_ENV === "production";
}

export function isRequestTerminationError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const name = err && typeof err === "object" && "name" in err
    ? String((err as { name?: unknown }).name)
    : "";
  return name === "AbortError"
    || /abort|aborted|operation was aborted|terminated/i.test(message);
}
