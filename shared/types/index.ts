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
  /** When 'base64', body is base64-encoded binary data that must be decoded before sending. */
  bodyEncoding?: 'base64';
}

/**
 * Streaming response protocol — used for large binary bodies that can't be
 * practically buffered in a single `http_response` message (HLS TS segments,
 * MJPEG multipart streams, large downloads). The home sends a start frame
 * with headers, then 0+ chunk frames with base64-encoded body slices, then
 * an end frame. The proxy pipes chunks into a Readable so it can stream
 * the response to the client without buffering the whole body server-side.
 */
interface TunnelHttpStreamStart {
  type: 'http_stream_start';
  id: string;
  status: number;
  headers: Record<string, string>;
}

interface TunnelHttpStreamChunk {
  type: 'http_stream_chunk';
  id: string;
  /** Base64-encoded binary chunk (non-empty). */
  data: string;
}

interface TunnelHttpStreamEnd {
  type: 'http_stream_end';
  id: string;
  /** Set when the stream ended abnormally — home hit an error mid-stream. */
  error?: string;
}

/**
 * Sent by the proxy when the remote client disconnects mid-stream, so the
 * home can abort the in-flight fetch and stop pushing chunks into the void.
 */
interface TunnelHttpStreamCancel {
  type: 'http_stream_cancel';
  id: string;
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
  | TunnelHttpStreamStart
  | TunnelHttpStreamChunk
  | TunnelHttpStreamEnd
  | TunnelHttpStreamCancel
  | TunnelPing
  | TunnelPong
  | TunnelWsOpen
  | TunnelWsMessage
  | TunnelWsClose
  | TunnelRtcSignal;
