// ---------------------------------------------------------------------------
// LLM provider settings (system_settings keys)
// ---------------------------------------------------------------------------

import { query } from '../db/pool.js';

export type LlmProviderId = 'openai' | 'anthropic';

export interface LlmRuntimeSettings {
  provider: LlmProviderId;
  /** OpenAI key (merges legacy `llm_api_key` when `llm_openai_api_key` unset) */
  openaiApiKey: string | undefined;
  anthropicApiKey: string | undefined;
  openaiModel: string;
  anthropicModel: string;
}

const LLM_SETTING_KEYS = [
  'llm_provider',
  'llm_openai_api_key',
  'llm_anthropic_api_key',
  'llm_api_key',
  'llm_openai_model',
  'llm_anthropic_model',
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

  return {
    provider,
    openaiApiKey,
    anthropicApiKey,
    openaiModel,
    anthropicModel,
  };
}

export function apiKeyForActiveProvider(settings: LlmRuntimeSettings): { kind: LlmProviderId; key: string } | undefined {
  if (settings.provider === 'openai' && settings.openaiApiKey) {
    return { kind: 'openai', key: settings.openaiApiKey };
  }
  if (settings.provider === 'anthropic' && settings.anthropicApiKey) {
    return { kind: 'anthropic', key: settings.anthropicApiKey };
  }
  return undefined;
}
