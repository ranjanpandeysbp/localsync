import { useEffect, useRef, useState } from "react";
import { useAuth } from "../store/auth";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000/ws";

export function useWebSocket(onMessage?: (data: unknown) => void) {
  const token = useAuth((s) => s.token);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!token) return;

    let closed = false;
    let retry: number | undefined;

    const connect = () => {
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) {
          retry = window.setTimeout(connect, 3000);
        }
      };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          handlerRef.current?.(data);
        } catch {
          /* ignore */
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (retry) window.clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [token]);

  return { connected };
}
