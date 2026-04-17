'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import {
  ArrowLeft, Bot, Loader2, Eye, EyeOff, Check, Zap,
  CircleAlert, ChevronDown, AlertTriangle,
} from 'lucide-react';
import { getApiBase, apiFetch } from '@/lib/api-base';

const API_BASE = getApiBase();

const MASK_OPENAI    = 'sk-••••••••••••••••••••••••••••••••';
const MASK_ANTHROPIC = 'sk-ant-••••••••••••••••••••••••••••••••';

type LlmProviderId = 'openai' | 'anthropic';

const OPENAI_MODELS = [
  { id: 'gpt-4o',       label: 'GPT-4o' },
  { id: 'gpt-4o-mini',  label: 'GPT-4o mini' },
  { id: 'gpt-4-turbo',  label: 'GPT-4 Turbo' },
  { id: 'o4-mini',      label: 'o4-mini' },
] as const;

const ANTHROPIC_MODELS = [
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { id: 'claude-opus-4-20250514',   label: 'Claude Opus 4' },
  { id: 'claude-haiku-4-20250514',  label: 'Claude Haiku 4' },
] as const;

function readSetting(data: { value?: unknown }): string | undefined {
  if (typeof data.value !== 'string') return undefined;
  const t = data.value.trim();
  return t === '' ? undefined : t;
}

// ---------------------------------------------------------------------------
// Reusable styled model-picker dropdown (never a native <select>)
// ---------------------------------------------------------------------------
interface ModelOption { id: string; label: string }

function ModelPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly ModelOption[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const label = options.find((o) => o.id === value)?.label ?? value;

  return (
    <div ref={ref} className="relative w-full max-w-xs">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: open ? 'var(--color-accent)' : 'var(--color-border)',
          color: 'var(--color-text)',
        }}
      >
        <span>{label}</span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 transition-transform"
          style={{
            color: 'var(--color-text-muted)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-lg border shadow-lg"
          style={{
            backgroundColor: 'var(--color-bg-elevated, var(--color-bg-secondary))',
            borderColor: 'var(--color-border)',
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => { onChange(opt.id); setOpen(false); }}
              className="flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:opacity-80"
              style={{ color: 'var(--color-text)' }}
            >
              <span>{opt.label}</span>
              {opt.id === value && (
                <Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-accent)' }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function LlmSettingsPage() {
  const router = useRouter();

  // Saved-to-DB state (what the backend actually has)
  const [savedProvider, setSavedProvider] = useState<LlmProviderId>('openai');

  // Local (unsaved) UI state
  const [provider,       setProvider]       = useState<LlmProviderId>('openai');
  const [openAiKey,      setOpenAiKey]       = useState('');
  const [anthropicKey,   setAnthropicKey]    = useState('');
  const [openAiConfigured,    setOpenAiConfigured]    = useState(false);
  const [anthropicConfigured, setAnthropicConfigured] = useState(false);
  const [openAiModel,    setOpenAiModel]     = useState<string>(OPENAI_MODELS[0].id);
  const [anthropicModel, setAnthropicModel]  = useState<string>(ANTHROPIC_MODELS[0].id);

  const [loading,    setLoading]   = useState(true);
  const [saving,     setSaving]    = useState(false);
  const [saved,      setSaved]     = useState(false);
  const [saveError,  setSaveError] = useState<string | null>(null);
  const [showOpenAiKey,    setShowOpenAiKey]    = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [testing,   setTesting]   = useState(false);
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

    Promise.all(
      keys.map((k) =>
        apiFetch(`${API_BASE}/api/settings/${k}`).then((r) => r.json() as Promise<{ value?: unknown }>),
      ),
    )
      .then(([p, openaiExplicit, legacy, anth, om, am]) => {
        const pv = readSetting(p);
        const resolvedProvider: LlmProviderId =
          pv === 'anthropic' ? 'anthropic' : 'openai';
        setProvider(resolvedProvider);
        setSavedProvider(resolvedProvider);

        const explicitOpenAi = readSetting(openaiExplicit);
        const legacyOpenAi   = readSetting(legacy);
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

  const openAiMaskActive    = openAiKey.startsWith('sk-••')     || openAiKey    === MASK_OPENAI;
  const anthropicMaskActive = anthropicKey.startsWith('sk-ant-••') || anthropicKey === MASK_ANTHROPIC;

  // True if the active provider selection differs from what's saved in the DB
  const providerUnsaved = provider !== savedProvider;

  const putSetting = async (key: string, value: unknown): Promise<void> => {
    const res = await apiFetch(`${API_BASE}/api/settings/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Save failed (${res.status})`);
    }
  };

  const saveAll = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    setTestResult(null);
    try {
      await putSetting('llm_provider', provider);
      await putSetting('llm_openai_model', openAiModel);
      await putSetting('llm_anthropic_model', anthropicModel);

      if (openAiKey && !openAiMaskActive) {
        await putSetting('llm_openai_api_key', openAiKey);
        setOpenAiConfigured(true);
      }

      if (anthropicKey && !anthropicMaskActive) {
        await putSetting('llm_anthropic_api_key', anthropicKey);
        setAnthropicConfigured(true);
      }

      setSavedProvider(provider);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const removeOpenAi = async () => {
    setSaving(true);
    try {
      await Promise.all([
        apiFetch(`${API_BASE}/api/settings/llm_openai_api_key`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: '' }),
        }),
        apiFetch(`${API_BASE}/api/settings/llm_api_key`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: '' }),
        }),
      ]);
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
      const res = await apiFetch(`${API_BASE}/api/chat/test`, { method: 'POST' });
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

  const activeKeyReady = provider === 'openai' ? openAiConfigured : anthropicConfigured;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="max-w-3xl xl:max-w-5xl mx-auto p-4 lg:p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/settings')}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <ArrowLeft className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} />
        </button>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
        >
          <Bot className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <h1 className="text-lg font-semibold">LLM Integration</h1>
      </div>

      {/* Provider picker */}
      <Card>
        <h2 className="text-sm font-medium mb-1">Active provider</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Only the selected provider&apos;s key is used by the assistant. Configure API keys in the sections below.
        </p>

        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
        ) : (
          <div className="flex gap-2">
            {([
              { id: 'openai'    as LlmProviderId, label: 'OpenAI' },
              { id: 'anthropic' as LlmProviderId, label: 'Claude (Anthropic)' },
            ]).map((p) => {
              const active = provider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setProvider(p.id); setSaved(false); setTestResult(null); }}
                  className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: active
                      ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)'
                      : 'var(--color-bg-secondary)',
                    borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
                    color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  }}
                >
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Provider cards — side by side on wide screens */}
      <div className="xl:grid xl:grid-cols-2 xl:gap-6 space-y-6 xl:space-y-0">

      {/* OpenAI card */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-medium">OpenAI</h2>
          {provider === 'openai' && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                color: 'var(--color-accent)',
              }}
            >
              Active
            </span>
          )}
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          API key starts with <span className="font-mono">sk-</span>. Keys are stored on the server only.
        </p>

        {!loading && (
          <div className="space-y-4">
            {/* Model */}
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>Model</p>
              <ModelPicker
                value={openAiModel}
                options={OPENAI_MODELS}
                onChange={(v) => { setOpenAiModel(v); setSaved(false); }}
              />
            </div>

            {/* API key */}
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>API key</p>
              <div className="relative max-w-xs">
                <input
                  type={showOpenAiKey ? 'text' : 'password'}
                  value={openAiKey}
                  onChange={(e) => { setOpenAiKey(e.target.value); setSaved(false); }}
                  onFocus={() => { if (openAiMaskActive) setOpenAiKey(''); }}
                  placeholder="sk-..."
                  className="w-full rounded-lg border px-3 py-2 pr-10 text-sm font-mono transition-colors"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowOpenAiKey((p) => !p)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {showOpenAiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {openAiConfigured && (
                <button
                  type="button"
                  onClick={removeOpenAi}
                  disabled={saving}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
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

      {/* Anthropic card */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-medium">Claude (Anthropic)</h2>
          {provider === 'anthropic' && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                color: 'var(--color-accent)',
              }}
            >
              Active
            </span>
          )}
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Create a key at{' '}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--color-accent)' }}
          >
            console.anthropic.com
          </a>
          . Keys start with <span className="font-mono">sk-ant-</span>.
        </p>

        {!loading && (
          <div className="space-y-4">
            {/* Model */}
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>Model</p>
              <ModelPicker
                value={anthropicModel}
                options={ANTHROPIC_MODELS}
                onChange={(v) => { setAnthropicModel(v); setSaved(false); }}
              />
            </div>

            {/* API key */}
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>API key</p>
              <div className="relative max-w-xs">
                <input
                  type={showAnthropicKey ? 'text' : 'password'}
                  value={anthropicKey}
                  onChange={(e) => { setAnthropicKey(e.target.value); setSaved(false); }}
                  onFocus={() => { if (anthropicMaskActive) setAnthropicKey(''); }}
                  placeholder="sk-ant-api..."
                  className="w-full rounded-lg border px-3 py-2 pr-10 text-sm font-mono transition-colors"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowAnthropicKey((p) => !p)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {showAnthropicKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {anthropicConfigured && (
                <button
                  type="button"
                  onClick={removeAnthropic}
                  disabled={saving}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
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

      </div>{/* end provider cards grid */}

      {/* Save / test row */}
      {!loading && (
        <Card>
          {/* Save error */}
          {saveError && (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs mb-3"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-danger, #ef4444) 10%, transparent)',
                color: 'var(--color-danger, #ef4444)',
                border: '1px solid color-mix(in srgb, var(--color-danger, #ef4444) 30%, transparent)',
              }}
            >
              <CircleAlert className="h-3.5 w-3.5 shrink-0" />
              Save failed: {saveError}
            </div>
          )}

          {/* Unsaved provider warning */}
          {providerUnsaved && (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs mb-3"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-warning, #f59e0b) 12%, transparent)',
                color: 'var(--color-warning, #f59e0b)',
                border: '1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 30%, transparent)',
              }}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Active provider changed — save before testing.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveAll}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Saved</span>
              ) : (
                'Save settings'
              )}
            </button>

            {activeKeyReady && !providerUnsaved && (
              <button
                type="button"
                onClick={testConnection}
                disabled={testing}
                className="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> Test active model</span>
                )}
              </button>
            )}

            {activeKeyReady && !providerUnsaved && !saved && !testResult && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-success, #22c55e)' }}>
                <Check className="h-3 w-3" /> Active provider configured
              </span>
            )}
          </div>

          {testResult && (
            <div
              className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: testResult.ok ? 'var(--color-success, #22c55e)' : 'var(--color-danger, #ef4444)',
              }}
            >
              {testResult.ok
                ? <Check className="h-3.5 w-3.5 shrink-0" />
                : <CircleAlert className="h-3.5 w-3.5 shrink-0" />}
              {testResult.message}
            </div>
          )}
        </Card>
      )}

      {/* Capabilities hint */}
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
