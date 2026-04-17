'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { ArrowLeft, Bot, Loader2, Eye, EyeOff, Check, Zap, CircleAlert, ChevronDown } from 'lucide-react';
import { getApiBase, apiFetch } from '@/lib/api-base';

const API_BASE = getApiBase();

type Provider = 'openai' | 'anthropic';

const PROVIDERS: { id: Provider; label: string; placeholder: string; hint: string; docsUrl: string }[] = [
  {
    id: 'openai',
    label: 'OpenAI (ChatGPT)',
    placeholder: 'sk-...',
    hint: 'Get your API key at platform.openai.com → API keys',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    placeholder: 'sk-ant-...',
    hint: 'Get your API key at console.anthropic.com → API keys',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
];

export default function LlmSettingsPage() {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>('openai');
  const [providerOpen, setProviderOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const selectedProvider = PROVIDERS.find((p) => p.id === provider)!;

  useEffect(() => {
    Promise.all([
      apiFetch(`${API_BASE}/api/settings/llm_api_key`).then((r) => r.json()),
      apiFetch(`${API_BASE}/api/settings/llm_provider`).then((r) => r.json()),
    ])
      .then(([keyData, providerData]: [{ value?: string }, { value?: string }]) => {
        if (keyData.value) {
          setConfigured(true);
          setApiKey('sk-••••••••••••••••••••••••••••••••');
        }
        if (providerData.value === 'anthropic' || providerData.value === 'openai') {
          setProvider(providerData.value);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!apiKey || apiKey.startsWith('sk-••')) return;
    setSaving(true);
    setSaved(false);
    try {
      await Promise.all([
        apiFetch(`${API_BASE}/api/settings/llm_api_key`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: apiKey }),
        }),
        apiFetch(`${API_BASE}/api/settings/llm_provider`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: provider }),
        }),
      ]);
      setConfigured(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await apiFetch(`${API_BASE}/api/settings/llm_api_key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: '' }),
      });
      setApiKey('');
      setConfigured(false);
      setTestResult(null);
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
        setTestResult({ ok: true, message: `Connected to ${data.model}` });
      } else {
        setTestResult({ ok: false, message: data.error || 'Connection failed' });
      }
    } catch {
      setTestResult({ ok: false, message: 'Failed to connect to server' });
    } finally {
      setTesting(false);
    }
  };

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
        <h2 className="text-sm font-medium mb-1">AI Provider</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Choose which AI provider to use for the assistant.
        </p>

        {/* Provider selector */}
        <div className="relative mb-4">
          <button
            onClick={() => setProviderOpen(!providerOpen)}
            className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            <span>{selectedProvider.label}</span>
            <ChevronDown className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
          </button>

          {providerOpen && (
            <div
              className="absolute z-10 mt-1 w-full rounded-md border shadow-lg"
              style={{ backgroundColor: 'var(--color-bg-elevated)', borderColor: 'var(--color-border)' }}
            >
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setProvider(p.id); setProviderOpen(false); setApiKey(''); setSaved(false); setTestResult(null); }}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:opacity-80"
                  style={{ color: 'var(--color-text)' }}
                >
                  <span>{p.label}</span>
                  {provider === p.id && <Check className="h-3.5 w-3.5" style={{ color: 'var(--color-accent)' }} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <h2 className="text-sm font-medium mb-1">API Key</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          {selectedProvider.hint}
        </p>

        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setSaved(false); }}
                  onFocus={() => { if (apiKey.startsWith('sk-••')) setApiKey(''); }}
                  placeholder={selectedProvider.placeholder}
                  className="w-full rounded-md border px-3 py-2 pr-10 text-sm font-mono transition-colors"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={save}
                disabled={saving || !apiKey || apiKey.startsWith('sk-••')}
                className="rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saved ? (
                  <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Saved</span>
                ) : (
                  'Save'
                )}
              </button>

              {configured && (
                <button
                  onClick={remove}
                  disabled={saving}
                  className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
                  style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                >
                  Remove Key
                </button>
              )}

              {configured && (
                <button
                  onClick={testConnection}
                  disabled={testing}
                  className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
                  style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                >
                  {testing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> Test</span>
                  )}
                </button>
              )}

              {configured && !saved && !testResult && (
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-success, #22c55e)' }}>
                  <Check className="h-3 w-3" /> Configured
                </span>
              )}
            </div>

            {testResult && (
              <div
                className="flex items-center gap-2 rounded-md px-3 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  color: testResult.ok ? 'var(--color-success, #22c55e)' : 'var(--color-danger, #ef4444)',
                }}
              >
                {testResult.ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <CircleAlert className="h-3.5 w-3.5 shrink-0" />}
                {testResult.message}
              </div>
            )}
          </div>
        )}
      </Card>

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
