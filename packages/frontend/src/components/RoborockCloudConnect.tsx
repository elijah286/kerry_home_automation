'use client';

import { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import type { ConfigField } from '@ha/shared';
import { getApiBase } from '@/lib/api-base';

/** Which Roborock entry fields to show based on local vs cloud mode. */
export function filterRoborockConfigFields(
  fields: ConfigField[],
  values: Record<string, string>,
): ConfigField[] {
  if (values.local_miio === 'true') {
    return fields.filter((f) => ['local_miio', 'host', 'token'].includes(f.key));
  }
  return fields.filter((f) => ['local_miio', 'email'].includes(f.key));
}

interface SessionData {
  user_data: Record<string, unknown>;
  base_url: string | null;
}

interface Props {
  email: string;
  onSessionReady: (session: SessionData) => void;
}

type HintKind = 'success' | 'error' | 'muted';

async function readApiError(res: Response): Promise<string> {
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      detail?: string | string[] | { msg?: string }[];
      message?: string;
    };
    if (data.error) return data.error;
    if (data.message) return data.message;
    if (data.detail != null) {
      if (Array.isArray(data.detail)) {
        return data.detail
          .map((d) => (typeof d === 'string' ? d : (d as { msg?: string }).msg ?? JSON.stringify(d)))
          .join('; ');
      }
      return String(data.detail);
    }
  }
  const text = await res.text().catch(() => '');
  return text.slice(0, 200) || res.statusText || `HTTP ${res.status}`;
}

export function RoborockCloudConnect({ email, onSessionReady }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [hintKind, setHintKind] = useState<HintKind>('muted');

  const sendCode = async () => {
    if (!email.trim()) {
      setHintKind('error');
      setHint('Enter your Roborock account email in the field above first.');
      return;
    }
    setBusy(true);
    setHint(null);
    setHintKind('muted');
    const api = getApiBase();
    try {
      const res = await fetch(`${api}/api/roborock/request-code`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        setHintKind('error');
        setHint(await readApiError(res));
        return;
      }
      setHintKind('success');
      setHint('Verification code sent. Check your email (and spam), then enter the code below.');
    } catch (e) {
      setHintKind('error');
      const msg = e instanceof Error ? e.message : String(e);
      setHint(
        msg.includes('Failed to fetch') || msg.includes('NetworkError')
          ? `Could not reach the API at ${api}. Is the backend running on port 3000? (${msg})`
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    if (!email.trim() || !code.trim()) {
      setHintKind('error');
      setHint('Email and verification code are required.');
      return;
    }
    setBusy(true);
    setHint(null);
    setHintKind('muted');
    const api = getApiBase();
    try {
      const res = await fetch(`${api}/api/roborock/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string | string[];
        session_token?: string;
        user_data?: Record<string, unknown>;
        base_url?: string | null;
        devices?: { duid: string; name: string }[];
      };
      if (!res.ok) {
        setHintKind('error');
        const detail =
          data.detail == null
            ? ''
            : Array.isArray(data.detail)
              ? data.detail.map(String).join('; ')
              : String(data.detail);
        setHint((data.error ?? detail) || `Login failed (${res.status})`);
        return;
      }
      if (!data.user_data) {
        setHintKind('error');
        setHint('Login succeeded but no session was returned. Check backend logs.');
        return;
      }
      onSessionReady({ user_data: data.user_data, base_url: data.base_url ?? null });
      const n = data.devices?.length ?? 0;
      setHintKind('success');
      setHint(
        n > 0
          ? `Connected — ${n} vacuum${n === 1 ? '' : 's'} on this account. Click Save instance to finish.`
          : 'Connected. Click Save instance to finish.',
      );
      setCode('');
    } catch (e) {
      setHintKind('error');
      const msg = e instanceof Error ? e.message : String(e);
      setHint(
        msg.includes('Failed to fetch') || msg.includes('NetworkError')
          ? `Could not reach the API at ${api}. Is the backend running? (${msg})`
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const hintColor =
    hintKind === 'success'
      ? 'var(--color-success)'
      : hintKind === 'error'
        ? 'var(--color-danger)'
        : 'var(--color-text-muted)';

  return (
    <div
      className="space-y-3 rounded-lg border px-3 py-3"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
    >
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Same flow as Home Assistant: we email you a code, then prefer LAN control when possible. The backend
        starts the bridge and installs its Python packages automatically the first time (Python 3.9+ on the
        server; 3.11+ recommended for floor-plan maps). The first startup after an update may take a few
        minutes while dependencies install.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void sendCode()}
          className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium border transition-colors"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
          Send verification code
        </button>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Verification code
        </label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="From email"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        />
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void connect()}
        className="w-full rounded-md px-3 py-2 text-xs font-medium transition-colors"
        style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
      >
        {busy ? 'Connecting…' : 'Connect & store session'}
      </button>
      {hint && (
        <p className="text-xs rounded-md border px-2 py-2" role="status" style={{ color: hintColor, borderColor: 'var(--color-border)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
