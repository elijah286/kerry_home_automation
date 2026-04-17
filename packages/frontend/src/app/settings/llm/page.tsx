'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { ArrowLeft, Bot, Loader2, Eye, EyeOff, Check, Zap, CircleAlert } from 'lucide-react';
import { getApiBase, apiFetch } from '@/lib/api-base';

const API_BASE = getApiBase();

const MASK_OPENAI = 'sk-••••••••••••••••••••••••••••••••';
const MASK_ANTHROPIC = 'sk-ant-••••••••••••••••••••••••••••••••';

type LlmProviderId = 'openai' | 'anthropic';

const OPENAI_MODELS = [
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { id: 'o4-mini', label: 'o4-mini' },
] as const;

const ANTHROPIC_MODELS = [
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { id: 'claude-haiku-4-20250514', label: 'Claude Haiku 4' },
] as const;

function readSetting(data: { value?: unknown }): string | undefined {
  if (typeof data.value !== 'string') return undefined;
  const t = data.value.trim();
  return t === '' ? undefined : t;
}

export default function LlmSettingsPage() {
  const router = useRouter();
  const [provider, setProvider] = useState<LlmProviderId>('openai');
  const [openAiKey, setOpenAiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openAiConfigured, setOpenAiConfigured] = useState(false);
  const [anthropicConfigured, setAnthropicConfigured] = useState(false);
  const [openAiModel, setOpenAiModel] = useState<string>(OPENAI_MODELS[0].id);
  const [anthropicModel, setAnthropicModel] = useState<string>(ANTHROPIC_MODELS[0].id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    const keys = [
      'llm_provider',
      'llm_openai_api_key',
      'llm_api_key',
      'llm_anthropic_api_key',
      'llm_openai_model',
      'llm_anthropic_model',
    ] as const;

    Promise.all(keys.map((k) => apiFetch(`${API_BASE}/api/settings/${k}`).then((r) => r.json() as Promise<{ value?: unknown }>)))
      .then(([p, openaiExplicit, legacy, anth, om, am]) => {
        const pv = readSetting(p);
        if (pv === 'anthropic' || pv === 'openai') setProvider(pv);

        const explicitOpenAi = readSetting(openaiExplicit);
        const legacyOpenAi = readSetting(legacy);
        if (explicitOpenAi || legacyOpenAi) {
          setOpenAiConfigured(true);
          setOpenAiKey(MASK_OPENAI);
        }

        if (readSetting(anth)) {
          setAnthropicConfigured(true);
          setAnthropicKey(MASK_ANTHROPIC);
        }

        const omm = readSetting(om);
        if (omm) setOpenAiModel(omm);
        const amm = readSetting(am);
        if (amm) setAnthropicModel(amm);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openAiMaskActive = openAiKey.startsWith('sk-••') || openAiKey === MASK_OPENAI;
  const anthropicMaskActive = anthropicKey.startsWith('sk-ant-••') || anthropicKey === MASK_ANTHROPIC;

  const saveAll = async () => {
    setSaving(true);
    setSaved(false);
    setTestResult(null);
    try {
      await apiFetch(`${API_BASE}/api/settings/llm_provider`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: provider }),
      });

      await apiFetch(`${API_BASE}/api/settings/llm_openai_model`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: openAiModel }),
      });

      await apiFetch(`${API_BASE}/api/settings/llm_anthropic_model`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: anthropicModel }),
      });

      if (openAiKey && !openAiMaskActive) {
        await apiFetch(`${API_BASE}/api/settings/llm_openai_api_key`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: openAiKey }),
        });
        setOpenAiConfigured(true);
      }

      if (anthropicKey && !anthropicMaskActive) {
        await apiFetch(`${API_BASE}/api/settings/llm_anthropic_api_key`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: anthropicKey }),
        });
        setAnthropicConfigured(true);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const removeOpenAi = async () => {
    setSaving(true);
    try {
      await apiFetch(`${API_BASE}/api/settings/llm_openai_api_key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: '' }),
      });
      await apiFetch(`${API_BASE}/api/settings/llm_api_key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: '' }),
      });
      setOpenAiKey('');
      setOpenAiConfigured(false);
    } finally {
      setSaving(false);
    }
  };

  const removeAnthropic = async () => {
    setSaving(true);
    try {
      await apiFetch(`${API_BASE}/api/settings/llm_anthropic_api_key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: '' }),
      });
      setAnthropicKey('');
      setAnthropicConfigured(false);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch(`${API_BASE}/api/chat/test`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        const prov = typeof data.provider === 'string' ? `${data.provider} · ` : '';
        setTestResult({ ok: true, message: `Connected (${prov}${data.model})` });
      } else {
        setTestResult({ ok: false, message: data.error || 'Connection failed' });
      }
    } catch {
      setTestResult({ ok: false, message: 'Failed to connect to server' });
    } finally {
      setTesting(false);
    }
  };

  const activeKeyReady =
    provider === 'openai' ? openAiConfigured : anthropicConfigured;

  return (
    <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/settings')}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <ArrowLeft className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}>
          <Bot className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold">LLM Integration</h1>
      </div>

      <Card>
        <h2 className="text-sm font-medium mb-1">Assistant model</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Choose which provider powers the AI assistant. API keys for each provider are stored below; only the selected provider&apos;s key is required.
        </p>

        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
        ) : (
          <div className="space-y-3">
            <div
              className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4"
              role="radiogroup"
              aria-label="LLM provider"
            >
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="llm-provider"
                  checked={provider === 'openai'}
                  onChange={() => setProvider('openai')}
                  className="accent-[var(--color-accent)]"
                />
                OpenAI
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="llm-provider"
                  checked={provider === 'anthropic'}
                  onChange={() => setProvider('anthropic')}
                  className="accent-[var(--color-accent)]"
                />
                Claude (Anthropic)
              </label>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-medium mb-1">OpenAI</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          API key for Chat Completions (starts with{' '}
          <span className="font-mono">sk-</span>
          ). Keys are stored on the server only.
        </p>

        {!loading && (
          <div className="space-y-3">
            <label className="block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Model
            </label>
            <select
              value={openAiModel}
              onChange={(e) => { setOpenAiModel(e.target.value); setSaved(false); }}
              className="w-full max-w-md rounded-md border px-3 py-2 text-sm transition-colors sm:w-auto"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              {!OPENAI_MODELS.some((m) => m.id === openAiModel) && openAiModel ? (
                <option value={openAiModel}>{openAiModel}</option>
              ) : null}
              {OPENAI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>

            <label className="block text-xs font-medium pt-1" style={{ color: 'var(--color-text-secondary)' }}>
              API key
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showOpenAiKey ? 'text' : 'password'}
                  value={openAiKey}
                  onChange={(e) => { setOpenAiKey(e.target.value); setSaved(false); }}
                  onFocus={() => {
                    if (openAiMaskActive) setOpenAiKey('');
                  }}
                  placeholder="sk-..."
                  className="w-full rounded-md border px-3 py-2 pr-10 text-sm font-mono transition-colors"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowOpenAiKey(!showOpenAiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {showOpenAiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {openAiConfigured && (
                <button
                  type="button"
                  onClick={removeOpenAi}
                  disabled={saving}
                  className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  Remove key
                </button>
              )}
              {openAiConfigured && (
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-success, #22c55e)' }}>
                  <Check className="h-3 w-3" /> Key on file
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-medium mb-1">Claude (Anthropic)</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Create a key in the Anthropic console. Keys usually start with{' '}
          <span className="font-mono">sk-ant-api</span>.
        </p>

        {!loading && (
          <div className="space-y-3">
            <label className="block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Model
            </label>
            <select
              value={anthropicModel}
              onChange={(e) => { setAnthropicModel(e.target.value); setSaved(false); }}
              className="w-full max-w-md rounded-md border px-3 py-2 text-sm transition-colors sm:w-auto"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              {!ANTHROPIC_MODELS.some((m) => m.id === anthropicModel) && anthropicModel ? (
                <option value={anthropicModel}>{anthropicModel}</option>
              ) : null}
              {ANTHROPIC_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>

            <label className="block text-xs font-medium pt-1" style={{ color: 'var(--color-text-secondary)' }}>
              API key
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showAnthropicKey ? 'text' : 'password'}
                  value={anthropicKey}
                  onChange={(e) => { setAnthropicKey(e.target.value); setSaved(false); }}
                  onFocus={() => {
                    if (anthropicMaskActive) setAnthropicKey('');
                  }}
                  placeholder="sk-ant-api..."
                  className="w-full rounded-md border px-3 py-2 pr-10 text-sm font-mono transition-colors"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {showAnthropicKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {anthropicConfigured && (
                <button
                  type="button"
                  onClick={removeAnthropic}
                  disabled={saving}
                  className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  Remove key
                </button>
              )}
              {anthropicConfigured && (
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-success, #22c55e)' }}>
                  <Check className="h-3 w-3" /> Key on file
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      {!loading && (
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveAll}
              disabled={saving}
              className="rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: '#fff',
              }}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <span className="flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" /> Saved
                </span>
              ) : (
                'Save settings'
              )}
            </button>

            {activeKeyReady && (
              <button
                type="button"
                onClick={testConnection}
                disabled={testing}
                className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" /> Test active model
                  </span>
                )}
              </button>
            )}

            {activeKeyReady && !saved && !testResult && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-success, #22c55e)' }}>
                <Check className="h-3 w-3" /> Active provider configured
              </span>
            )}
          </div>

          {testResult && (
            <div
              className="mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: testResult.ok ? 'var(--color-success, #22c55e)' : 'var(--color-danger, #ef4444)',
              }}
            >
              {testResult.ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <CircleAlert className="h-3.5 w-3.5 shrink-0" />}
              {testResult.message}
            </div>
          )}
        </Card>
      )}

      <Card>
        <h2 className="text-sm font-medium mb-1">AI Assistant</h2>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Once configured, the AI assistant chat button will appear in the bottom-right corner. You can ask it to:
        </p>
        <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <li>Check device status — &quot;What lights are on?&quot;</li>
          <li>Control devices — &quot;Turn off the living room lights&quot;</li>
          <li>View history — &quot;When did the garage door last open?&quot;</li>
          <li>Navigate — &quot;Show me the cameras&quot;</li>
          <li>System overview — &quot;Which integrations are connected?&quot;</li>
        </ul>
      </Card>
    </div>
  );
}
