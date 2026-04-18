// ---------------------------------------------------------------------------
// LLM provider settings (system_settings keys)
// ---------------------------------------------------------------------------

import { query } from '../db/pool.js';

export type LlmProviderId = 'openai' | 'anthropic';

export const TTS_VOICES = [
  'alloy', 'ash', 'ballad', 'coral', 'echo',
  'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse',
] as const;
export type TtsVoice = typeof TTS_VOICES[number];

export const DEFAULT_TTS_INSTRUCTIONS =
  'Speak warmly and conversationally, like a helpful home assistant. Keep energy natural, not overly cheerful. Pause briefly between sentences.';

export interface LlmRuntimeSettings {
  /** Legacy single "active provider" — kept for back-compat; prefer chatProvider. */
  provider: LlmProviderId;
  /** Provider used for the chat endpoint (reasoning + tool calls). */
  chatProvider: LlmProviderId;
  /** OpenAI key (merges legacy `llm_api_key` when `llm_openai_api_key` unset) */
  openaiApiKey: string | undefined;
  anthropicApiKey: string | undefined;
  openaiModel: string;
  anthropicModel: string;
  ttsEnabled: boolean;
  ttsVoice: TtsVoice;
  ttsInstructions: string;
}

const LLM_SETTING_KEYS = [
  'llm_provider',
  'chat_provider',
  'llm_openai_api_key',
  'llm_anthropic_api_key',
  'llm_api_key',
  'llm_openai_model',
  'llm_anthropic_model',
  'tts_enabled',
  'tts_voice',
  'tts_instructions',
] as const;

/**
 * Unwrap a setting value from the DB.
 * Handles both plain JSONB strings ("anthropic") and the wrapped object
 * format ({"value":"anthropic"}) that older save code may have produced.
 */
function asTrimmedString(v: unknown): string | undefined {
  // Unwrap {value: ...} wrapper if present
  if (v !== null && typeof v === 'object' && !Array.isArray(v) && 'value' in v) {
    return asTrimmedString((v as Record<string, unknown>).value);
  }
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

/** Load merged LLM settings for chat and test endpoints. */
export async function loadLlmRuntimeSettings(): Promise<LlmRuntimeSettings> {
  const { rows } = await query<{ key: string; value: unknown }>(
    `SELECT key, value FROM system_settings WHERE key = ANY($1::text[])`,
    [LLM_SETTING_KEYS],
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const legacyKey    = asTrimmedString(map.get('llm_api_key'));
  const explicitOpenAi = asTrimmedString(map.get('llm_openai_api_key'));
  const explicitAnthropicKey = asTrimmedString(map.get('llm_anthropic_api_key'));

  // Determine provider first so we can correctly route the legacy key
  let provider: LlmProviderId = 'openai';
  const rawProvider = asTrimmedString(map.get('llm_provider'));
  if (rawProvider === 'anthropic') provider = 'anthropic';
  else if (rawProvider === 'openai') provider = 'openai';

  // Legacy `llm_api_key` is routed to whichever provider is active when the
  // explicit per-provider key is missing — handles keys saved by older code.
  const openaiApiKey    = explicitOpenAi    ?? (provider === 'openai'    ? legacyKey : undefined);
  const anthropicApiKey = explicitAnthropicKey ?? (provider === 'anthropic' ? legacyKey : undefined);

  const openaiModel = asTrimmedString(map.get('llm_openai_model')) ?? 'gpt-4o';
  const anthropicModel = asTrimmedString(map.get('llm_anthropic_model')) ?? 'claude-sonnet-4-6';

  // chat_provider supersedes legacy llm_provider for the chat endpoint.
  let chatProvider: LlmProviderId = provider;
  const rawChat = asTrimmedString(map.get('chat_provider'));
  if (rawChat === 'anthropic') chatProvider = 'anthropic';
  else if (rawChat === 'openai') chatProvider = 'openai';

  const rawTtsEnabled = map.get('tts_enabled');
  const ttsEnabled = rawTtsEnabled === true || asTrimmedString(rawTtsEnabled) === 'true';
  const rawVoice = asTrimmedString(map.get('tts_voice')) ?? 'sage';
  const ttsVoice: TtsVoice = (TTS_VOICES as readonly string[]).includes(rawVoice)
    ? (rawVoice as TtsVoice)
    : 'sage';
  const ttsInstructions = asTrimmedString(map.get('tts_instructions')) ?? DEFAULT_TTS_INSTRUCTIONS;

  return {
    provider,
    chatProvider,
    openaiApiKey,
    anthropicApiKey,
    openaiModel,
    anthropicModel,
    ttsEnabled,
    ttsVoice,
    ttsInstructions,
  };
}

export type LlmJob = 'chat' | 'tts';

/**
 * Resolve which provider+key to use for a given job.
 * - 'chat' follows the configured chatProvider.
 * - 'tts' is hard-routed to OpenAI (only provider offering gpt-4o-mini-tts).
 */
export function apiKeyFor(
  job: LlmJob,
  settings: LlmRuntimeSettings,
): { kind: LlmProviderId; key: string } | undefined {
  if (job === 'tts') {
    return settings.openaiApiKey ? { kind: 'openai', key: settings.openaiApiKey } : undefined;
  }
  if (settings.chatProvider === 'openai' && settings.openaiApiKey) {
    return { kind: 'openai', key: settings.openaiApiKey };
  }
  if (settings.chatProvider === 'anthropic' && settings.anthropicApiKey) {
    return { kind: 'anthropic', key: settings.anthropicApiKey };
  }
  return undefined;
}

/** @deprecated Use `apiKeyFor('chat', settings)` instead. */
export function apiKeyForActiveProvider(settings: LlmRuntimeSettings): { kind: LlmProviderId; key: string } | undefined {
  return apiKeyFor('chat', settings);
}
