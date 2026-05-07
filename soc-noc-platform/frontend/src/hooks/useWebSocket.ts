import { useEffect, useRef, useCallback, useState } from "react";

interface WSMessage {
  type: string;
  data?: unknown;
  ts?: string;
}

interface UseWebSocketOptions {
  onMessage?: (msg: WSMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useWebSocket(path: string, opts: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    const base = import.meta.env.VITE_WS_URL || "ws://localhost:8000/api/v1";
    const url = `${base}${path}?token=${token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      opts.onConnect?.();
    };

    ws.onmessage = (ev) => {
      if (!mountedRef.current) return;
      try {
        const msg: WSMessage = JSON.parse(ev.data);
        if (msg.type !== "heartbeat" && msg.type !== "pong") {
          opts.onMessage?.(msg);
        }
        if (msg.type === "heartbeat") {
          ws.send("ping");
        }
      } catch {}
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      opts.onDisconnect?.();
      // Reconnexion automatique après 5s
      reconnectTimer.current = setTimeout(connect, 5000);
    };

    ws.onerror = () => ws.close();
  }, [path]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { connected, send };
}
