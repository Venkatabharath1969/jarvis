import { useEffect, useRef, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { DEFAULT_WS_URL, WS_RECONNECT_DELAY, WS_HEARTBEAT, STORAGE_KEYS } from '../constants/config';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface WSMessage {
  type: string;
  text?: string;
  response?: string;
  error?: string;
  [key: string]: unknown;
}

interface UseWebSocketOptions {
  onMessage: (msg: WSMessage) => void;
}

interface UseWebSocketReturn {
  connectionStatus: ConnectionStatus;
  sendQuery: (text: string) => boolean;
  disconnect: () => void;
}

export function useWebSocket({ onMessage }: UseWebSocketOptions): UseWebSocketReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const mountedRef = useRef(true);
  const urlRef = useRef(DEFAULT_WS_URL);
  const onMessageRef = useRef(onMessage);
  const pendingQueryRef = useRef<string | null>(null);

  // Keep callback ref fresh without re-running the effect
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    clearInterval(heartbeatTimerRef.current ?? undefined);
    heartbeatTimerRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'ping' }));
        } catch {
          // ignore send errors — disconnect handler will reconnect
        }
      }
    }, WS_HEARTBEAT);
  }, []);

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;

    // Load saved URL from storage
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEYS.WS_URL);
      if (saved) urlRef.current = saved;
    } catch {
      // fall back to default
    }

    // Close any existing socket
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    if (!mountedRef.current) return;
    setConnectionStatus('connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(urlRef.current);
    } catch {
      scheduleReconnect();
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      reconnectAttemptRef.current = 0;
      setConnectionStatus('connected');
      startHeartbeat();
      // Flush any query that was sent while WS was reconnecting
      if (pendingQueryRef.current) {
        const queued = pendingQueryRef.current;
        pendingQueryRef.current = null;
        try {
          ws.send(JSON.stringify({ type: 'query', text: queued }));
        } catch {}
      }
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data: WSMessage = JSON.parse(event.data as string);
        if (data.type !== 'pong') {
          onMessageRef.current(data);
        }
      } catch {
        // malformed message — ignore
      }
    };

    ws.onerror = () => {
      // onerror is always followed by onclose, handle reconnect there
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      clearInterval(heartbeatTimerRef.current ?? undefined);
      heartbeatTimerRef.current = null;
      setConnectionStatus('disconnected');
      scheduleReconnect();
    };
  }, [startHeartbeat]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    const attempt = reconnectAttemptRef.current;
    reconnectAttemptRef.current += 1;
    // Exponential backoff: 3s, 6s, 12s … capped at 30s
    const delay = Math.min(WS_RECONNECT_DELAY * Math.pow(2, attempt), 30000);
    reconnectTimerRef.current = setTimeout(() => {
      if (mountedRef.current) connect();
    }, delay);
  }, [connect]);

  // Connect on mount
  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, clearTimers]);

  // Reconnect when app comes to foreground
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const status = wsRef.current?.readyState;
        if (status !== WebSocket.OPEN && status !== WebSocket.CONNECTING) {
          clearTimers();
          reconnectAttemptRef.current = 0;
          connect();
        }
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [connect, clearTimers]);

  const sendQuery = useCallback((text: string): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'query', text }));
        return true;
      } catch {
        return false;
      }
    }
    // Queue the query — will be sent when connection restores (max 1 queued at a time)
    pendingQueryRef.current = text;
    return false;
  }, []);

  const disconnect = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
  }, [clearTimers]);

  return { connectionStatus, sendQuery, disconnect };
}
