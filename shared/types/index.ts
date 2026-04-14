// ---------------------------------------------------------------------------
// Shared types for the proxy ↔ home tunnel protocol
// ---------------------------------------------------------------------------

export interface TunnelUser {
  id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'member' | 'guest';
  allowed_areas: string[] | null;
}

export interface RTCSignalPayload {
  type: 'offer' | 'answer' | 'candidate';
  src?: string;
  sdp?: string;
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

// -- Tunnel message types ---------------------------------------------------

interface TunnelHomeRegister {
  type: 'home_register';
  homeId: string;
  timestamp: number;
  version: string;
  hmac: string;
}

interface TunnelHomeRegistered {
  type: 'home_registered';
}

interface TunnelHttpRequest {
  type: 'http_request';
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
}

interface TunnelHttpResponse {
  type: 'http_response';
  id: string;
  status: number;
  headers: Record<string, string>;
  body?: string;
}

interface TunnelPing {
  type: 'ping';
}

interface TunnelPong {
  type: 'pong';
}

interface TunnelWsOpen {
  type: 'ws_open';
  sessionId: string;
  user: TunnelUser;
}

interface TunnelWsMessage {
  type: 'ws_message';
  sessionId: string;
  data: string;
}

interface TunnelWsClose {
  type: 'ws_close';
  sessionId: string;
  code?: number;
  reason?: string;
}

interface TunnelRtcSignal {
  type: 'rtc_signal';
  sessionId: string;
  direction: 'to_home' | 'to_remote';
  payload: RTCSignalPayload;
}

export type TunnelMessage =
  | TunnelHomeRegister
  | TunnelHomeRegistered
  | TunnelHttpRequest
  | TunnelHttpResponse
  | TunnelPing
  | TunnelPong
  | TunnelWsOpen
  | TunnelWsMessage
  | TunnelWsClose
  | TunnelRtcSignal;
