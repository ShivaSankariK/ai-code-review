import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionStatus, TreeState } from "../types/ui";
import { applyServerMessage } from "../utils/applyMessage";
import { WS_URL } from "../utils/wsConfig";

export type SendEvent = (id: string, event: string, payload?: unknown) => void;

export function useServerUI() {
  const [nodes, setNodes] = useState<TreeState>(new Map());
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  
  // Tracks the current reconnect delay (ms) for exponential back-off.
  const retryDelayRef = useRef(1000);
  
  // Allows the cleanup effect to cancel a pending reconnect timer.
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendEvent = useCallback<SendEvent>((id, event, payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "event", id, event, payload: payload ?? null })
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      setStatus("connecting");

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        retryDelayRef.current = 1000; // reset back-off on success
        setStatus("open");
      };

      ws.onmessage = (e: MessageEvent) => {
        let msg: unknown;
        try {
          msg = JSON.parse(e.data as string);
        } catch {
          console.error("Received unparseable message from server");
          return;
        }

        setNodes((prev) =>
          applyServerMessage(prev, msg as Record<string, unknown>)
        );
      };

      ws.onclose = () => {
        if (cancelled) return;
        setStatus("closed");
        
        // Clear node tree so a fresh reconnect repaints cleanly.
        setNodes(new Map());

        // Reconnect with exponential back-off, capped at 30 s.
        const delay = retryDelayRef.current;
        retryDelayRef.current = Math.min(delay * 2, 30_000);
        retryTimerRef.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  return { nodes, sendEvent, status };
}
