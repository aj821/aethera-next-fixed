export const MAX_LOG_LINES = 500;
export const MAX_LOG_MESSAGE_CHARS = 8_192;
export const MAX_LOG_BATCH_CHARS = 512_000;

type LogLike = { message: string };

export function clampLogLineCount(
  value: number | undefined,
  fallback = 200,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_LOG_LINES, Math.max(1, Math.trunc(value)));
}

export function truncateLogMessage(message: string): string {
  if (message.length <= MAX_LOG_MESSAGE_CHARS) return message;

  const suffix = "\u2026 [truncated]";
  return `${message.slice(0, MAX_LOG_MESSAGE_CHARS - suffix.length)}${suffix}`;
}

/**
 * Keep the newest log entries while bounding both individual messages and the
 * total response size. Build tools can emit a single multi-megabyte line,
 * which is expensive to serialize and can freeze the browser console view.
 */
export function sanitizeLogEntries<T extends LogLike>(
  entries: T[],
  maxEntries = MAX_LOG_LINES,
): T[] {
  const safeLimit = clampLogLineCount(maxEntries, MAX_LOG_LINES);
  const result: T[] = [];
  let remainingChars = MAX_LOG_BATCH_CHARS;

  for (
    let index = entries.length - 1;
    index >= 0 && result.length < safeLimit;
    index -= 1
  ) {
    const entry = entries[index];
    const message = truncateLogMessage(entry.message);

    if (message.length > remainingChars) break;

    result.push({ ...entry, message });
    remainingChars -= message.length;
  }

  return result.reverse();
}
