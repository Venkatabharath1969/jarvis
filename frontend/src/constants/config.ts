// utilsnow.com — HTTPS/WSS on port 443, works through corporate proxies
export const DEFAULT_WS_URL = 'wss://utilsnow.com/jarvis/ws';
export const DEFAULT_HEALTH_URL = 'https://utilsnow.com/jarvis/health';
export const WS_RECONNECT_DELAY = 3000;
export const WS_HEARTBEAT = 30000;
export const STORAGE_KEYS = {
  WS_URL: '@jarvis:ws_url',
  GEMINI_KEY: '@jarvis:gemini_key',
  AWS_ACCESS_KEY: '@jarvis:aws_access_key',
  AWS_SECRET_KEY: '@jarvis:aws_secret_key',
  AWS_REGION: '@jarvis:aws_region',
  CONVERSATIONS: '@jarvis:conversations',
  WAKE_WORD_ENABLED: '@jarvis:wake_word_enabled',
} as const;

export const APP_VERSION = '1.0.0';
export const HEALTH_ENDPOINT_SUFFIX = '/health';
