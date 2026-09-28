"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface ConsoleLine {
  stream: "stdout" | "stderr";
  message: string;
  timestamp: string;
}

interface UseServerConsoleOptions {
  enabled?: boolean;
  maxLines?: number;
}

interface UseServerConsoleResult {
  lines: ConsoleLine[];
  sendCommand: (command: string) => Promise<void>;
  connected: boolean;
  error: string | null;
  clear: () => void;
}

export function useServerConsole(
  serverId: string | null,
  options: UseServerConsoleOptions = {},
): UseServerConsoleResult {
  const { enabled = true, maxLines = 500 } = options;

  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLines = useRef<ConsoleLine[]>([]);

  const clear = useCallback(() => {
    pendingLines.current = [];
    setLines([]);
  }, []);

  const appendLines = useCallback(
    (incoming: ConsoleLine[]) => {
      pendingLines.current = [...pendingLines.current, ...incoming].slice(
        -maxLines,
      );
      if (flushTimer.current) return;

      flushTimer.current = setTimeout(() => {
        const batch = pendingLines.current;
        pendingLines.current = [];
        flushTimer.current = null;
        setLines((prev) => [...prev, ...batch].slice(-maxLines));
      }, 100);
    },
    [maxLines],
  );

  const sendCommand = useCallback(
    async (command: string) => {
      if (!serverId) return;
      const res = await fetch(`/api/servers/${serverId}/console`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to send command");
      }
    },
    [serverId],
  );

  useEffect(() => {
    if (!serverId || !enabled) {
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
      return;
    }

    function connect() {
      const es = new EventSource(
        `/api/servers/${serverId}/console/stream`,
      );
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setError(null);
      };

      // Live output lines
      es.onmessage = (event) => {
        try {
          const line: ConsoleLine = JSON.parse(event.data);
          appendLines([line]);
        } catch {
          // ignore malformed
        }
      };

      // Initial buffer batch
      es.addEventListener("buffer", (event) => {
        try {
          const batch: ConsoleLine[] = JSON.parse(
            (event as MessageEvent).data,
          );
          appendLines(batch);
        } catch {
          // ignore
        }
      });

      es.addEventListener("disconnected", () => {
        setConnected(false);
      });

      es.addEventListener("reconnected", () => {
        setConnected(true);
        setError(null);
      });

      es.addEventListener("reconnecting", () => {
        setConnected(false);
      });

      es.addEventListener("error", (event) => {
        const messageEvent = event as MessageEvent;
        if (messageEvent.data) {
          try {
            const { error: errMsg } = JSON.parse(messageEvent.data);
            setError(errMsg);
          } catch {
            // ignore
          }
        }

        if (es.readyState === EventSource.CLOSED) {
          setConnected(false);
          scheduleReconnect();
        }
      });
    }

    function scheduleReconnect() {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        if (
          !esRef.current ||
          esRef.current.readyState === EventSource.CLOSED
        ) {
          connect();
        }
      }, 3000);
    }

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = null;
      pendingLines.current = [];
      setConnected(false);
    };
  }, [serverId, enabled, appendLines]);

  return { lines, sendCommand, connected, error, clear };
}
