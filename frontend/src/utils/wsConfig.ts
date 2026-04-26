// The WebSocket URL is read from the Vite env variable VITE_WS_URL so it can
// be configured per-environment without a source-code change. Falls back to
// the local dev default when the variable is not set.
export const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001";
