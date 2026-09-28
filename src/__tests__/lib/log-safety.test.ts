import { describe, expect, it } from "vitest";
import {
  MAX_LOG_BATCH_CHARS,
  MAX_LOG_LINES,
  MAX_LOG_MESSAGE_CHARS,
  clampLogLineCount,
  sanitizeLogEntries,
  truncateLogMessage,
} from "@/lib/utils/log-safety";

describe("log safety", () => {
  it("clamps requested line counts", () => {
    expect(clampLogLineCount(undefined)).toBe(200);
    expect(clampLogLineCount(-10)).toBe(1);
    expect(clampLogLineCount(25.9)).toBe(25);
    expect(clampLogLineCount(MAX_LOG_LINES + 1)).toBe(MAX_LOG_LINES);
  });

  it("truncates pathological single-line output", () => {
    const message = truncateLogMessage("x".repeat(MAX_LOG_MESSAGE_CHARS + 100));
    expect(message).toHaveLength(MAX_LOG_MESSAGE_CHARS);
    expect(message).toMatch(/\u2026 \[truncated\]$/);
  });

  it("keeps the newest entries within the response budget", () => {
    const entries = Array.from({ length: 100 }, (_, index) => ({
      message: `${index}:` + "x".repeat(MAX_LOG_MESSAGE_CHARS),
      stream: "stdout" as const,
    }));

    const safe = sanitizeLogEntries(entries);
    expect(safe.length).toBeLessThan(entries.length);
    expect(safe.at(-1)?.message.startsWith("99:")).toBe(true);
    expect(safe.reduce((total, entry) => total + entry.message.length, 0))
      .toBeLessThanOrEqual(MAX_LOG_BATCH_CHARS);
  });
});
