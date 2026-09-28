"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface LogEntry {
  stream: "stdout" | "stderr";
  message: string;
  timestamp: string;
}

interface UseServerLogsOptions {
  enabled?: boolean;
  maxLines?: number;
  reconnectDelay?: number;
}

interface UseServerLogsResult {
  logs: LogEntry[];
  connected: boolean;
  error: string | null;
  clear: () => void;
}

export function useServerLogs(
  serverId: string | null,
  options: UseServerLogsOptions = {},
): UseServerLogsResult {
  const { enabled = true, maxLines = 500, reconnectDelay = 3000 } = options;

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLogs = useRef<LogEntry[]>([]);

  const clear = useCallback(() => {
    pendingLogs.current = [];
    setLogs([]);
  }, []);

  const appendLog = useCallback((entry: LogEntry) => {
    pendingLogs.current = [...pendingLogs.current, entry].slice(-maxLines);
    if (flushTimer.current) return;

    flushTimer.current = setTimeout(() => {
      const batch = pendingLogs.current;
      pendingLogs.current = [];
      flushTimer.current = null;
      setLogs((prev) => [...prev, ...batch].slice(-maxLines));
    }, 100);
  }, [maxLines]);

  useEffect(() => {
    if (!serverId || !enabled) {
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
      return;
    }

    function connect() {
      const es = new EventSource(`/api/servers/${serverId}/logs/stream`);
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setError(null);
      };

      es.onmessage = (event) => {
        try {
          const entry: LogEntry = JSON.parse(event.data);
          appendLog(entry);
        } catch {
          // ignore malformed messages
        }
      };

      es.addEventListener("error", (event) => {
        // SSE spec: error event fires on connection loss
        if (es.readyState === EventSource.CLOSED) {
          setConnected(false);
          setError("Connection closed");
          scheduleReconnect();
        } else if (es.readyState === EventSource.CONNECTING) {
          setConnected(false);
        }

        // Custom error event from server
        const messageEvent = event as MessageEvent;
        if (messageEvent.data) {
          try {
            const { error: errMsg } = JSON.parse(messageEvent.data);
            setError(errMsg);
          } catch { /* ignore */ }
        }
      });

      es.addEventListener("end", () => {
        setConnected(false);
        es.close();
      });
    }

    function scheduleReconnect() {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        if (esRef.current?.readyState === EventSource.CLOSED) {
          connect();
        }
      }, reconnectDelay);
    }

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = null;
      pendingLogs.current = [];
      setConnected(false);
    };
  }, [serverId, enabled, reconnectDelay, appendLog]);

  return { logs, connected, error, clear };
}
