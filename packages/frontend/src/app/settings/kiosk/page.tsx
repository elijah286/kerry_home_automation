'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import {
  ArrowLeft, Tablet, Copy, Check, ChevronDown, ChevronRight,
  Monitor, Apple, Terminal,
} from 'lucide-react';

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--color-bg)' }}>
      {label && (
        <div className="px-3 py-1.5 text-xs font-mono border-b" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}>
          {label}
        </div>
      )}
      <div className="flex items-start gap-2 p-3">
        <pre className="flex-1 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all" style={{ color: 'var(--color-text)' }}>
          {code}
        </pre>
        <button
          type="button"
          onClick={() => { void navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-hover)]"
          aria-label="Copy"
        >
          {copied
            ? <Check className="h-3.5 w-3.5" style={{ color: 'var(--color-success, #22c55e)' }} />
            : <Copy className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />}
        </button>
      </div>
    </div>
  );
}

function StepItem({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
      >
        {n}
      </div>
      <div className="flex-1 space-y-2">
        <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{title}</p>
        <div className="text-xs space-y-2" style={{ color: 'var(--color-text-secondary)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, defaultOpen = false, children }: {
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center gap-3 text-left"
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
        >
          <Icon className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <span className="flex-1 text-sm font-medium">{title}</span>
        {open
          ? <ChevronDown className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
          : <ChevronRight className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />}
      </button>
      {open && <div className="mt-4 space-y-4">{children}</div>}
    </Card>
  );
}

export default function KioskSettingsPage() {
  const router = useRouter();
  const [serverUrl, setServerUrl] = useState('http://192.168.1.10:3001');

  const buildCmd = `cd packages/frontend\nCAPACITOR_SERVER_URL=${serverUrl} npm run build:mobile:sync`;
  const adbDeviceOwner = `adb shell dpm set-device-owner com.ha.dashboard/.KioskDeviceAdminReceiver`;
  const adbExitKiosk = `adb shell dpm remove-active-admin com.ha.dashboard/.KioskDeviceAdminReceiver`;

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
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}
        >
          <Tablet className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Kiosk &amp; Display</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Set up a wall-mounted tablet that runs HomeOS full-screen with always-on wake word support.
          </p>
        </div>
      </div>

      <Card>
        <h2 className="text-sm font-medium mb-2">How it works</h2>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          The HomeOS kiosk app is a Capacitor-based native shell that points its WebView directly at your
          HomeOS server URL. You build it once, install it on your tablet, and all future updates to the
          web interface are reflected instantly — no app rebuild needed.
        </p>
        <ul className="mt-3 space-y-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <li>✦ Full-screen WebView — no browser chrome, no address bar</li>
          <li>✦ Auto-launches on device boot</li>
          <li>✦ Screen stays on permanently (no sleep)</li>
          <li>✦ Locked to HomeOS only (Android kiosk mode / iOS Guided Access)</li>
          <li>✦ Wake word listening runs continuously</li>
        </ul>
      </Card>

      <Card>
        <h2 className="text-sm font-medium mb-1">HomeOS Server URL</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          The LAN address of your HomeOS server. The kiosk tablet must be on the same network.
        </p>
        <input
          type="url"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder="http://192.168.1.10:3001"
          className="w-full max-w-sm rounded-lg border px-3 py-2 text-sm font-mono transition-colors"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
        />
        <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          This generates the build commands below. Change it to match your server&apos;s IP.
        </p>
      </Card>

      <CollapsibleSection title="Android Setup" icon={Monitor} defaultOpen>
        <div className="space-y-4">
          <StepItem n={1} title="Prerequisites">
            <ul className="list-disc ml-4 space-y-0.5">
              <li>Android Studio (includes ADB)</li>
              <li>Java 17+</li>
              <li>Node.js 20+</li>
            </ul>
          </StepItem>
          <StepItem n={2} title="Build the app">
            <p>Run from the repo root:</p>
            <CodeBlock code={buildCmd} label="Terminal" />
            <p>Then open Android Studio:</p>
            <CodeBlock code="cd packages/frontend && npm run cap:open:android" label="Terminal" />
            <p>Build → Generate Signed APK (or run directly on a connected tablet).</p>
          </StepItem>
          <StepItem n={3} title="Install on the tablet">
            <p>Connect the tablet via USB (enable USB debugging in Developer Options):</p>
            <CodeBlock code="adb install -r app-release.apk" label="Terminal" />
          </StepItem>
          <StepItem n={4} title="Enable kiosk (Lock Task) mode — one time only">
            <p>Run once after installing to pin the app full-screen:</p>
            <CodeBlock code={adbDeviceOwner} label="Terminal" />
            <p>After this, the app automatically enters kiosk mode on every launch. Home/back/recents are disabled.</p>
          </StepItem>
          <StepItem n={5} title="Verify">
            <ul className="list-disc ml-4 space-y-0.5">
              <li>App opens automatically on boot</li>
              <li>Screen stays on permanently</li>
              <li>Home/back/recents buttons are disabled</li>
              <li>HomeOS loads from <span className="font-mono">{serverUrl}</span></li>
            </ul>
          </StepItem>
          <div
            className="rounded-lg p-3 text-xs"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-warning, #f59e0b) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 30%, transparent)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <p className="font-medium mb-2" style={{ color: 'var(--color-warning, #f59e0b)' }}>
              Exiting kiosk mode (for maintenance)
            </p>
            <CodeBlock code={adbExitKiosk} />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="iPad Setup (iOS)" icon={Apple}>
        <div className="space-y-4">
          <StepItem n={1} title="Prerequisites">
            <ul className="list-disc ml-4 space-y-0.5">
              <li>Mac with Xcode 15+</li>
              <li>Apple Developer account</li>
              <li>Node.js 20+</li>
            </ul>
          </StepItem>
          <StepItem n={2} title="Build the app">
            <CodeBlock code={buildCmd} label="Terminal" />
            <CodeBlock code="cd packages/frontend && npm run cap:open:ios" label="Terminal" />
            <p>Select your iPad as the target and click Run (▶).</p>
          </StepItem>
          <StepItem n={3} title="Keep screen on">
            <p>The app disables the idle timer automatically. Also set Settings → Display &amp; Brightness → Auto-Lock → Never.</p>
          </StepItem>
          <StepItem n={4} title="Enable Guided Access (kiosk lockdown)">
            <ol className="list-decimal ml-4 space-y-0.5">
              <li>Settings → Accessibility → Guided Access → turn <strong>On</strong></li>
              <li>Set a Guided Access passcode</li>
              <li>Open the HomeOS app</li>
              <li>Triple-click the side (or home) button → tap <strong>Start</strong></li>
            </ol>
          </StepItem>
          <StepItem n={5} title="Auto-launch on boot">
            <p>iOS requires MDM for true auto-launch. For home use, simply re-open the app after restart, or use Apple Configurator 2.</p>
          </StepItem>
        </div>
      </CollapsibleSection>

      <Card>
        <div className="flex items-start gap-3">
          <Terminal className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
          <div>
            <p className="text-sm font-medium mb-1">Configure the wake word</p>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Set the phrase in{' '}
              <button
                type="button"
                onClick={() => router.push('/settings/llm')}
                style={{ color: 'var(--color-accent)' }}
                className="underline"
              >
                Settings → LLM Integration → Wake Word
              </button>
              . Default is &ldquo;hey home&rdquo;. Then open the assistant panel and click the{' '}
              <strong>ear icon</strong> to enable always-on listening.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
