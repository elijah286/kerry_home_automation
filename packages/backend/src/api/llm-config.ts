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

function asTrimmedString(v: unknown): string | undefined {
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

  const legacyOpenAi = asTrimmedString(map.get('llm_api_key'));
  const explicitOpenAi = asTrimmedString(map.get('llm_openai_api_key'));
  const openaiApiKey = explicitOpenAi ?? legacyOpenAi;

  const anthropicApiKey = asTrimmedString(map.get('llm_anthropic_api_key'));

  let provider: LlmProviderId = 'openai';
  const rawProvider = map.get('llm_provider');
  if (rawProvider === 'anthropic') provider = 'anthropic';
  else if (rawProvider === 'openai') provider = 'openai';

  const openaiModel = asTrimmedString(map.get('llm_openai_model')) ?? 'gpt-4o';
  const anthropicModel = asTrimmedString(map.get('llm_anthropic_model')) ?? 'claude-sonnet-4-20250514';

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
